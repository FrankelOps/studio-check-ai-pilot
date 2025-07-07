import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AnalysisChatProps {
  projectId: string;
}

interface ChatMessage {
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AnalysisChat({ projectId }: AnalysisChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      type: 'user',
      content: question.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setQuestion('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat-analysis', {
        body: { question: userMessage.content, projectId }
      });

      if (error) throw error;

      if (data.success) {
        const assistantMessage: ChatMessage = {
          type: 'assistant',
          content: data.answer,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        variant: "destructive",
        title: "Chat Error",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-lg border-2 border-primary/20 bg-white/95 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4" />
          Ask Questions About Your Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chat Messages */}
        <div className="max-h-64 overflow-y-auto space-y-2">
          {messages.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Ask questions about your analysis results</p>
              <p className="text-xs mt-1 text-slate-400">
                e.g., "What are the highest risk issues?"
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`p-2 rounded-lg text-sm ${
                  message.type === 'user'
                    ? 'bg-blue-50 border-l-2 border-blue-400 ml-4'
                    : 'bg-slate-50 border-l-2 border-slate-400 mr-4'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-xs">
                    {message.type === 'user' ? 'You' : 'AI'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
              </div>
            ))
          )}
          {isLoading && (
            <div className="bg-slate-50 border-l-2 border-slate-400 mr-4 p-2 rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs text-slate-600">AI is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your analysis results..."
            className="min-h-[60px] resize-none text-sm"
            disabled={isLoading}
          />
          <Button
            type="submit"
            disabled={!question.trim() || isLoading}
            className="w-full h-8 text-sm"
            size="sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                Asking...
              </>
            ) : (
              <>
                <Send className="h-3 w-3 mr-2" />
                Ask Question
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}