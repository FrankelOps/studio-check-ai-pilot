import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MessageSquare, Send, Loader2, Settings, ChevronDown, Zap, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ProjectMemoryChatProps {
  projectId: string;
}

interface ChatMessage {
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function ProjectMemoryChat({ projectId }: ProjectMemoryChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
  const [lastEmbeddingResult, setLastEmbeddingResult] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  const exampleQuestions = [
    "What did the client say about the window sizes?",
    "When did we finalize the ceiling layout?",
    "What are the open questions from July?"
  ];

  useEffect(() => {
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        setUserRole(data?.role || '');
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

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

  const generateEmbeddings = async (forceRegenerate = false) => {
    setIsGeneratingEmbeddings(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-embeddings', {
        body: { projectId, forceRegenerate }
      });

      if (error) throw error;

      setLastEmbeddingResult(data);
      toast({
        title: "Project Memory Updated",
        description: `Processed ${data.processed} entries, skipped ${data.skipped} existing ones.`,
      });
    } catch (error: any) {
      console.error('Error generating embeddings:', error);
      toast({
        variant: "destructive",
        title: "Error updating project memory",
        description: error.message,
      });
    } finally {
      setIsGeneratingEmbeddings(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Chat Interface */}
      <Card className="shadow-lg border-2 border-primary/20 bg-white/95 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Project Memory Chat is Ready
          </CardTitle>
          <p className="text-sm text-slate-600">
            Ask about any meeting, decision, or request — the AI will search your project history to find the answer.
          </p>
        </CardHeader>
        <CardContent className="py-3 px-4 space-y-3">
          {/* Chat Messages */}
          <div className="max-h-48 overflow-y-auto space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-3 text-slate-500">
                <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Ask questions about your design decisions</p>
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
          <form onSubmit={handleSubmit} className="space-y-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your project..."
              className="min-h-[60px] resize-none"
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

      {/* Advanced Settings - Admin Only */}
      {userRole === 'admin' && (
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-slate-600">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Advanced AI Settings
              </div>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2 border-slate-200">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Status:</span>
                  <Badge variant="outline" className="text-green-700">
                    Memory Search Enabled ✅
                  </Badge>
                </div>
                
                {lastEmbeddingResult && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-sm">Last Index Update</span>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <Badge variant="outline" className="text-green-700">
                        {lastEmbeddingResult.processed} Processed
                      </Badge>
                      <Badge variant="outline" className="text-blue-700">
                        {lastEmbeddingResult.skipped} Skipped
                      </Badge>
                      <Badge variant="outline" className="text-slate-700">
                        {lastEmbeddingResult.total} Total
                      </Badge>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button 
                    onClick={() => generateEmbeddings(false)}
                    disabled={isGeneratingEmbeddings}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    {isGeneratingEmbeddings ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Zap className="h-3 w-3" />
                        Update Project Memory
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => generateEmbeddings(true)}
                    disabled={isGeneratingEmbeddings}
                  >
                    Force Rebuild
                  </Button>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}