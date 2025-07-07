import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Search, Filter, Calendar, Tag, MessageSquareText, CheckCircle, AlertCircle, ArrowDown, Users, ListTodo } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DesignLogUpload } from '@/components/DesignLogUpload';
import { ProjectMemoryChat } from '@/components/ProjectMemoryChat';
import { OwnerPortal } from '@/components/OwnerPortal';
import { NotificationBell } from '@/components/NotificationBell';
import { ActionItemsManager } from '@/components/ActionItemsManager';
import { KeyInsightsSummary } from '@/components/KeyInsightsSummary';

interface Project {
  id: string;
  name: string;
  description: string;
}

interface DesignLogEntry {
  id: string;
  type: 'Owner Requirement' | 'Design Decision' | 'Open Question';
  date: string | null;
  meeting_event: string | null;
  summary: string;
  rationale: string | null;
  status: string;
  tags: string[];
  summary_outline?: string | null;
  created_at: string;
  uploaded_files?: {
    file_name: string;
  } | null;
}

const DesignLog = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [entries, setEntries] = useState<DesignLogEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<DesignLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const { toast } = useToast();

  const fetchData = async () => {
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

      // Fetch user role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      setUserRole(profile?.role || '');

      // Fetch design log entries
      const { data: entriesData, error: entriesError } = await supabase
        .from('design_logs')
        .select(`
          *,
          uploaded_files(file_name)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (entriesError) throw entriesError;
      setEntries(entriesData as DesignLogEntry[] || []);
      setFilteredEntries(entriesData as DesignLogEntry[] || []);

    } catch (error: any) {
      console.error('Error fetching design log data:', error);
      toast({
        variant: "destructive",
        title: "Error loading design log",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  useEffect(() => {
    let filtered = entries;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(entry =>
        entry.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.rationale?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.meeting_event?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(entry => entry.type === typeFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => entry.status === statusFilter);
    }

    setFilteredEntries(filtered);
  }, [entries, searchTerm, typeFilter, statusFilter]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Owner Requirement': return <MessageSquareText className="h-4 w-4" />;
      case 'Design Decision': return <CheckCircle className="h-4 w-4" />;
      case 'Open Question': return <AlertCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Owner Requirement': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Design Decision': return 'bg-green-100 text-green-800 border-green-200';
      case 'Open Question': return 'bg-amber-100 text-amber-800 border-amber-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <ArrowDown className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading DesignLog...</p>
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
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900">StudioCheck</span>
              </Link>
              <span className="text-slate-400">/</span>
              <span className="text-slate-700">{project.name}</span>
              <span className="text-slate-400">/</span>
              <span className="text-blue-600 font-medium">DesignLog</span>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <Button onClick={() => setShowUpload(true)} className="bg-gradient-to-r from-blue-600 to-blue-800">
                <FileText className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">DesignLog</h1>
          <p className="text-lg text-slate-600">
            Track design decisions, owner requirements, and open questions throughout your project
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Entries</p>
                  <p className="text-2xl font-bold text-slate-900">{entries.length}</p>
                </div>
                <FileText className="h-8 w-8 text-slate-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Owner Requirements</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {entries.filter(e => e.type === 'Owner Requirement').length}
                  </p>
                </div>
                <MessageSquareText className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Design Decisions</p>
                  <p className="text-2xl font-bold text-green-600">
                    {entries.filter(e => e.type === 'Design Decision').length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Open Questions</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {entries.filter(e => e.type === 'Open Question').length}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="designlog" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="designlog" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              DesignLog
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              Action Items
            </TabsTrigger>
            <TabsTrigger value="portal" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Owner Portal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="designlog" className="space-y-8">
            {/* Project Memory Chat - Combined AI Experience */}
            <ProjectMemoryChat projectId={projectId!} />

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search entries..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full md:w-48 bg-background">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Owner Requirement">Owner Requirements</SelectItem>
                      <SelectItem value="Design Decision">Design Decisions</SelectItem>
                      <SelectItem value="Open Question">Open Questions</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full md:w-48 bg-background">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Entries List */}
            <div className="space-y-4">
              {filteredEntries.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No entries found</h3>
                    <p className="text-slate-600 mb-4">
                      Upload documents to extract design decisions, requirements, and questions
                    </p>
                    <Button onClick={() => setShowUpload(true)}>
                      Upload Your First Document
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                filteredEntries.map((entry) => (
                  <Card key={entry.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg border ${getTypeColor(entry.type)}`}>
                            {getTypeIcon(entry.type)}
                          </div>
                          <div>
                            <Badge variant="outline" className="mb-1">
                              {entry.type}
                            </Badge>
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              {entry.date && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(entry.date).toLocaleDateString()}
                                </div>
                              )}
                              {entry.meeting_event && (
                                <span>• {entry.meeting_event}</span>
                              )}
                              {entry.uploaded_files && (
                                <span>• From: {entry.uploaded_files.file_name}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge variant={entry.status === 'active' ? 'default' : 'secondary'}>
                          {entry.status}
                        </Badge>
                      </div>

                      <h3 className="font-semibold text-slate-900 mb-2">{entry.summary}</h3>
                      
                      {entry.rationale && (
                        <p className="text-slate-600 mb-3">{entry.rationale}</p>
                      )}

                       {entry.tags.length > 0 && (
                         <div className="flex items-center gap-2 mb-4">
                           <Tag className="h-3 w-3 text-slate-400" />
                           <div className="flex flex-wrap gap-1">
                             {entry.tags.map((tag, index) => (
                               <Badge key={index} variant="outline" className="text-xs">
                                 {tag}
                               </Badge>
                             ))}
                           </div>
                         </div>
                       )}

                       {/* Key Insights Summary */}
                       <KeyInsightsSummary
                         designLogId={entry.id}
                         summaryOutline={entry.summary_outline}
                         userRole={userRole}
                         onSummaryUpdate={(newSummary) => {
                           setEntries(prev => prev.map(e => 
                             e.id === entry.id ? { ...e, summary_outline: newSummary } : e
                           ));
                           setFilteredEntries(prev => prev.map(e => 
                             e.id === entry.id ? { ...e, summary_outline: newSummary } : e
                           ));
                         }}
                       />
                     </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="actions">
            <ActionItemsManager projectId={projectId!} />
          </TabsContent>

          <TabsContent value="portal">
            <OwnerPortal projectId={projectId!} currentUserRole="architect" />
          </TabsContent>
        </Tabs>
      </main>

      {/* Upload Modal */}
      {showUpload && (
        <DesignLogUpload
          projectId={projectId!}
          onClose={() => setShowUpload(false)}
          onUploadComplete={() => {
            setShowUpload(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
};

export default DesignLog;