import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EmbeddingManagerProps {
  projectId: string;
}

export function EmbeddingManager({ projectId }: EmbeddingManagerProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const { toast } = useToast();

  const generateEmbeddings = async (forceRegenerate = false) => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-embeddings', {
        body: { projectId, forceRegenerate }
      });

      if (error) throw error;

      setLastResult(data);
      toast({
        title: "Embeddings Generated",
        description: `Processed ${data.processed} entries, skipped ${data.skipped} existing ones.`,
      });
    } catch (error: any) {
      console.error('Error generating embeddings:', error);
      toast({
        variant: "destructive",
        title: "Error generating embeddings",
        description: error.message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Semantic Search Setup
        </CardTitle>
        <CardDescription>
          Generate embeddings for faster, more relevant chat responses using AI semantic search.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={() => generateEmbeddings(false)}
            disabled={isGenerating}
            className="flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Generate Embeddings
              </>
            )}
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => generateEmbeddings(true)}
            disabled={isGenerating}
          >
            Force Regenerate
          </Button>
        </div>

        {lastResult && (
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-sm">Last Generation Result</span>
            </div>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline" className="text-green-700">
                {lastResult.processed} Processed
              </Badge>
              <Badge variant="outline" className="text-blue-700">
                {lastResult.skipped} Skipped
              </Badge>
              <Badge variant="outline" className="text-slate-700">
                {lastResult.total} Total
              </Badge>
            </div>
          </div>
        )}

        <div className="text-xs text-slate-600 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-blue-800">Phase 1 Implementation Active</p>
              <p className="mt-1">
                Semantic search with embeddings is now enabled. The chat will automatically use 
                similarity matching to find the most relevant transcript content for your questions.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}