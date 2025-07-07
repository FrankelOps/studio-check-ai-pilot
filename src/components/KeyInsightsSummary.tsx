import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface KeyInsightsSummaryProps {
  designLogId: string;
  summaryOutline?: string | null;
  userRole?: string;
  onSummaryUpdate?: (newSummary: string) => void;
}

export function KeyInsightsSummary({ 
  designLogId, 
  summaryOutline, 
  userRole,
  onSummaryUpdate 
}: KeyInsightsSummaryProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [currentSummary, setCurrentSummary] = useState(summaryOutline);
  const { toast } = useToast();

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('regenerate-summary', {
        body: { designLogId }
      });

      if (error) throw error;

      if (data.success) {
        setCurrentSummary(data.summary_outline);
        onSummaryUpdate?.(data.summary_outline);
        toast({
          title: "Summary regenerated",
          description: "Key insights have been updated with fresh analysis.",
        });
      } else {
        throw new Error(data.error || 'Failed to regenerate summary');
      }
    } catch (error: any) {
      console.error('Error regenerating summary:', error);
      toast({
        variant: "destructive",
        title: "Regeneration failed",
        description: error.message,
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!currentSummary) {
    return (
      <Card className="border-l-4 border-l-purple-400 bg-purple-50/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-purple-700">No key insights generated yet</span>
            </div>
            {userRole === 'admin' && (
              <Button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                variant="outline"
                size="sm"
                className="text-purple-700 border-purple-300 hover:bg-purple-100"
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Lightbulb className="h-3 w-3 mr-2" />
                    Generate Insights
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format the summary into bullet points if it's not already formatted
  const formatSummary = (summary: string) => {
    if (summary.includes('•') || summary.includes('-')) {
      return summary;
    }
    // Split by periods and convert to bullet points
    return summary
      .split('.')
      .filter(line => line.trim().length > 10)
      .map(line => `• ${line.trim()}`)
      .join('\n');
  };

  return (
    <Card className="border-l-4 border-l-purple-400 bg-purple-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <Lightbulb className="h-5 w-5" />
            Key Insights
          </CardTitle>
          {userRole === 'admin' && (
            <Button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              variant="outline"
              size="sm"
              className="text-purple-700 border-purple-300 hover:bg-purple-100"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Regenerate
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="prose prose-sm max-w-none">
          <div className="text-slate-700 whitespace-pre-line leading-relaxed">
            {formatSummary(currentSummary)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}