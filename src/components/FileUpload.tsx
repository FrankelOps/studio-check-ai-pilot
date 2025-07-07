import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FileUploadProps {
  projectId: string;
  onUploadComplete?: (fileId: string) => void;
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

      setProgress(100); // Complete

      toast({
        title: "File uploaded successfully!",
        description: `${file.name} is ready for analysis.`,
      });

      onUploadComplete?.(fileData.id);

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
                Drag & drop PDF files or construction drawings, or click to browse
              </p>
              <p className="text-xs text-slate-500">
                Supports PDF, PNG, JPG files (max 100MB)
              </p>
              <p className="text-xs text-amber-600 mt-1">
                💡 For best analysis results, upload construction drawings as JPG/PNG images
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