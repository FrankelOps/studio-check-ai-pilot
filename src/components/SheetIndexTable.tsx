// ============================================================
// SHEET INDEX TABLE COMPONENT
// Displays sheet metadata extracted from PDF
// ============================================================

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, AlertTriangle } from 'lucide-react';
import type { SheetIndexRow, SheetKind } from '@/lib/analysis/types';

interface SheetIndexTableProps {
  sheets: SheetIndexRow[];
  loading?: boolean;
}

export function SheetIndexTable({ sheets, loading }: SheetIndexTableProps) {
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
    if (confidence >= 0.6) return 'text-amber-600';
    return 'text-red-500';
  };

  const indexedCount = sheets.filter(s => s.sheet_number).length;
  const avgConfidence = sheets.length > 0
    ? sheets.reduce((sum, s) => sum + s.confidence, 0) / sheets.length
    : 0;

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
                  <TableHead className="w-24">Sheet #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Discipline</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-20 text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheets.map((sheet) => (
                  <TableRow key={sheet.source_index} className={!sheet.sheet_number ? 'bg-red-50/30' : ''}>
                    <TableCell className="font-mono font-medium">
                      {sheet.sheet_number || (
                        <span className="text-red-400 italic">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {sheet.sheet_title || (
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
