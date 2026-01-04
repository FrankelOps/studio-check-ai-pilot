// ============================================================
// SHEET DEBUG MODAL COMPONENT
// Shows debug preview of sheet extraction: render, crop, extracted values
// ============================================================

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import type { SheetIndexRow, ExtractionSource } from '@/lib/analysis/types';
import { Cpu, Eye, LayoutTemplate, HelpCircle, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

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
        // Load render image
        if (sheet.sheet_render_asset_path) {
          const { data: renderData } = await supabase.storage
            .from('project-files')
            .createSignedUrl(sheet.sheet_render_asset_path, 3600);
          if (renderData?.signedUrl) {
            setRenderUrl(renderData.signedUrl);
          }
        }

        // Load crop image (crop_asset_path or title_block_asset_path)
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

  const getSourceIcon = (source: ExtractionSource) => {
    switch (source) {
      case 'vector_text':
        return <Cpu className="h-4 w-4 text-blue-500" />;
      case 'vision_titleblock':
        return <Eye className="h-4 w-4 text-purple-500" />;
      case 'template_fields':
        return <LayoutTemplate className="h-4 w-4 text-green-500" />;
      default:
        return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return 'text-green-600';
    if (confidence >= 0.6) return 'text-amber-600';
    return 'text-red-500';
  };

  const cropValid = (sheet as any).crop_valid;
  const cropReason = (sheet as any).crop_reason || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Sheet Debug: Index {sheet.source_index}
            {sheet.sheet_number && (
              <Badge variant="outline" className="font-mono">
                {sheet.sheet_number}
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
                <img
                  src={renderUrl}
                  alt="Sheet render"
                  className="max-w-full max-h-[300px] object-contain"
                />
              ) : (
                <span className="text-muted-foreground text-sm">No render available</span>
              )}
            </div>
          </div>

          {/* Crop Used for Extraction */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">Crop Used for Extraction</h4>
              {cropValid === true && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {cropValid === false && (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className="border rounded-lg overflow-hidden bg-slate-50 min-h-[200px] flex items-center justify-center">
              {loading ? (
                <div className="animate-pulse text-muted-foreground">Loading...</div>
              ) : cropUrl ? (
                <img
                  src={cropUrl}
                  alt="Crop used"
                  className="max-w-full max-h-[300px] object-contain"
                />
              ) : (
                <span className="text-muted-foreground text-sm">No crop available</span>
              )}
            </div>
            {cropReason && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {cropReason}
              </p>
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
                {sheet.sheet_number || <span className="text-red-400 italic">Not found</span>}
              </div>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground">Discipline</label>
              <div>{sheet.discipline || <span className="text-muted-foreground">—</span>}</div>
            </div>
            
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Sheet Title</label>
              <div>
                {sheet.sheet_title || <span className="text-muted-foreground italic">No title</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t">
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
          </div>

          {/* Extraction Notes */}
          {sheet.extraction_notes && Object.keys(sheet.extraction_notes).length > 0 && (
            <div className="pt-2 border-t">
              <label className="text-xs text-muted-foreground">Extraction Notes</label>
              <pre className="text-xs bg-slate-100 rounded p-2 mt-1 overflow-x-auto">
                {JSON.stringify(sheet.extraction_notes, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
