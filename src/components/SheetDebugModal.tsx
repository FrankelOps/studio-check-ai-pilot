// ============================================================
// SHEET DEBUG MODAL COMPONENT v3.0
// Shows detailed debug preview: labels, clusters, anchored regions, fallback path
// ============================================================

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import type { SheetIndexRow, ExtractionSource } from '@/lib/analysis/types';
import { Cpu, Eye, LayoutTemplate, HelpCircle, CheckCircle2, XCircle, AlertTriangle, Tag, Layers, Target, Route, Clock } from 'lucide-react';

interface SheetDebugModalProps {
  sheet: SheetIndexRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SheetDebugModal({ sheet, open, onOpenChange }: SheetDebugModalProps) {
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sheet || !open) {
      setRenderUrl(null);
      setCropUrl(null);
      return;
    }

    async function loadImages() {
      setLoading(true);
      try {
        if (sheet.sheet_render_asset_path) {
          const { data: renderData } = await supabase.storage
            .from('project-files')
            .createSignedUrl(sheet.sheet_render_asset_path, 3600);
          if (renderData?.signedUrl) {
            setRenderUrl(renderData.signedUrl);
          }
        }

        const cropPath = (sheet as any).crop_asset_path || sheet.title_block_asset_path;
        if (cropPath) {
          const { data: cropData } = await supabase.storage
            .from('project-files')
            .createSignedUrl(cropPath, 3600);
          if (cropData?.signedUrl) {
            setCropUrl(cropData.signedUrl);
          }
        }
      } catch (error) {
        console.error('Failed to load debug images:', error);
      } finally {
        setLoading(false);
      }
    }

    loadImages();
  }, [sheet, open]);

  if (!sheet) return null;

  const notes = sheet.extraction_notes || {};
  const labelHits = notes.label_hits as Array<{ text: string; label_type: string; weight: number; bbox: { x: number; y: number; w: number; h: number } }> | undefined;
  const clusters = notes.clusters as Array<{ bbox: { x: number; y: number; w: number; h: number }; score: number; members: string[]; why_selected?: string }> | undefined;
  const anchoredRegions = notes.anchored_regions as Array<{ region_type: string; label_used: string; bbox: { x: number; y: number; w: number; h: number }; candidates: string[]; chosen: string | null; pass: boolean; rejection_reason?: string }> | undefined;
  const fallbackPath = notes.fallback_path as string[] | undefined;
  const timingMs = notes.timing_ms as number | undefined;
  const flagForReview = notes.flag_for_review as boolean | undefined;
  const manualFlag = notes.manual_flag as boolean | undefined;
  const truncationSuspected = notes.truncation_suspected as boolean | undefined;
  const visionCalls = notes.vision_calls as number | undefined;

  const cropValid = (sheet as any).crop_valid;
  const cropReason = (sheet as any).crop_reason || '';
  const cropStrategy = (sheet as any).crop_strategy || '';
  const attemptCount = (sheet as any).attempt_count ?? null;

  const getSourceIcon = (source: ExtractionSource) => {
    switch (source) {
      case 'vector_text':
        return <Cpu className="h-4 w-4 text-blue-500" />;
      case 'vision_titleblock':
        return <Eye className="h-4 w-4 text-purple-500" />;
      case 'template_fields':
        return <LayoutTemplate className="h-4 w-4 text-green-500" />;
      case 'fail_crop':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return 'text-green-600';
    if (confidence >= 0.30) return 'text-amber-600';
    return 'text-red-500';
  };

  const getLabelTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'number': 'bg-blue-100 text-blue-800',
      'title': 'bg-purple-100 text-purple-800',
      'moderate': 'bg-amber-100 text-amber-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Sheet Debug: Index {sheet.source_index}
            {sheet.sheet_number && (
              <Badge variant="outline" className="font-mono">
                {sheet.sheet_number}
              </Badge>
            )}
            {flagForReview && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                Needs Review
              </Badge>
            )}
            {manualFlag && (
              <Badge variant="destructive">
                Manual Required
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Full Render */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Full Render</h4>
            <div className="border rounded-lg overflow-hidden bg-slate-50 min-h-[200px] flex items-center justify-center">
              {loading ? (
                <div className="animate-pulse text-muted-foreground">Loading...</div>
              ) : renderUrl ? (
                <img src={renderUrl} alt="Sheet render" className="max-w-full max-h-[300px] object-contain" />
              ) : (
                <span className="text-muted-foreground text-sm">No render available</span>
              )}
            </div>
          </div>

          {/* Crop Used */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">Crop Used</h4>
              {cropValid === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {cropValid === false && <XCircle className="h-4 w-4 text-red-500" />}
              {cropStrategy && (
                <Badge variant="outline" className="text-xs font-mono">
                  {cropStrategy}
                </Badge>
              )}
            </div>
            <div className="border rounded-lg overflow-hidden bg-slate-50 min-h-[200px] flex items-center justify-center">
              {loading ? (
                <div className="animate-pulse text-muted-foreground">Loading...</div>
              ) : cropUrl ? (
                <img src={cropUrl} alt="Crop used" className="max-w-full max-h-[300px] object-contain" />
              ) : (
                <span className="text-muted-foreground text-sm">No crop available</span>
              )}
            </div>
            {cropReason && (
              <p className="text-xs text-muted-foreground">{cropReason}</p>
            )}
          </div>
        </div>

        {/* Extracted Values */}
        <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
          <h4 className="text-sm font-medium">Extracted Values</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Sheet Number</label>
              <div className="font-mono font-medium">
                {sheet.sheet_number || <span className="text-red-400 italic">NULL</span>}
              </div>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground">Discipline</label>
              <div>{sheet.discipline || <span className="text-muted-foreground">—</span>}</div>
            </div>
            
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                Sheet Title
                {truncationSuspected && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">
                    Truncation?
                  </Badge>
                )}
              </label>
              <div>
                {sheet.sheet_title || <span className="text-muted-foreground italic">NULL</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Source:</span>
              {getSourceIcon(sheet.extraction_source)}
              <span className="text-sm">{sheet.extraction_source}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence:</span>
              <span className={`font-medium ${getConfidenceColor(sheet.confidence)}`}>
                {Math.round(sheet.confidence * 100)}%
              </span>
            </div>

            {attemptCount !== null && attemptCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Attempts:</span>
                <span className="text-sm">{attemptCount}</span>
              </div>
            )}

            {visionCalls !== undefined && visionCalls > 0 && (
              <div className="flex items-center gap-2">
                <Eye className="h-3 w-3 text-purple-500" />
                <span className="text-xs">{visionCalls} vision calls</span>
              </div>
            )}

            {timingMs !== undefined && (
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{timingMs}ms</span>
              </div>
            )}
          </div>
        </div>

        {/* Debug Details Accordion */}
        <Accordion type="multiple" className="w-full">
          {/* Label Hits */}
          {labelHits && labelHits.length > 0 && (
            <AccordionItem value="labels">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Label Hits ({labelHits.length})
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {labelHits.map((hit, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge className={getLabelTypeBadge(hit.label_type)}>
                        {hit.label_type} (w={hit.weight})
                      </Badge>
                      <span className="font-mono">{hit.text}</span>
                      <span className="text-xs text-muted-foreground">
                        @ ({Math.round(hit.bbox.x)}, {Math.round(hit.bbox.y)})
                      </span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Clusters */}
          {clusters && clusters.length > 0 && (
            <AccordionItem value="clusters">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Clusters ({clusters.length})
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {clusters.map((cluster, i) => (
                    <div key={i} className={`p-2 rounded border ${cluster.why_selected ? 'border-green-300 bg-green-50' : 'border-slate-200'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">Cluster {i}</span>
                        <span className="text-xs text-muted-foreground">score={cluster.score.toFixed(2)}</span>
                        {cluster.why_selected && (
                          <Badge variant="default" className="text-xs">Selected</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        bbox: ({Math.round(cluster.bbox.x)}, {Math.round(cluster.bbox.y)}, {Math.round(cluster.bbox.w)}x{Math.round(cluster.bbox.h)})
                      </div>
                      <div className="text-xs mt-1">
                        Members: {cluster.members.join(', ')}
                      </div>
                      {cluster.why_selected && (
                        <div className="text-xs text-green-700 mt-1">
                          Why: {cluster.why_selected}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Anchored Regions */}
          {anchoredRegions && anchoredRegions.length > 0 && (
            <AccordionItem value="regions">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Anchored Regions ({anchoredRegions.length})
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {anchoredRegions.map((region, i) => (
                    <div key={i} className={`p-2 rounded border text-sm ${region.pass ? 'border-green-200 bg-green-50' : 'border-slate-200'}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {region.region_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">from: {region.label_used}</span>
                        {region.pass ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-400" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Candidates: {region.candidates.length > 0 ? region.candidates.slice(0, 5).join(', ') : '(none)'}
                        {region.candidates.length > 5 && ` +${region.candidates.length - 5} more`}
                      </div>
                      {region.chosen && (
                        <div className="text-xs text-green-700 mt-1">
                          Chosen: <span className="font-mono">{region.chosen}</span>
                        </div>
                      )}
                      {region.rejection_reason && (
                        <div className="text-xs text-red-600 mt-1">
                          Rejected: {region.rejection_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Fallback Path */}
          {fallbackPath && fallbackPath.length > 0 && (
            <AccordionItem value="fallback">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  Fallback Path ({fallbackPath.length} steps)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-wrap gap-1">
                  {fallbackPath.map((step, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-mono">
                      {i + 1}. {step}
                    </Badge>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Raw Extraction Notes */}
          <AccordionItem value="raw">
            <AccordionTrigger className="text-sm">
              Raw Extraction Notes
            </AccordionTrigger>
            <AccordionContent>
              <pre className="text-xs bg-slate-100 rounded p-2 overflow-x-auto max-h-[200px]">
                {JSON.stringify(notes, null, 2)}
              </pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
