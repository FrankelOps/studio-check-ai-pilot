import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, XCircle, MessageSquare, Clock, User, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DesignLogEntry {
  id: string;
  type: string;
  summary: string;
  rationale: string | null;
  date: string | null;
  meeting_event: string | null;
  tags: string[] | null;
  created_at: string;
  feedback: DecisionFeedback[];
}

interface DecisionFeedback {
  id: string;
  type: string;
  content: string | null;
  status: string | null;
  created_at: string;
  user_id: string;
  profiles?: {
    display_name: string | null;
    email: string | null;
  } | null;
}

interface OwnerPortalProps {
  projectId: string;
  currentUserRole?: string;
}

export function OwnerPortal({ projectId, currentUserRole }: OwnerPortalProps) {
  const [decisions, setDecisions] = useState<DesignLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackDialog, setFeedbackDialog] = useState<string | null>(null);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackType, setFeedbackType] = useState<'comment' | 'approval'>('comment');
  const [approvalStatus, setApprovalStatus] = useState<'approved' | 'rejected' | 'pending'>('pending');
  const { toast } = useToast();

  useEffect(() => {
    fetchDecisions();
  }, [projectId]);

  const fetchDecisions = async () => {
    try {
      const { data, error } = await supabase
        .from('design_logs')
        .select(`
          *,
          decision_feedback:decision_feedback(
            id,
            type,
            content,
            status,
            created_at,
            user_id
          )
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // For each decision, get the profile info for feedback users
      const decisionsWithProfiles = await Promise.all((data || []).map(async (decision) => {
        const feedbackWithProfiles = await Promise.all(decision.decision_feedback.map(async (feedback: any) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, email')
            .eq('id', feedback.user_id)
            .single();
            
          return {
            ...feedback,
            profiles: profile
          };
        }));
        
        return {
          ...decision,
          feedback: feedbackWithProfiles
        };
      }));
      
      setDecisions(decisionsWithProfiles);
    } catch (error: any) {
      console.error('Error fetching decisions:', error);
      toast({
        variant: "destructive",
        title: "Error loading decisions",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async (decisionId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('handle-decision-feedback', {
        body: {
          decisionId,
          type: feedbackType,
          content: feedbackContent,
          status: feedbackType === 'approval' ? approvalStatus : null,
        }
      });

      if (error) throw error;

      toast({
        title: "Feedback submitted",
        description: `Your ${feedbackType} has been recorded.`,
      });

      setFeedbackDialog(null);
      setFeedbackContent('');
      setFeedbackType('comment');
      setApprovalStatus('pending');
      fetchDecisions();
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      toast({
        variant: "destructive",
        title: "Error submitting feedback",
        description: error.message,
      });
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Owner Requirement': return 'bg-blue-100 text-blue-800';
      case 'Design Decision': return 'bg-green-100 text-green-800';
      case 'Open Question': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getApprovalStatus = (feedback: DecisionFeedback[]) => {
    const approvals = feedback.filter(f => f.type === 'approval');
    if (approvals.length === 0) return { status: 'pending', count: 0 };
    
    const approved = approvals.filter(f => f.status === 'approved').length;
    const rejected = approvals.filter(f => f.status === 'rejected').length;
    
    if (rejected > 0) return { status: 'rejected', count: rejected };
    if (approved > 0) return { status: 'approved', count: approved };
    return { status: 'pending', count: approvals.length };
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Owner Portal</h2>
          <p className="text-slate-600">Review and provide feedback on design decisions</p>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          <User className="h-4 w-4 mr-1" />
          {currentUserRole || 'Owner'}
        </Badge>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending Review
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            All Decisions
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Approved
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {decisions.filter(d => getApprovalStatus(d.feedback).status === 'pending').map((decision) => (
            <DecisionCard 
              key={decision.id} 
              decision={decision} 
              onFeedback={() => setFeedbackDialog(decision.id)}
              getTypeColor={getTypeColor}
              getApprovalStatus={getApprovalStatus}
            />
          ))}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {decisions.map((decision) => (
            <DecisionCard 
              key={decision.id} 
              decision={decision} 
              onFeedback={() => setFeedbackDialog(decision.id)}
              getTypeColor={getTypeColor}
              getApprovalStatus={getApprovalStatus}
            />
          ))}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {decisions.filter(d => getApprovalStatus(d.feedback).status === 'approved').map((decision) => (
            <DecisionCard 
              key={decision.id} 
              decision={decision} 
              onFeedback={() => setFeedbackDialog(decision.id)}
              getTypeColor={getTypeColor}
              getApprovalStatus={getApprovalStatus}
            />
          ))}
        </TabsContent>
      </Tabs>

      {/* Feedback Dialog */}
      <Dialog open={feedbackDialog !== null} onOpenChange={() => setFeedbackDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Provide Feedback</DialogTitle>
            <DialogDescription>
              Add your comment or approval for this decision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Feedback Type</label>
              <Select value={feedbackType} onValueChange={(value) => setFeedbackType(value as 'comment' | 'approval')}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="comment">Comment</SelectItem>
                  <SelectItem value="approval">Approval Decision</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {feedbackType === 'approval' && (
              <div>
                <label className="text-sm font-medium">Decision</label>
                <Select value={approvalStatus} onValueChange={(value) => setApprovalStatus(value as 'approved' | 'rejected' | 'pending')}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="approved">Approve</SelectItem>
                    <SelectItem value="rejected">Reject</SelectItem>  
                    <SelectItem value="pending">Pending Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">
                {feedbackType === 'approval' ? 'Reasoning' : 'Comment'}
              </label>
              <Textarea
                value={feedbackContent}
                onChange={(e) => setFeedbackContent(e.target.value)}
                placeholder={feedbackType === 'approval' ? 'Explain your approval decision...' : 'Add your comment...'}
                rows={4}
                className="bg-background"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setFeedbackDialog(null)}>
                Cancel
              </Button>
              <Button onClick={() => feedbackDialog && handleSubmitFeedback(feedbackDialog)}>
                Submit {feedbackType === 'approval' ? 'Decision' : 'Comment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DecisionCardProps {
  decision: DesignLogEntry;
  onFeedback: () => void;
  getTypeColor: (type: string) => string;
  getApprovalStatus: (feedback: DecisionFeedback[]) => { status: string; count: number };
}

function DecisionCard({ decision, onFeedback, getTypeColor, getApprovalStatus }: DecisionCardProps) {
  const approvalStatus = getApprovalStatus(decision.feedback);
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={getTypeColor(decision.type)}>
                {decision.type}
              </Badge>
              {approvalStatus.status === 'approved' && (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Approved
                </Badge>
              )}
              {approvalStatus.status === 'rejected' && (
                <Badge className="bg-red-100 text-red-800">
                  <XCircle className="h-3 w-3 mr-1" />
                  Rejected
                </Badge>
              )}
              {approvalStatus.status === 'pending' && approvalStatus.count > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800">
                  <Clock className="h-3 w-3 mr-1" />
                  Pending Review
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg">{decision.summary}</CardTitle>
            {decision.rationale && (
              <CardDescription>{decision.rationale}</CardDescription>
            )}
          </div>
          <Button onClick={onFeedback} size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            Add Feedback
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          {decision.meeting_event && (
            <div className="flex items-center text-sm text-slate-600">
              <Calendar className="h-4 w-4 mr-2" />
              {decision.meeting_event}
              {decision.date && ` • ${new Date(decision.date).toLocaleDateString()}`}
            </div>
          )}
          
          {decision.tags && decision.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {decision.tags.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {decision.feedback.length > 0 && (
            <div className="border-t pt-3">
              <h4 className="text-sm font-medium mb-2">Recent Feedback:</h4>
              <div className="space-y-2">
                {decision.feedback.slice(0, 2).map((feedback) => (
                  <div key={feedback.id} className="text-sm p-2 bg-slate-50 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {feedback.profiles?.display_name || feedback.profiles?.email || 'Anonymous'}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {feedback.type}
                        {feedback.status && ` • ${feedback.status}`}
                      </Badge>
                    </div>
                    {feedback.content && <p className="text-slate-600">{feedback.content}</p>}
                  </div>
                ))}
                {decision.feedback.length > 2 && (
                  <p className="text-xs text-slate-500">
                    +{decision.feedback.length - 2} more feedback items
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}