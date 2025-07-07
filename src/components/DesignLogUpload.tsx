import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Upload, Loader2, CheckCircle, X, Mic, AudioLines } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AudioRecorder } from './AudioRecorder';

interface DesignLogUploadProps {
  projectId: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

export function DesignLogUpload({ projectId, onClose, onUploadComplete }: DesignLogUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('documents');
  const { toast } = useToast();

  // Document upload dropzone
  const { getRootProps: getDocRootProps, getInputProps: getDocInputProps, isDragActive: isDocDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    onDrop: handleDocumentUpload,
  });

  // Audio file upload dropzone
  const { getRootProps: getAudioRootProps, getInputProps: getAudioInputProps, isDragActive: isAudioDragActive } = useDropzone({
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.webm'],
    },
    maxFiles: 1,
    onDrop: handleAudioFileUpload,
  });

  async function handleDocumentUpload(acceptedFiles: File[]) {
    if (acceptedFiles.length === 0) return;
    await processFile(acceptedFiles[0], 'document');
  }

  async function handleAudioFileUpload(acceptedFiles: File[]) {
    if (acceptedFiles.length === 0) return;
    await processFile(acceptedFiles[0], 'audio');
  }

  async function handleAudioRecorded(audioBlob: Blob, duration: number) {
    const file = new File([audioBlob], `recording-${Date.now()}.webm`, {
      type: 'audio/webm'
    });
    await processFile(file, 'audio');
  }

  async function processFile(file: File, type: 'document' | 'audio') {
    setUploading(true);
    setProgress(20);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `${user.id}/${projectId}/${fileName}`;

      setProgress(40);

      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setProgress(60);

      // Save file record to database
      const { data: fileRecord, error: fileError } = await supabase
        .from('uploaded_files')
        .insert({
          project_id: projectId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
        })
        .select()
        .single();

      if (fileError) throw fileError;

      setProgress(80);
      setUploading(false);
      setProcessing(true);

      let processResult;

      if (type === 'audio') {
        // First transcribe the audio
        const audioBase64 = await fileToBase64(file);
        
        const { data: transcriptionResult, error: transcriptionError } = await supabase.functions.invoke('transcribe-audio', {
          body: {
            audio: audioBase64,
            mimeType: file.type
          }
        });

        if (transcriptionError) throw transcriptionError;

        if (!transcriptionResult.success) {
          throw new Error(transcriptionResult.error || 'Transcription failed');
        }

        // Then process the transcribed text with DesignLog AI
        const { data: designLogResult, error: designLogError } = await supabase.functions.invoke('process-designlog', {
          body: {
            fileId: fileRecord.id,
            projectId: projectId,
            transcribedText: transcriptionResult.text,
            summaryOutline: transcriptionResult.summary_outline
          }
        });

        if (designLogError) throw designLogError;
        processResult = designLogResult;

      } else {
        // Process document directly
        const { data: documentResult, error: documentError } = await supabase.functions.invoke('process-designlog', {
          body: {
            fileId: fileRecord.id,
            projectId: projectId
          }
        });

        if (documentError) throw documentError;
        processResult = documentResult;
      }

      setProgress(100);
      setProcessing(false);
      setResults(processResult);

      toast({
        title: "Processing completed!",
        description: `Extracted ${processResult.entriesSaved} design log entries from ${type === 'audio' ? 'audio transcription' : 'document'}.`,
      });

    } catch (error: any) {
      console.error('Processing error:', error);
      setUploading(false);
      setProcessing(false);
      toast({
        variant: "destructive",
        title: "Processing failed",
        description: error.message,
      });
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data:audio/webm;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const handleComplete = () => {
    setResults(null);
    setProgress(0);
    onUploadComplete();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload Content for DesignLog Analysis
          </DialogTitle>
          <DialogDescription>
            Upload documents, audio files, or record audio to extract design decisions, owner requirements, and open questions.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-6">
            {!uploading && !processing && (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="documents" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Documents
                  </TabsTrigger>
                  <TabsTrigger value="audio-files" className="flex items-center gap-2">
                    <AudioLines className="h-4 w-4" />
                    Audio Files
                  </TabsTrigger>
                  <TabsTrigger value="record" className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    Record Audio
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="documents" className="space-y-4">
                  <Card className="border-dashed border-2 border-blue-200 bg-blue-50/50">
                    <CardContent className="p-6">
                      <div
                        {...getDocRootProps()}
                        className={`text-center cursor-pointer transition-colors ${
                          isDocDragActive ? 'bg-blue-100' : 'hover:bg-blue-100/50'
                        } rounded-lg p-8`}
                      >
                        <input {...getDocInputProps()} />
                        <FileText className="h-12 w-12 mx-auto mb-4 text-blue-500" />
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">
                          {isDocDragActive ? 'Drop document here' : 'Drop document here or click to browse'}
                        </h3>
                        <p className="text-sm text-slate-600 mb-4">
                          Supports PDF, DOC, DOCX, and TXT files
                        </p>
                        <Button variant="outline">Choose Document</Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="audio-files" className="space-y-4">
                  <Card className="border-dashed border-2 border-green-200 bg-green-50/50">
                    <CardContent className="p-6">
                      <div
                        {...getAudioRootProps()}
                        className={`text-center cursor-pointer transition-colors ${
                          isAudioDragActive ? 'bg-green-100' : 'hover:bg-green-100/50'
                        } rounded-lg p-8`}
                      >
                        <input {...getAudioInputProps()} />
                        <AudioLines className="h-12 w-12 mx-auto mb-4 text-green-500" />
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">
                          {isAudioDragActive ? 'Drop audio file here' : 'Drop audio file here or click to browse'}
                        </h3>
                        <p className="text-sm text-slate-600 mb-4">
                          Supports MP3, WAV, M4A, OGG, and WEBM files
                        </p>
                        <Button variant="outline">Choose Audio File</Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="record" className="space-y-4">
                  <AudioRecorder 
                    onAudioRecorded={handleAudioRecorded}
                    disabled={uploading || processing}
                  />
                </TabsContent>
              </Tabs>
            )}

            {(uploading || processing) && (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-blue-500" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {uploading ? 'Uploading content...' : 'Processing with AI...'}
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                      {uploading 
                        ? 'Uploading your content to secure storage'
                        : processing && (activeTab === 'record' || activeTab === 'audio-files')
                        ? 'Transcribing audio and extracting design decisions'
                        : 'AI is extracting design decisions, requirements, and questions'
                      }
                    </p>
                    <Progress value={progress} className="w-full" />
                    <p className="text-xs text-slate-500 mt-2">{progress}% complete</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                Processing Complete!
              </CardTitle>
              <CardDescription>
                Successfully analyzed your content and extracted {results.entriesSaved} entries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {results.entries?.filter((e: any) => e.type === 'Owner Requirement').length || 0}
                    </div>
                    <div className="text-sm text-slate-600">Owner Requirements</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {results.entries?.filter((e: any) => e.type === 'Design Decision').length || 0}
                    </div>
                    <div className="text-sm text-slate-600">Design Decisions</div>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-amber-600">
                      {results.entries?.filter((e: any) => e.type === 'Open Question').length || 0}
                    </div>
                    <div className="text-sm text-slate-600">Open Questions</div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleComplete} className="flex-1">
                    View Results
                  </Button>
                  <Button variant="outline" onClick={onClose}>
                    <X className="h-4 w-4 mr-2" />
                    Close
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}