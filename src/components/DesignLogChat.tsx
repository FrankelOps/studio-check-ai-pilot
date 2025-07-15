import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, Loader2, Calendar, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DesignLogChatProps {
  projectId: string;
}

interface ChatMessage {
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: TranscriptSource[];
}

interface TranscriptSource {
  meeting_title: string;
  meeting_date: string;
  hasTranscript: boolean;
}

export function DesignLogChat({ projectId }: DesignLogChatProps) {
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
      const { data, error } = await supabase.functions.invoke('chat-designlog', {
        body: { question: userMessage.content, projectId }
      });

      if (error) throw error;

      if (data.success) {
        const assistantMessage: ChatMessage = {
          type: 'assistant',
          content: data.answer,
          timestamp: new Date(),
          sources: data.sources || []
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
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Decision Q&A
        </CardTitle>
        <p className="text-sm text-slate-600">
          Ask the AI about design rationale, past decisions, or requirements based on meeting transcripts and design logs.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chat Messages */}
        <div className="max-h-64 overflow-y-auto space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Ask questions about your design decisions</p>
              <p className="text-xs mt-1 text-slate-400">
                e.g., "Why did we choose a two-column layout for the profile page?"
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  message.type === 'user'
                    ? 'bg-blue-50 border-l-4 border-blue-400 ml-4'
                    : 'bg-slate-50 border-l-4 border-slate-400 mr-4'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-sm">
                    {message.type === 'user' ? 'You' : 'AI'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
                {message.type === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-3 w-3 text-slate-500" />
                      <span className="text-xs font-medium text-slate-600">Sources:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {message.sources.map((source, sourceIndex) => (
                        <Badge key={sourceIndex} variant="secondary" className="text-xs">
                          <Calendar className="h-3 w-3 mr-1" />
                          {source.meeting_title} ({new Date(source.meeting_date).toLocaleDateString()})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="bg-slate-50 border-l-4 border-slate-400 mr-4 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-slate-600">AI is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., 'Why did we choose a two-column layout for the profile page?'"
            className="min-h-[80px] resize-none"
            disabled={isLoading}
          />
          <Button
            type="submit"
            disabled={!question.trim() || isLoading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-800"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Asking...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Ask AI
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}