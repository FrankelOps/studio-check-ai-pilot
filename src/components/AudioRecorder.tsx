import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Mic, Square, Play, Pause, Trash2, Upload, FileText, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import TranscriptEditor from './TranscriptEditor';

interface AudioRecorderProps {
  onAudioRecorded: (audioBlob: Blob, duration: number) => void;
  onTranscriptGenerated?: (transcriptData: any) => void;
  projectId?: string;
  disabled?: boolean;
}

export function AudioRecorder({ onAudioRecorded, onTranscriptGenerated, projectId, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptData, setTranscriptData] = useState<any>(null);
  const [showTranscriptEditor, setShowTranscriptEditor] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const startTimer = () => {
    timerRef.current = window.setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setDuration(0);
      startTimer();

    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: "destructive",
        title: "Microphone Error",
        description: "Unable to access microphone. Please check permissions.",
      });
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        startTimer();
        setIsPaused(false);
      } else {
        mediaRecorderRef.current.pause();
        stopTimer();
        setIsPaused(true);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
    }
  };

  const playRecorded = () => {
    if (recordedBlob && !isPlaying) {
      const audioUrl = URL.createObjectURL(recordedBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.play();
      setIsPlaying(true);
    } else if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const clearRecording = () => {
    setRecordedBlob(null);
    setDuration(0);
    setIsPlaying(false);
    setTranscriptData(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  const handleUpload = () => {
    if (recordedBlob) {
      onAudioRecorded(recordedBlob, duration);
      clearRecording();
    }
  };

  const handleTranscribeWithAI = async () => {
    if (!recordedBlob) return;

    setIsTranscribing(true);
    
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1]; // Remove data:audio/webm;base64, prefix
          resolve(base64);
        };
        reader.onerror = reject;
      });
      
      reader.readAsDataURL(recordedBlob);
      const base64Audio = await base64Promise;

      // Call enhanced transcription service
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio,
          mimeType: recordedBlob.type,
          projectId: projectId
        }
      });

      if (error) throw error;

      if (data.success) {
        setTranscriptData(data);
        setShowTranscriptEditor(true);
        onTranscriptGenerated?.(data);
        
        toast({
          title: "Transcription completed!",
          description: `Enhanced transcription with ${data.speakers?.length || 0} speakers identified.`,
        });
      } else {
        throw new Error(data.error || 'Transcription failed');
      }

    } catch (error: any) {
      console.error('Transcription error:', error);
      toast({
        variant: "destructive",
        title: "Transcription failed",
        description: error.message || "Unable to transcribe audio. Please try again.",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSaveTranscript = (editedData: any) => {
    setTranscriptData(editedData);
    onTranscriptGenerated?.(editedData);
    toast({
      title: "Transcript saved",
      description: "Enhanced transcript has been saved successfully.",
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="text-center space-y-4">
          <h3 className="text-lg font-semibold">Record Audio</h3>
          
          {/* Timer Display */}
          <div className="text-2xl font-mono text-slate-700">
            {formatTime(duration)}
          </div>

          {/* Recording Controls */}
          {!recordedBlob ? (
            <div className="flex justify-center space-x-2">
              {!isRecording ? (
                <Button
                  onClick={startRecording}
                  disabled={disabled}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Mic className="h-4 w-4 mr-2" />
                  Start Recording
                </Button>
              ) : (
                <>
                  <Button
                    onClick={pauseRecording}
                    variant="outline"
                    disabled={disabled}
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Pause
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={stopRecording}
                    variant="destructive"
                    disabled={disabled}
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                </>
              )}
            </div>
          ) : (
            /* Playback Controls */
            <div className="space-y-4">
              <div className="flex justify-center space-x-2">
                <Button
                  onClick={playRecorded}
                  variant="outline"
                  disabled={disabled}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Play
                    </>
                  )}
                </Button>
                <Button
                  onClick={clearRecording}
                  variant="outline"
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
                <Button
                  onClick={handleTranscribeWithAI}
                  disabled={disabled || isTranscribing}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  {isTranscribing ? 'Transcribing...' : 'Enhanced Transcription'}
                </Button>
                
                <Button
                  onClick={handleUpload}
                  variant="outline"
                  disabled={disabled}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Only
                </Button>
              </div>

              {transcriptData && (
                <Button
                  onClick={() => setShowTranscriptEditor(true)}
                  variant="outline"
                  className="w-full"
                  disabled={disabled}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Enhanced Transcript
                </Button>
              )}
            </div>
          )}

          {/* Recording Status */}
          {isRecording && (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-slate-600">
                  {isPaused ? 'Recording Paused' : 'Recording...'}
                </span>
              </div>
            </div>
          )}

          {/* Transcription Status */}
          {isTranscribing && (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-slate-600">
                  Processing with AssemblyAI & GPT-4o...
                </span>
              </div>
              <Progress value={undefined} className="w-full" />
            </div>
          )}
        </div>
      </CardContent>
      
      {/* Transcript Editor Modal */}
      {showTranscriptEditor && transcriptData && (
        <TranscriptEditor
          transcriptData={transcriptData}
          onSave={handleSaveTranscript}
          onClose={() => setShowTranscriptEditor(false)}
        />
      )}
    </Card>
  );
}