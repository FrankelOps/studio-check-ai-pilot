import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { FileText, Upload, Loader2, CheckCircle, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    onDrop: handleFileUpload,
  });

  async function handleFileUpload(acceptedFiles: File[]) {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
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

      // Process with DesignLog AI
      const { data: processResult, error: processError } = await supabase.functions.invoke('process-designlog', {
        body: {
          fileId: fileRecord.id,
          projectId: projectId
        }
      });

      if (processError) throw processError;

      setProgress(100);
      setProcessing(false);
      setResults(processResult);

      toast({
        title: "Document processed successfully!",
        description: `Extracted ${processResult.entriesSaved} design log entries.`,
      });

    } catch (error: any) {
      console.error('Upload/processing error:', error);
      setUploading(false);
      setProcessing(false);
      toast({
        variant: "destructive",
        title: "Processing failed",
        description: error.message,
      });
    }
  }

  const handleComplete = () => {
    setResults(null);
    setProgress(0);
    onUploadComplete();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload Document for DesignLog Analysis
          </DialogTitle>
          <DialogDescription>
            Upload meeting notes, transcripts, or documents to extract design decisions, owner requirements, and open questions.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-6">
            {!uploading && !processing && (
              <Card className="border-dashed border-2 border-blue-200 bg-blue-50/50">
                <CardContent className="p-6">
                  <div
                    {...getRootProps()}
                    className={`text-center cursor-pointer transition-colors ${
                      isDragActive ? 'bg-blue-100' : 'hover:bg-blue-100/50'
                    } rounded-lg p-8`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="h-12 w-12 mx-auto mb-4 text-blue-500" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {isDragActive ? 'Drop file here' : 'Drop file here or click to browse'}
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                      Supports PDF, DOC, DOCX, and TXT files
                    </p>
                    <Button variant="outline">Choose File</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {(uploading || processing) && (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-blue-500" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {uploading ? 'Uploading document...' : 'Processing with AI...'}
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                      {uploading 
                        ? 'Uploading your document to secure storage'
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
                Successfully analyzed your document and extracted {results.entriesSaved} entries.
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