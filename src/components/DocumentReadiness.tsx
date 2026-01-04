// ============================================================
// DOCUMENT READINESS DISPLAY COMPONENT
// Shows preflight status and quality flags
// ============================================================

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, XCircle, Info, AlertCircle } from 'lucide-react';
import type { PreflightReport, PreflightFlag } from '@/lib/analysis/types';

interface DocumentReadinessProps {
  report: PreflightReport | null;
  loading?: boolean;
}

export function DocumentReadiness({ report, loading }: DocumentReadinessProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Document Readiness</CardTitle>
          <CardDescription>Analyzing document quality...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            <span className="text-sm">Running preflight checks...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Document Readiness</CardTitle>
          <CardDescription>No preflight report available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Upload a PDF document to run preflight analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = () => {
    switch (report.status) {
      case 'PASS':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            PASS
          </Badge>
        );
      case 'PASS_WITH_LIMITATIONS':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            PASS WITH LIMITATIONS
          </Badge>
        );
      case 'FAIL':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            FAIL
          </Badge>
        );
    }
  };

  const getFlagIcon = (severity: PreflightFlag['severity']) => {
    switch (severity) {
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getFlagBgColor = (severity: PreflightFlag['severity']) => {
    switch (severity) {
      case 'info':
        return 'bg-blue-50 border-blue-200';
      case 'warn':
        return 'bg-amber-50 border-amber-200';
      case 'error':
        return 'bg-red-50 border-red-200';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Document Readiness</CardTitle>
            <CardDescription>
              {report.metrics.total_sheets} sheet{report.metrics.total_sheets !== 1 ? 's' : ''} analyzed
            </CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics summary */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Text Layer Coverage</p>
            <p className="text-lg font-semibold mt-1">
              {Math.round(report.metrics.text_layer_coverage_ratio * 100)}%
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Total Sheets</p>
            <p className="text-lg font-semibold mt-1">{report.metrics.total_sheets}</p>
          </div>
        </div>

        {/* Flags */}
        {report.flags.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Quality Flags</p>
            <div className="space-y-2">
              {report.flags.map((flag, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-2 p-2 rounded-lg border ${getFlagBgColor(flag.severity)}`}
                >
                  {getFlagIcon(flag.severity)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{flag.code.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{flag.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {report.recommendations.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Recommendations</p>
            <ul className="space-y-1">
              {report.recommendations.map((rec, index) => (
                <li key={index} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>{rec.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pass message */}
        {report.status === 'PASS' && report.flags.length === 0 && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm">Document is ready for analysis with optimal quality.</span>
          </div>
        )}

        {/* Fail blocking message */}
        {report.status === 'FAIL' && (
          <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Analysis blocked. Please address the issues above.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
