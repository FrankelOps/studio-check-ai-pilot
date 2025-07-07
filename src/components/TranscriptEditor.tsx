import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  Clock, 
  Edit3, 
  Save, 
  X, 
  MessageSquare, 
  TrendingUp,
  Hash,
  CheckCircle,
  AlertCircle,
  FileText,
  Brain
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Speaker {
  id: string;
  name?: string;
  color: string;
}

interface Utterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
}

interface Chapter {
  gist: string;
  headline: string;
  start: number;
  end: number;
  summary: string;
}

interface TranscriptData {
  text: string;
  summary?: string;
  chapters: Chapter[];
  utterances: Utterance[];
  auto_highlights_result?: any;
  sentiment_analysis_results?: any[];
  entities?: any[];
  duration: number;
  confidence: number;
  words?: any[];
  speakers: string[];
  ai_analysis?: string;
}

interface TranscriptEditorProps {
  transcriptData: TranscriptData;
  onSave?: (editedData: TranscriptData) => void;
  onClose?: () => void;
}

const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  transcriptData,
  onSave,
  onClose
}) => {
  const [editedTranscript, setEditedTranscript] = useState(transcriptData.text);
  const [isEditing, setIsEditing] = useState(false);
  const [speakerMapping, setSpeakerMapping] = useState<Record<string, Speaker>>({});
  const { toast } = useToast();

  // Initialize speaker mapping with colors
  useEffect(() => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-indigo-500'];
    const mapping: Record<string, Speaker> = {};
    
    transcriptData.speakers.forEach((speaker, index) => {
      mapping[speaker] = {
        id: speaker,
        name: `Speaker ${speaker}`,
        color: colors[index % colors.length]
      };
    });
    
    setSpeakerMapping(mapping);
  }, [transcriptData.speakers]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSave = () => {
    const updatedData = {
      ...transcriptData,
      text: editedTranscript
    };
    
    onSave?.(updatedData);
    setIsEditing(false);
    
    toast({
      title: "Transcript saved",
      description: "Your edits have been saved successfully.",
    });
  };

  const updateSpeakerName = (speakerId: string, newName: string) => {
    setSpeakerMapping(prev => ({
      ...prev,
      [speakerId]: {
        ...prev[speakerId],
        name: newName
      }
    }));
  };

  const parseAIAnalysis = () => {
    if (!transcriptData.ai_analysis) return null;
    
    try {
      return JSON.parse(transcriptData.ai_analysis);
    } catch {
      return { raw: transcriptData.ai_analysis };
    }
  };

  const aiAnalysis = parseAIAnalysis();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Enhanced Transcript Editor
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Duration: {formatTime(transcriptData.duration)} • 
                Confidence: {Math.round(transcriptData.confidence * 100)}% • 
                {transcriptData.speakers.length} speakers
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button onClick={handleSave} size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button onClick={() => setIsEditing(false)} variant="outline" size="sm">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </>
              ) : (
                <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
              <Button onClick={onClose} variant="ghost" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden">
          <Tabs defaultValue="transcript" className="h-full flex flex-col">
            <TabsList className="flex-shrink-0">
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="speakers">Speaker Timeline</TabsTrigger>
              <TabsTrigger value="summary">Summary & Analysis</TabsTrigger>
              <TabsTrigger value="insights">AI Insights</TabsTrigger>
            </TabsList>

            <TabsContent value="transcript" className="flex-1 overflow-hidden">
              <div className="h-full">
                {isEditing ? (
                  <Textarea
                    value={editedTranscript}
                    onChange={(e) => setEditedTranscript(e.target.value)}
                    className="h-full resize-none font-mono text-sm"
                    placeholder="Edit transcript..."
                  />
                ) : (
                  <ScrollArea className="h-full">
                    <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed p-4 bg-muted/30 rounded-lg">
                      {transcriptData.text}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </TabsContent>

            <TabsContent value="speakers" className="flex-1 overflow-hidden">
              <div className="h-full flex gap-4">
                {/* Speaker Management */}
                <div className="w-64 flex-shrink-0">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Speakers ({transcriptData.speakers.length})
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(speakerMapping).map(([speakerId, speaker]) => (
                      <div key={speakerId} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        <div className={`w-3 h-3 rounded-full ${speaker.color}`} />
                        <input
                          type="text"
                          value={speaker.name}
                          onChange={(e) => updateSpeakerName(speakerId, e.target.value)}
                          className="flex-1 bg-transparent border-none outline-none text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Speaker Timeline */}
                <div className="flex-1">
                  <ScrollArea className="h-full">
                    <div className="space-y-3">
                      {transcriptData.utterances.map((utterance, index) => (
                        <div key={index} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                          <div className="flex flex-col items-center flex-shrink-0">
                            <div className={`w-8 h-8 rounded-full ${speakerMapping[utterance.speaker]?.color || 'bg-gray-500'} flex items-center justify-center text-white text-xs font-semibold`}>
                              {utterance.speaker}
                            </div>
                            <Badge variant="outline" className="mt-1 text-xs">
                              {formatTime(utterance.start / 1000)}
                            </Badge>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {speakerMapping[utterance.speaker]?.name || `Speaker ${utterance.speaker}`}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(utterance.confidence * 100)}% confidence
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed">{utterance.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="summary" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-6">
                  {/* Summary */}
                  {transcriptData.summary && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <FileText className="h-5 w-5" />
                          Meeting Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {transcriptData.summary}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Chapters */}
                  {transcriptData.chapters && transcriptData.chapters.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Hash className="h-5 w-5" />
                          Discussion Topics
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {transcriptData.chapters.map((chapter, index) => (
                            <div key={index} className="p-4 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">
                                  {formatTime(chapter.start / 1000)} - {formatTime(chapter.end / 1000)}
                                </Badge>
                                <h4 className="font-semibold">{chapter.headline}</h4>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{chapter.gist}</p>
                              <p className="text-sm">{chapter.summary}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Key Highlights */}
                  {transcriptData.auto_highlights_result && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <TrendingUp className="h-5 w-5" />
                          Key Highlights
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {transcriptData.auto_highlights_result.results?.map((highlight: any, index: number) => (
                            <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                              <Badge variant="secondary">{Math.round(highlight.rank * 100)}%</Badge>
                              <span className="text-sm">{highlight.text}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="insights" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                {aiAnalysis ? (
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Brain className="h-5 w-5" />
                          AI-Extracted Insights
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {aiAnalysis.raw ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed">
                            {aiAnalysis.raw}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {aiAnalysis.decisions && (
                              <div>
                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                  Design Decisions
                                </h4>
                                <ul className="space-y-1 text-sm">
                                  {aiAnalysis.decisions.map((decision: string, index: number) => (
                                    <li key={index} className="pl-4 border-l-2 border-green-200">
                                      {decision}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {aiAnalysis.requirements && (
                              <div>
                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                  <MessageSquare className="h-4 w-4 text-blue-600" />
                                  Owner Requirements
                                </h4>
                                <ul className="space-y-1 text-sm">
                                  {aiAnalysis.requirements.map((req: string, index: number) => (
                                    <li key={index} className="pl-4 border-l-2 border-blue-200">
                                      {req}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {aiAnalysis.action_items && (
                              <div>
                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                  <Clock className="h-4 w-4 text-orange-600" />
                                  Action Items
                                </h4>
                                <ul className="space-y-1 text-sm">
                                  {aiAnalysis.action_items.map((item: string, index: number) => (
                                    <li key={index} className="pl-4 border-l-2 border-orange-200">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {aiAnalysis.questions && (
                              <div>
                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                  <AlertCircle className="h-4 w-4 text-amber-600" />
                                  Open Questions
                                </h4>
                                <ul className="space-y-1 text-sm">
                                  {aiAnalysis.questions.map((question: string, index: number) => (
                                    <li key={index} className="pl-4 border-l-2 border-amber-200">
                                      {question}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    <div className="text-center">
                      <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No AI analysis available for this transcript</p>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default TranscriptEditor;