import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { runPdfPreflightAndPersist, runSheetIndexV2AndPersist } from '@/lib/analysis';

interface FileUploadProps {
  projectId: string;
  onUploadComplete?: (fileId: string, jobId?: string) => void;
}

export function FileUpload({ projectId, onUploadComplete }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    
    // Validate file type
    if (!file.type.includes('pdf') && !file.type.includes('image')) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload PDF or image files only.",
      });
      return;
    }

    // Validate file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Please upload files smaller than 100MB.",
      });
      return;
    }

    setUploading(true);
    setProgress(50); // Show progress during upload

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${user.id}/${projectId}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setProgress(75); // Progress after upload

      // Save file metadata to database
      const { data: fileData, error: dbError } = await supabase
        .from('uploaded_files')
        .insert({
          project_id: projectId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setProgress(80);

      // For PDF files, create an analysis job and run Stage 0 (preflight + sheet index)
      let jobId: string | undefined;
      if (file.type === 'application/pdf') {
        // Create analysis job
        const { data: jobData, error: jobError } = await supabase
          .from('analysis_jobs')
          .insert({
            project_id: projectId,
            file_id: fileData.id,
            status: 'preflight',
            total_pages: 0,
            processed_pages: 0,
            pass: 0,
            params: {},
          })
          .select()
          .single();

        if (!jobError && jobData) {
          jobId = jobData.id;
          
          setProgress(85);

          // Run preflight
          try {
            const preflightReport = await runPdfPreflightAndPersist({
              projectId,
              jobId: jobData.id,
              filePath,
            });

            setProgress(92);

            // Run sheet index if preflight didn't fail completely
            if (preflightReport.status !== 'FAIL') {
              await runSheetIndexV2AndPersist({
                projectId,
                jobId: jobData.id,
                filePath,
              });
            }

            // Update job status
            await supabase
              .from('analysis_jobs')
              .update({ 
                status: preflightReport.status === 'FAIL' ? 'preflight_failed' : 'indexed',
                total_pages: preflightReport.metrics.total_sheets,
              })
              .eq('id', jobData.id);

          } catch (stageError) {
            console.error('Stage 0 error:', stageError);
            // Update job status to indicate error
            await supabase
              .from('analysis_jobs')
              .update({ status: 'preflight_error', error: String(stageError) })
              .eq('id', jobData.id);
          }
        }
      }

      setProgress(100);

      toast({
        title: "File uploaded successfully!",
        description: file.type === 'application/pdf' 
          ? `${file.name} has been indexed and is ready for analysis.`
          : `${file.name} is ready for analysis.`,
      });

      onUploadComplete?.(fileData.id, jobId);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message,
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [projectId, onUploadComplete, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff']
    },
    multiple: false
  });

  return (
    <Card className="border-dashed border-2">
      <CardContent className="p-6">
        <div
          {...getRootProps()}
          className={`text-center cursor-pointer transition-colors ${
            isDragActive ? 'bg-slate-50' : ''
          }`}
        >
          <input {...getInputProps()} />
          <ArrowDown className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          
          {uploading ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Uploading...</p>
              <Progress value={progress} className="w-full" />
              <p className="text-xs text-slate-500">{Math.round(progress)}% complete</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-medium text-slate-900">
                {isDragActive ? 'Drop files here' : 'Upload Construction Documents'}
              </p>
              <p className="text-sm text-slate-600">
                Drag & drop construction plans, specifications, or drawings for expert QA/QC analysis
              </p>
              <p className="text-xs text-slate-500">
                Supports PDF, PNG, JPG files (max 100MB)
              </p>
              <p className="text-xs text-blue-600 mt-2 leading-relaxed">
                🎯 <strong>StudioCheck Enhanced Analysis:</strong> Expert-level construction QA/QC review with cross-sheet verification, construction impact assessment, and actionable findings with specific location references.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                💡 For optimal analysis: Upload high-resolution JPG/PNG images of construction drawings. PDFs are supported but image formats enable more detailed visual analysis of symbols, dimensions, and annotations.
              </p>
              <Button variant="outline" className="mt-4">
                Choose Files
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}