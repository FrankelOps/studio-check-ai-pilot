// ============================================================
// SHEET INDEX TABLE COMPONENT
// Displays sheet metadata extracted from PDF
// ============================================================

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileText, AlertTriangle, Eye, Cpu, HelpCircle, LayoutTemplate, Bug } from 'lucide-react';
import type { SheetIndexRow, SheetKind, ExtractionSource } from '@/lib/analysis/types';
import { SheetDebugModal } from './SheetDebugModal';

interface SheetIndexTableProps {
  sheets: SheetIndexRow[];
  loading?: boolean;
}

export function SheetIndexTable({ sheets, loading }: SheetIndexTableProps) {
  const [debugSheet, setDebugSheet] = useState<SheetIndexRow | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Sheet Index
          </CardTitle>
          <CardDescription>Building sheet index...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            <span className="text-sm">Extracting sheet information...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sheets.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Sheet Index
          </CardTitle>
          <CardDescription>No sheets indexed yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Upload and analyze a PDF to build the sheet index.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getKindBadge = (kind: SheetKind) => {
    const colors: Record<SheetKind, string> = {
      plan: 'bg-blue-50 text-blue-700 border-blue-200',
      rcp: 'bg-purple-50 text-purple-700 border-purple-200',
      schedule: 'bg-green-50 text-green-700 border-green-200',
      detail: 'bg-amber-50 text-amber-700 border-amber-200',
      legend: 'bg-slate-50 text-slate-700 border-slate-200',
      general: 'bg-slate-50 text-slate-700 border-slate-200',
      unknown: 'bg-red-50 text-red-400 border-red-200',
    };

    return (
      <Badge variant="outline" className={colors[kind]}>
        {kind.toUpperCase()}
      </Badge>
    );
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return 'text-green-600';
    if (confidence >= 0.30) return 'text-amber-600';
    return 'text-red-500';
  };

  const getExtractionSourceDisplay = (source: ExtractionSource) => {
    switch (source) {
      case 'vector_text':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-blue-500" />
                <span className="text-xs text-blue-500">Text</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Extracted from vector text layer</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'vision_titleblock':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <Eye className="h-3 w-3 text-purple-500" />
                <span className="text-xs text-purple-500">Vision</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Extracted via AI vision (title block scan)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'template_fields':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <LayoutTemplate className="h-3 w-3 text-green-500" />
                <span className="text-xs text-green-500">Template</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Extracted via calibrated title block template</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'fail_crop':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-xs text-red-500">Crop</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Crop localization failed (stored for debugging)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">?</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Extraction source unknown</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
    }
  };

  const indexedCount = sheets.filter(s => s.sheet_number).length;
  const avgConfidence = sheets.length > 0
    ? sheets.reduce((sum, s) => sum + s.confidence, 0) / sheets.length
    : 0;
  const visionCount = sheets.filter(s => s.extraction_source === 'vision_titleblock').length;
  const templateCount = sheets.filter(s => s.extraction_source === 'template_fields').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Sheet Index
            </CardTitle>
            <CardDescription>
              {indexedCount} of {sheets.length} sheets identified • 
              {' '}Avg confidence: {Math.round(avgConfidence * 100)}%
              {templateCount > 0 && (
                <span className="ml-2 text-green-600">
                  • {templateCount} via template
                </span>
              )}
              {visionCount > 0 && (
                <span className="ml-2 text-purple-600">
                  • {visionCount} via vision
                </span>
              )}
            </CardDescription>
          </div>
          {indexedCount < sheets.length * 0.9 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Low Coverage
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="w-24">Sheet #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Discipline</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-20 text-right">Confidence</TableHead>
                  <TableHead className="w-10 text-center">Src</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheets.map((sheet) => (
                  <TableRow key={sheet.source_index} className={!sheet.sheet_number ? 'bg-red-50/30' : ''}>
                    <TableCell className="text-xs text-muted-foreground">
                      {sheet.source_index}
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {sheet.sheet_number || (
                        <span className="text-red-400 italic">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {sheet.sheet_title && sheet.sheet_title.replace(/[^a-zA-Z]/g, '').length >= 4 ? (
                        sheet.sheet_title
                      ) : sheet.sheet_title ? (
                        <span className="text-amber-500 italic">{sheet.sheet_title}</span>
                      ) : (
                        <span className="text-muted-foreground italic">No title</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sheet.discipline || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getKindBadge(sheet.sheet_kind)}</TableCell>
                    <TableCell className={`text-right font-medium ${getConfidenceColor(sheet.confidence)}`}>
                      {Math.round(sheet.confidence * 100)}%
                    </TableCell>
                    <TableCell className="text-center">
                      {getExtractionSourceDisplay(sheet.extraction_source)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          setDebugSheet(sheet);
                          setDebugOpen(true);
                        }}
                      >
                        <Bug className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <SheetDebugModal
          sheet={debugSheet}
          open={debugOpen}
          onOpenChange={setDebugOpen}
        />
      </CardContent>
    </Card>
  );
}
