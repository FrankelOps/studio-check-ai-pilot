import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, MapPin, FileText, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FileUpload } from '@/components/FileUpload';

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface UploadedFile {
  id: string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

interface AnalysisResult {
  id: string;
  analysis_data: any;
  created_at: string;
  uploaded_files: {
    file_name: string;
  };
}

const Project = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProjectData = async () => {
    if (!projectId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch project details
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Fetch uploaded files
      const { data: filesData, error: filesError } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false });

      if (filesError) throw filesError;
      setFiles(filesData || []);

      // Fetch analysis results
      const { data: analysesData, error: analysesError } = await supabase
        .from('analysis_results')
        .select(`
          id,
          analysis_data,
          created_at,
          uploaded_files!inner(file_name)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (analysesError) throw analysesError;
      setAnalyses(analysesData || []);

    } catch (error: any) {
      console.error('Error fetching project data:', error);
      toast({
        variant: "destructive",
        title: "Error loading project",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (fileId: string) => {
    setAnalyzing(fileId);
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-document', {
        body: { fileId, projectId }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Analysis complete!",
          description: `Found ${data.findings.length} findings in the document.`,
        });
        fetchProjectData(); // Refresh data
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error.message,
      });
    } finally {
      setAnalyzing(null);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <ArrowDown className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Project not found</h1>
          <Link to="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-orange-500 rounded-lg flex items-center justify-center">
                  <ArrowDown className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900">StudioCheck</span>
              </Link>
              <span className="text-slate-400">/</span>
              <span className="text-slate-700">{project.name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{project.name}</h1>
          {project.description && (
            <p className="text-lg text-slate-600">{project.description}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* File Upload Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Documents</CardTitle>
                <CardDescription>
                  Upload construction drawings, specifications, and plans for AI-powered QA/QC analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUpload 
                  projectId={projectId!} 
                  onUploadComplete={() => fetchProjectData()}
                />
              </CardContent>
            </Card>

            {/* Uploaded Files */}
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Files</CardTitle>
                <CardDescription>
                  {files.length} file{files.length !== 1 ? 's' : ''} uploaded
                </CardDescription>
              </CardHeader>
              <CardContent>
                {files.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <ArrowDown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No files uploaded yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">{file.file_name}</p>
                          <p className="text-sm text-slate-500">
                            {(file.file_size / 1024 / 1024).toFixed(2)} MB • 
                            {' '}Uploaded {new Date(file.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAnalyze(file.id)}
                          disabled={analyzing === file.id}
                          className="bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600"
                        >
                          {analyzing === file.id ? 'Analyzing...' : 'Analyze'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Analysis Results */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>QA/QC Analysis Results</CardTitle>
                <CardDescription>
                  AI-powered construction document review findings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyses.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <ArrowDown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No analyses completed yet</p>
                    <p className="text-sm mt-2">Upload and analyze documents to see results here</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {analyses.map((analysis) => (
                      <div key={analysis.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-slate-900">
                            {analysis.uploaded_files.file_name}
                          </h3>
                          <span className="text-sm text-slate-500">
                            {new Date(analysis.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        
                        {analysis.analysis_data && Array.isArray(analysis.analysis_data) && analysis.analysis_data.length > 0 ? (
                          <div className="space-y-4">
                            {analysis.analysis_data.map((finding: any, index: number) => (
                              <div key={index} className="bg-slate-50 rounded-lg p-5 border-l-4 border-l-red-500">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={getSeverityColor(finding.severity) as any}>
                                      {finding.category}
                                    </Badge>
                                    {finding.severity && (
                                      <Badge variant="outline" className="text-xs">
                                        {finding.severity} Risk
                                      </Badge>
                                    )}
                                  </div>
                                  {finding.requires_coordination && (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      Coordination Required
                                    </Badge>
                                  )}
                                </div>

                                {/* Enhanced Analysis Display */}
                                {finding.sheet_reference && (
                                  <div className="mb-3">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Sheet/Spec Reference</span>
                                    <p className="text-sm text-slate-800 font-medium">{finding.sheet_reference}</p>
                                  </div>
                                )}

                                {finding.location && (
                                  <div className="mb-3">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Location</span>
                                    <p className="text-sm text-slate-700">{finding.location}</p>
                                  </div>
                                )}

                                {finding.nearby_text && (
                                  <div className="mb-3">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nearby Text/Marker</span>
                                    <p className="text-sm text-slate-700 bg-slate-200 px-2 py-1 rounded font-mono">{finding.nearby_text}</p>
                                  </div>
                                )}

                                {finding.issue && (
                                  <div className="mb-3">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Issue</span>
                                    <p className="text-sm text-slate-800 font-medium">{finding.issue}</p>
                                  </div>
                                )}

                                {finding.construction_impact && (
                                  <div className="mb-3">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Construction Impact</span>
                                    <p className="text-sm text-slate-700 leading-relaxed">{finding.construction_impact}</p>
                                  </div>
                                )}

                                {finding.reasoning && (
                                  <div className="mb-3">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">AI Reasoning</span>
                                    <p className="text-sm text-slate-600 italic leading-relaxed">{finding.reasoning}</p>
                                  </div>
                                )}

                                {finding.suggested_action && (
                                  <div className="mb-3">
                                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Suggested Action</span>
                                    <p className="text-sm text-slate-800 font-medium bg-blue-50 px-3 py-2 rounded border-l-2 border-blue-400">{finding.suggested_action}</p>
                                  </div>
                                )}

                                {/* Fallback for legacy description field */}
                                {finding.description && !finding.issue && (
                                  <p className="text-sm text-slate-700 mb-3 leading-relaxed">
                                    {finding.description}
                                  </p>
                                )}
                                
                                <div className="space-y-2 pt-2 border-t border-slate-200">
                                  {(finding.location_reference && !finding.location) && (
                                    <div className="flex items-center text-xs text-slate-600">
                                      <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                                      <span className="font-medium">Reference:</span>
                                      <span className="ml-1">{finding.location_reference}</span>
                                    </div>
                                  )}
                                  
                                  {finding.cross_references && finding.cross_references.length > 0 && (
                                    <div className="flex items-start text-xs text-blue-600">
                                      <FileText className="h-3 w-3 mr-1 flex-shrink-0 mt-0.5" />
                                      <span className="font-medium">Cross-References:</span>
                                      <div className="ml-2 flex flex-wrap gap-1">
                                        {finding.cross_references.map((ref: string, refIdx: number) => (
                                          <Badge key={refIdx} variant="outline" className="text-xs px-1 py-0">
                                            {ref}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            No issues found in this document.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Project;