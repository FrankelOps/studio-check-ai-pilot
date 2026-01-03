import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FileText, Search, Filter, Calendar, Tag, MessageSquareText, CheckCircle, AlertCircle, ArrowDown, Users, ListTodo } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DesignLogUpload } from '@/components/DesignLogUpload';
import { ProjectMemoryChat } from '@/components/ProjectMemoryChat';
import { OwnerPortal } from '@/components/OwnerPortal';
import { NotificationBell } from '@/components/NotificationBell';
import { ActionItemsManager } from '@/components/ActionItemsManager';
import { MeetingMinutes } from '@/components/MeetingMinutes';
import { AuthGuard } from '@/components/AuthGuard';
import { UserMenu } from '@/components/UserMenu';

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

const DesignLogContent = () => {
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
  const [activeTab, setActiveTab] = useState<string>('entries');
  const [actionItemsCount, setActionItemsCount] = useState<number>(0);
  const [hasUploadedFiles, setHasUploadedFiles] = useState<boolean>(false);
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

      // Check if we have uploaded files (meeting minutes or design logs)
      const { data: meetingMinutesData, error: meetingError } = await supabase
        .from('meeting_minutes')
        .select('id')
        .eq('project_id', projectId)
        .limit(1);

      setHasUploadedFiles(!meetingError && meetingMinutesData && meetingMinutesData.length > 0);

      // Fetch action items count
      const { data: actionItemsData, error: actionItemsError } = await supabase
        .from('action_items')
        .select('id')
        .eq('project_id', projectId);

      if (!actionItemsError && actionItemsData) {
        setActionItemsCount(actionItemsData.length);
      }

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
              <UserMenu />
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

        {/* Top Module Cards - Interactive Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card 
            className={`cursor-pointer hover:shadow-lg transition-all duration-200 group ${
              activeTab === 'entries' ? 'ring-2 ring-blue-500 bg-blue-50' : ''
            }`} 
            onClick={() => setActiveTab('entries')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 group-hover:text-slate-700 transition-colors">🗂 Total Entries</p>
                  <p className="text-3xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{entries.length}</p>
                  <p className="text-xs text-slate-500 mt-1">Processed meetings & documents</p>
                </div>
                <FileText className="h-10 w-10 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer hover:shadow-lg transition-all duration-200 group ${
              activeTab === 'questions' ? 'ring-2 ring-amber-500 bg-amber-50' : ''
            }`} 
            onClick={() => setActiveTab('questions')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 group-hover:text-slate-700 transition-colors">❓ Open Questions</p>
                  <p className="text-3xl font-bold text-amber-600 group-hover:text-amber-700 transition-colors">
                    {entries.filter(e => e.type === 'Open Question').length}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Unresolved project questions</p>
                </div>
                <AlertCircle className="h-10 w-10 text-amber-400 group-hover:text-amber-500 transition-colors" />
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer hover:shadow-lg transition-all duration-200 group ${
              activeTab === 'actions' ? 'ring-2 ring-green-500 bg-green-50' : ''
            }`} 
            onClick={() => setActiveTab('actions')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 group-hover:text-slate-700 transition-colors">✅ Action Items</p>
                  <p className="text-3xl font-bold text-green-600 group-hover:text-green-700 transition-colors">
                    {actionItemsCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Tasks and follow-ups</p>
                </div>
                <ListTodo className="h-10 w-10 text-green-400 group-hover:text-green-500 transition-colors" />
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer hover:shadow-lg transition-all duration-200 group ${
              activeTab === 'decisions' ? 'ring-2 ring-purple-500 bg-purple-50' : ''
            }`} 
            onClick={() => setActiveTab('decisions')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 group-hover:text-slate-700 transition-colors">📋 Design Decisions</p>
                  <p className="text-3xl font-bold text-purple-600 group-hover:text-purple-700 transition-colors">
                    {entries.filter(e => e.type === 'Design Decision').length}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Key design choices</p>
                </div>
                <CheckCircle className="h-10 w-10 text-purple-400 group-hover:text-purple-500 transition-colors" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Area */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">{/* Removed TabsList - using cards for navigation */}

          <TabsContent value="entries" className="space-y-8 animate-fade-in">
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
            <div className="space-y-6">
              {!hasUploadedFiles && entries.length === 0 ? (
                <Card className="border-2 border-dashed border-slate-200 hover:border-slate-300 transition-colors">
                  <CardContent className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">Ready to get started?</h3>
                    <p className="text-slate-600 mb-6">
                      Upload your first meeting recording or document to automatically extract design decisions, requirements, and questions.
                    </p>
                    <div className="space-y-3">
                      <Button onClick={() => setShowUpload(true)} className="bg-gradient-to-r from-blue-600 to-blue-800">
                        Upload Your First Document
                      </Button>
                      <p className="text-xs text-slate-500">
                        Supports audio files (.mp3, .m4a, .wav) and documents (.pdf, .docx, .txt)
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                 filteredEntries.map((entry) => (
                   <Card key={entry.id} className="hover:shadow-lg transition-all duration-200 hover:scale-[1.01]" data-entry-id={entry.id}>
                     <CardContent className="px-6 py-4">
                       <div className="flex items-start justify-between mb-4">
                         <div className="flex items-center gap-3">
                           <div className={`p-2 rounded-xl border ${getTypeColor(entry.type)} shadow-sm`}>
                             {getTypeIcon(entry.type)}
                           </div>
                           <div>
                             <Badge variant="outline" className="mb-2 font-medium">
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
                                 <span className="text-blue-600">• From: {entry.uploaded_files.file_name}</span>
                               )}
                             </div>
                           </div>
                         </div>
                         <Badge variant={entry.status === 'active' ? 'default' : 'secondary'}>
                           {entry.status}
                         </Badge>
                       </div>

                       <h3 className="text-lg font-semibold text-slate-900 mb-3 leading-tight">{entry.summary}</h3>
                       
                       {entry.rationale && (
                         <p className="text-slate-600 mb-4 leading-relaxed">{entry.rationale}</p>
                       )}

                        {entry.tags.length > 0 && (
                          <div className="flex items-center gap-2">
                            <Tag className="h-3 w-3 text-slate-400" />
                            <div className="flex flex-wrap gap-1">
                              {entry.tags.map((tag, index) => (
                                <Badge key={index} variant="outline" className="text-xs bg-slate-50">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                   </Card>
                 ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="questions" className="space-y-6 animate-fade-in">
            {/* Project Memory Chat for Questions */}
            <ProjectMemoryChat projectId={projectId!} />
            
            {/* Questions Filter */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search open questions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Open Questions List */}
            <div className="space-y-4">
              {entries.filter(e => e.type === 'Open Question').length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 text-amber-400" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No open questions yet</h3>
                    <p className="text-slate-600 mb-4">
                      Questions will appear here automatically when extracted from uploaded documents
                    </p>
                  </CardContent>
                </Card>
              ) : (
                entries
                  .filter(e => e.type === 'Open Question')
                  .filter(entry =>
                    !searchTerm || 
                    entry.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    entry.rationale?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((entry) => (
                    <Card key={entry.id} className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-amber-400">
                      <CardContent className="px-6 py-4">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl border bg-amber-50 text-amber-600 border-amber-200 shadow-sm">
                              <AlertCircle className="h-4 w-4" />
                            </div>
                            <div>
                              <Badge variant="outline" className="mb-2 border-amber-300 text-amber-700">
                                Open Question
                              </Badge>
                              <div className="flex items-center gap-2 text-sm text-slate-500">
                                {entry.date && (
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(entry.date).toLocaleDateString()}
                                  </div>
                                )}
                                {entry.uploaded_files && (
                                  <span className="text-blue-600">• From: {entry.uploaded_files.file_name}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Badge variant={entry.status === 'active' ? 'default' : 'secondary'}>
                            {entry.status}
                          </Badge>
                        </div>

                        <h3 className="text-lg font-semibold text-slate-900 mb-3">{entry.summary}</h3>
                        
                        {entry.rationale && (
                          <p className="text-slate-600 mb-4">{entry.rationale}</p>
                        )}

                        {entry.tags.length > 0 && (
                          <div className="flex items-center gap-2">
                            <Tag className="h-3 w-3 text-slate-400" />
                            <div className="flex flex-wrap gap-1">
                              {entry.tags.map((tag, index) => (
                                <Badge key={index} variant="outline" className="text-xs bg-amber-50">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="actions" className="animate-fade-in">
            <ActionItemsManager projectId={projectId!} />
          </TabsContent>

          <TabsContent value="decisions" className="space-y-6 animate-fade-in">
            {/* Project Memory Chat for Design Decisions */}
            <ProjectMemoryChat projectId={projectId!} />
            
            {/* Design Decisions Filter */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search design decisions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Design Decisions Table */}
            <div className="space-y-4">
              {entries.filter(e => e.type === 'Design Decision').length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-purple-400" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No design decisions yet</h3>
                    <p className="text-slate-600 mb-4">
                      Design decisions will appear here automatically when extracted from uploaded documents
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-3 px-4 font-medium text-slate-700">Summary</th>
                            <th className="text-left py-3 px-4 font-medium text-slate-700">Meeting Source</th>
                            <th className="text-left py-3 px-4 font-medium text-slate-700">Date</th>
                            <th className="text-left py-3 px-4 font-medium text-slate-700">Rationale</th>
                            <th className="text-left py-3 px-4 font-medium text-slate-700">Tags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries
                            .filter(e => e.type === 'Design Decision')
                            .filter(entry =>
                              !searchTerm || 
                              entry.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              entry.rationale?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              entry.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
                            )
                            .map((entry) => (
                              <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-4 px-4">
                                  <div className="flex items-start gap-2">
                                    <div className="p-1 rounded bg-purple-100 text-purple-600 mt-1">
                                      <CheckCircle className="h-3 w-3" />
                                    </div>
                                    <span className="font-medium text-slate-900">{entry.summary}</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-slate-600">
                                  {entry.uploaded_files?.file_name || entry.meeting_event || 'N/A'}
                                </td>
                                <td className="py-4 px-4 text-slate-600">
                                  {entry.date ? new Date(entry.date).toLocaleDateString() : 'N/A'}
                                </td>
                                <td className="py-4 px-4 text-slate-600 max-w-xs">
                                  <div className="truncate" title={entry.rationale || ''}>
                                    {entry.rationale || 'No rationale provided'}
                                  </div>
                                </td>
                                <td className="py-4 px-4">
                                  <div className="flex flex-wrap gap-1">
                                    {entry.tags.map((tag, index) => (
                                      <Badge key={index} variant="outline" className="text-xs bg-purple-50 text-purple-700">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Legacy Tabs - Moved to Sidebar/Dropdown */}
        <div className="mt-12 border-t pt-8">
          <details className="group">
            <summary className="flex items-center justify-between w-full px-4 py-3 text-left text-sm font-medium text-slate-700 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Additional Views
              </span>
              <span className="text-xs text-slate-500 group-open:hidden">Click to expand</span>
              <span className="text-xs text-slate-500 hidden group-open:inline">Click to collapse</span>
            </summary>
            <div className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5" />
                    Meeting Minutes
                  </CardTitle>
                  <CardDescription>AI-generated summaries of project discussions</CardDescription>
                </CardHeader>
                <CardContent>
                  <MeetingMinutes 
                    projectId={projectId!} 
                    userRole={userRole}
                    onNavigateToEntry={(entryId) => {
                      setActiveTab('entries');
                      setTimeout(() => {
                        const entryElement = document.querySelector(`[data-entry-id="${entryId}"]`);
                        if (entryElement) {
                          entryElement.scrollIntoView({ behavior: 'smooth' });
                        }
                      }, 100);
                    }}
                  />
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Owner Portal
                  </CardTitle>
                  <CardDescription>Collaborate with project stakeholders</CardDescription>
                </CardHeader>
                <CardContent>
                  <OwnerPortal projectId={projectId!} currentUserRole={userRole} />
                </CardContent>
              </Card>
            </div>
          </details>
        </div>

        {/* Upload Dialog */}
        {showUpload && (
          <Dialog open={showUpload} onOpenChange={setShowUpload}>
            <DialogContent className="max-w-4xl">
              <DesignLogUpload 
                projectId={projectId!} 
                onClose={() => setShowUpload(false)}
                onUploadComplete={() => {
                  fetchData();
                  setShowUpload(false);
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </main>
    </div>
  );
};

const DesignLog = () => {
  return (
    <AuthGuard>
      <DesignLogContent />
    </AuthGuard>
  );
};

export default DesignLog;