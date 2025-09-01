export type Severity = 'error' | 'warn' | 'info';

export interface QAFinding {
  module_id: string;          // e.g. "title-block"
  rule_id: string;            // e.g. "TB-001"
  page_number: number | null;
  severity: Severity;
  message: string;
  evidence: {
    ocr_engine?: string;      // "pdfco-ocr" | "tesseract" | etc.
    bbox?: { x: number; y: number; w: number; h: number }; // crop region (pixels or normalized)
    text_sample?: string;     // short excerpt that triggered the rule
    page_image_url?: string;  // image that was OCR'd
    notes?: Record<string, unknown>;
  };
}

export interface QAModuleInput {
  analysisId: string;         // ties to analysis_results.id
  fileUrl: string;            // signed URL to the PDF
  pages?: number[];           // optional page subset
}

export interface QAModule {
  id: string;                 // "title-block"
  label: string;              // "Title Block Integrity"
  run(input: QAModuleInput): Promise<QAFinding[]>;
}
