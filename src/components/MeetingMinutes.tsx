import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, FileText, RefreshCw, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MeetingMinute {
  id: string;
  meeting_date: string;
  meeting_title: string;
  summary_outline: string;
  created_at: string;
  file_id: string;
  transcript_text?: string;
  has_transcript: boolean;
  speaker_segments?: Record<string, any>;
  uploaded_files?: {
    file_name: string;
  };
}

interface DesignLogEntry {
  id: string;
  type: string;
  summary: string;
  file_id: string;
}

interface MeetingMinutesProps {
  projectId: string;
  userRole?: string;
  onNavigateToEntry?: (entryId: string) => void;
}

export function MeetingMinutes({ projectId, userRole, onNavigateToEntry }: MeetingMinutesProps) {
  const [meetingMinutes, setMeetingMinutes] = useState<MeetingMinute[]>([]);
  const [designLogEntries, setDesignLogEntries] = useState<DesignLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [transcriptViewer, setTranscriptViewer] = useState<{
    isOpen: boolean;
    title: string;
    date?: string;
    transcript: string;
    speakerSegments?: any[];
  }>({
    isOpen: false,
    title: "",
    transcript: "",
  });
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      console.log('Fetching meeting minutes data...');
      
      // Check if meeting_minutes table exists by trying a simple query
      const { data: minutesData, error: minutesError } = await (supabase as any)
        .from('meeting_minutes')
        .select('id')
        .limit(1);

      console.log('Initial query result:', { minutesData, minutesError });

      // If we get a specific error about the table not existing, show setup message
      if (minutesError && (
        minutesError.message?.includes('relation "public.meeting_minutes" does not exist') ||
        minutesError.message?.includes('relationship between') ||
        minutesError.code === 'PGRST106'
      )) {
        console.log('Table appears to not exist, showing setup message');
        setMeetingMinutes([]);
        setDesignLogEntries([]);
        setLoading(false);
        return;
      }

      // Fetch meeting minutes with files
      const { data: fullMinutesData, error: fullMinutesError } = await (supabase as any)
        .from('meeting_minutes')
        .select(`
          *,
          uploaded_files(file_name)
        `)
        .eq('project_id', projectId)
        .order('meeting_date', { ascending: false });

      if (fullMinutesError) throw fullMinutesError;

      // Fetch design log entries for highlighting
      const { data: entriesData, error: entriesError } = await supabase
        .from('design_logs')
        .select('id, type, summary, file_id')
        .eq('project_id', projectId);

      if (entriesError) throw entriesError;

      setMeetingMinutes(fullMinutesData || []);
      setDesignLogEntries(entriesData || []);
    } catch (error: any) {
      console.error('Error fetching meeting minutes:', error);
      
      // Check if this is a table not found error
      if (error.message?.includes('relation "public.meeting_minutes" does not exist') || 
          error.message?.includes('relationship between')) {
        setMeetingMinutes([]);
        setDesignLogEntries([]);
      } else {
        toast({
          variant: "destructive",
          title: "Error loading meeting minutes",
          description: error.message,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const handleRegenerate = async (minuteId: string, fileId: string) => {
    setRegeneratingId(minuteId);
    try {
      const { data, error } = await supabase.functions.invoke('regenerate-summary', {
        body: { fileId, projectId, type: 'meeting_minutes' }
      });

      if (error) throw error;

      if (data.success) {
        // Update the meeting minutes in state
        setMeetingMinutes(prev => prev.map(minute => 
          minute.id === minuteId 
            ? { ...minute, summary_outline: data.summary_outline }
            : minute
        ));
        
        toast({
          title: "Meeting minutes regenerated",
          description: "The summary has been updated with fresh analysis.",
        });
      } else {
        throw new Error(data.error || 'Failed to regenerate meeting minutes');
      }
    } catch (error: any) {
      console.error('Error regenerating meeting minutes:', error);
      toast({
        variant: "destructive",
        title: "Regeneration failed",
        description: error.message,
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  const highlightDesignLogReferences = (text: string, fileId: string) => {
    const relatedEntries = designLogEntries.filter(entry => entry.file_id === fileId);
    if (relatedEntries.length === 0) return text;

    // Split text into lines and check each line for potential matches
    const lines = text.split('\n');
    return lines.map((line, index) => {
      // Find related entries that might match this line's content
      const matchingEntry = relatedEntries.find(entry => {
        const summaryWords = entry.summary.toLowerCase().split(' ');
        const lineWords = line.toLowerCase().split(' ');
        // Check if there's significant word overlap
        const overlap = summaryWords.filter(word => 
          word.length > 3 && lineWords.some(lineWord => lineWord.includes(word))
        );
        return overlap.length >= 2; // Require at least 2 matching significant words
      });

      if (matchingEntry) {
        return (
          <div key={index} className="group relative">
            <div className="bg-blue-50 border-l-2 border-l-blue-400 pl-2 py-1 cursor-pointer hover:bg-blue-100 transition-colors">
              {line}
              <button
                onClick={() => onNavigateToEntry?.(matchingEntry.id)}
                className="ml-2 opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800 transition-opacity"
                title={`View ${matchingEntry.type}: ${matchingEntry.summary}`}
              >
                <ExternalLink className="h-3 w-3 inline" />
              </button>
            </div>
          </div>
        );
      }

      return <div key={index}>{line}</div>;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading meeting minutes...</span>
      </div>
    );
  }

  if (meetingMinutes.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-slate-400" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No meeting minutes found</h3>
          <p className="text-slate-600 mb-4">
            Meeting minutes will be generated automatically when you upload and process audio or transcript files.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <p className="text-sm text-blue-800 font-medium mb-2">To create meeting minutes:</p>
            <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
              <li>Upload audio recordings or transcript files using the "Upload Document" button</li>
              <li>Files will be automatically processed to extract meeting minutes</li>
              <li>Generated minutes will appear here with links to related DesignLog entries</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Meeting Minutes</h2>
          <p className="text-slate-600">AI-generated summaries of project discussions</p>
        </div>
        <Badge variant="outline" className="text-slate-600">
          {meetingMinutes.length} meeting{meetingMinutes.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="space-y-4">
        {meetingMinutes.map((minute) => (
          <Card key={minute.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg text-slate-900 mb-2">
                    {minute.meeting_title}
                  </CardTitle>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(minute.meeting_date).toLocaleDateString()}
                    </div>
                    {minute.uploaded_files && (
                      <span>• From: {minute.uploaded_files.file_name}</span>
                    )}
                  </div>
                </div>
                {userRole === 'admin' && (
                  <Button
                    onClick={() => handleRegenerate(minute.id, minute.file_id)}
                    disabled={regeneratingId === minute.id}
                    variant="outline"
                    size="sm"
                    className="text-slate-700 border-slate-300 hover:bg-slate-100"
                  >
                    {regeneratingId === minute.id ? (
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
                <div className="text-slate-700 whitespace-pre-line leading-relaxed space-y-1">
                  {highlightDesignLogReferences(minute.summary_outline, minute.file_id)}
                </div>
              </div>
              {designLogEntries.filter(entry => entry.file_id === minute.file_id).length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Highlighted items link to corresponding DesignLog entries
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}