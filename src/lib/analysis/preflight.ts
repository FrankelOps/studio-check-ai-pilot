// ============================================================
// STUDIOCHECK PDF PREFLIGHT - STAGE 0
// Computes document readiness and quality flags
// ============================================================

import { supabase } from '@/integrations/supabase/client';
import type {
  PreflightStatus,
  PreflightFlag,
  PreflightRecommendation,
  PreflightMetrics,
  PreflightReport,
} from './types';

// PDF.js types
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(params: { scale: number }): { rotation: number };
}

interface PDFjsLib {
  getDocument(params: { data: ArrayBuffer }): { promise: Promise<PDFDocumentProxy> };
}

// Lazy load PDF.js
let pdfjsLib: PDFjsLib | null = null;

async function getPdfJs(): Promise<PDFjsLib> {
  if (pdfjsLib) return pdfjsLib;
  
  // Dynamic import for PDF.js
  const pdfjs = await import('pdfjs-dist');
  
  // Set worker (use CDN for simplicity in browser)
  const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  
  pdfjsLib = pdfjs as unknown as PDFjsLib;
  return pdfjsLib;
}

/**
 * Run PDF preflight analysis and persist results
 */
export async function runPdfPreflightAndPersist(params: {
  projectId: string;
  jobId: string;
  filePath: string;
}): Promise<PreflightReport> {
  const { projectId, jobId, filePath } = params;
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  // Download PDF bytes using authenticated download
  const { data: blob, error: downloadError } = await supabase.storage
    .from('project-files')
    .download(filePath);
  
  if (downloadError || !blob) {
    // PDF cannot be read - critical failure
    const report = createFailReport('DOWNLOAD_FAILED', 'Failed to download file for analysis');
    await persistReport(projectId, jobId, user.id, report);
    return report;
  }
  
  const arrayBuffer = await blob.arrayBuffer();
  
  try {
    const pdfjs = await getPdfJs();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    // Compute metrics
    const metrics = await computeMetrics(pdf);
    
    // Generate flags and recommendations
    const { flags, recommendations } = generateFlagsAndRecommendations(metrics);
    
    // Determine status
    const status = determineStatus(metrics, flags);
    
    const report: PreflightReport = {
      status,
      flags,
      recommendations,
      metrics,
    };
    
    await persistReport(projectId, jobId, user.id, report);
    return report;
    
  } catch (error) {
    console.error('PDF parsing error:', error);
    const report = createFailReport('PDF_PARSE_ERROR', 'Failed to parse PDF structure');
    await persistReport(projectId, jobId, user.id, report);
    return report;
  }
}

/**
 * Compute preflight metrics from PDF
 */
async function computeMetrics(pdf: PDFDocumentProxy): Promise<PreflightMetrics> {
  const totalSheets = pdf.numPages;
  let sheetsWithTextLayer = 0;
  let sheetsWithRotation = 0;
  
  // Sample pages (check all if <= 20, otherwise sample)
  const pagesToCheck = totalSheets <= 20 
    ? Array.from({ length: totalSheets }, (_, i) => i + 1)
    : [1, 2, 3, Math.floor(totalSheets / 2), totalSheets - 1, totalSheets];
  
  for (const pageNum of pagesToCheck) {
    if (pageNum < 1 || pageNum > totalSheets) continue;
    
    try {
      const page = await pdf.getPage(pageNum);
      
      // Check text layer
      const textContent = await page.getTextContent();
      if (textContent.items.length >= 30) {
        sheetsWithTextLayer++;
      }
      
      // Check rotation
      const viewport = page.getViewport({ scale: 1.0 });
      if (viewport.rotation !== 0) {
        sheetsWithRotation++;
      }
    } catch {
      // Page read error - skip
    }
  }
  
  const textLayerCoverageRatio = pagesToCheck.length > 0 
    ? sheetsWithTextLayer / pagesToCheck.length 
    : 0;
  
  return {
    total_sheets: totalSheets,
    text_layer_coverage_ratio: textLayerCoverageRatio,
    sheets_with_text_layer: sheetsWithTextLayer,
    sheets_with_rotation: sheetsWithRotation,
    encrypted_or_error: false,
  };
}

/**
 * Generate flags and recommendations based on metrics
 */
function generateFlagsAndRecommendations(metrics: PreflightMetrics): {
  flags: PreflightFlag[];
  recommendations: PreflightRecommendation[];
} {
  const flags: PreflightFlag[] = [];
  const recommendations: PreflightRecommendation[] = [];
  
  // Text layer coverage
  if (metrics.text_layer_coverage_ratio < 0.5) {
    flags.push({
      code: 'NO_TEXT_LAYER_MAJORITY',
      severity: 'error',
      message: `Only ${Math.round(metrics.text_layer_coverage_ratio * 100)}% of sheets have text layers. Document may be scanned/rasterized.`,
    });
    recommendations.push({
      code: 'EXPORT_VECTOR_PDF',
      message: 'Re-export from CAD/BIM as vector PDF with selectable text for best analysis results.',
    });
  } else if (metrics.text_layer_coverage_ratio < 0.85) {
    flags.push({
      code: 'MIXED_VECTOR_RASTER',
      severity: 'warn',
      message: `${Math.round(metrics.text_layer_coverage_ratio * 100)}% of sheets have text layers. Some sheets may be rasterized.`,
    });
    recommendations.push({
      code: 'RE_EXPORT_WITH_TEXT',
      message: 'Consider re-exporting mixed sheets as vector PDFs for improved text extraction.',
    });
  }
  
  // Rotation detected
  if (metrics.sheets_with_rotation > 0) {
    flags.push({
      code: 'ROTATION_DETECTED',
      severity: 'warn',
      message: `${metrics.sheets_with_rotation} sheet(s) have non-standard rotation.`,
    });
  }
  
  // Very large set
  if (metrics.total_sheets > 600) {
    flags.push({
      code: 'VERY_LARGE_SET',
      severity: 'warn',
      message: `Document contains ${metrics.total_sheets} sheets. Processing may take longer.`,
    });
    recommendations.push({
      code: 'SPLIT_SETS',
      message: 'Consider splitting into discipline-specific sets for faster processing.',
    });
  } else if (metrics.total_sheets > 250) {
    flags.push({
      code: 'LARGE_SET',
      severity: 'info',
      message: `Document contains ${metrics.total_sheets} sheets.`,
    });
  }
  
  // Empty document
  if (metrics.total_sheets === 0) {
    flags.push({
      code: 'EMPTY_DOCUMENT',
      severity: 'error',
      message: 'Document contains no sheets.',
    });
  }
  
  return { flags, recommendations };
}

/**
 * Determine preflight status based on metrics and flags
 */
function determineStatus(metrics: PreflightMetrics, flags: PreflightFlag[]): PreflightStatus {
  // Fail conditions
  if (metrics.encrypted_or_error) return 'FAIL';
  if (metrics.total_sheets === 0) return 'FAIL';
  if (flags.some(f => f.code === 'NO_TEXT_LAYER_MAJORITY' && f.severity === 'error')) return 'FAIL';
  
  // Pass with limitations
  if (flags.some(f => f.severity === 'warn' || f.severity === 'error')) {
    return 'PASS_WITH_LIMITATIONS';
  }
  
  // Pass if text layer coverage is good
  if (metrics.text_layer_coverage_ratio >= 0.85) return 'PASS';
  
  return 'PASS_WITH_LIMITATIONS';
}

/**
 * Create a fail report for error conditions
 */
function createFailReport(code: string, message: string): PreflightReport {
  return {
    status: 'FAIL',
    flags: [{
      code,
      severity: 'error',
      message,
    }],
    recommendations: [],
    metrics: {
      total_sheets: 0,
      text_layer_coverage_ratio: 0,
      sheets_with_text_layer: 0,
      sheets_with_rotation: 0,
      encrypted_or_error: true,
    },
  };
}

/**
 * Persist preflight report to database
 */
async function persistReport(
  projectId: string,
  jobId: string,
  createdBy: string,
  report: PreflightReport
): Promise<void> {
  const { error } = await supabase
    .from('analysis_preflight_reports' as any)
    .upsert({
      project_id: projectId,
      job_id: jobId,
      created_by: createdBy,
      status: report.status,
      flags: report.flags,
      recommendations: report.recommendations,
      metrics: report.metrics,
    }, {
      onConflict: 'job_id',
    });
  
  if (error) {
    console.error('Failed to persist preflight report:', error);
    throw new Error('Failed to save preflight report');
  }
}

/**
 * Fetch preflight report for a job
 */
export async function fetchPreflightReport(jobId: string): Promise<PreflightReport | null> {
  // Use raw query to avoid type issues with new table
  const { data, error } = await supabase
    .from('analysis_preflight_reports' as any)
    .select('*')
    .eq('job_id', jobId)
    .single();
  
  if (error || !data) return null;
  
  // Cast to any first to access properties
  const row = data as any;
  
  return {
    status: row.status as PreflightStatus,
    flags: row.flags as PreflightFlag[],
    recommendations: row.recommendations as PreflightRecommendation[],
    metrics: row.metrics as PreflightMetrics,
  };
}
