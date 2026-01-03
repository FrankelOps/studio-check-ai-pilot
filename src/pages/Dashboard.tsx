
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown } from 'lucide-react';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { supabase } from '@/integrations/supabase/client';
import { AuthGuard } from '@/components/AuthGuard';
import { UserMenu } from '@/components/UserMenu';

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

const DashboardContent = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-orange-500 rounded-lg flex items-center justify-center">
                  <ArrowDown className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900">StudioCheck</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm">
                <ArrowDown className="h-4 w-4 mr-2" />
                Notifications
              </Button>
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Welcome to StudioCheck!
          </h1>
          <p className="text-lg text-slate-600">
            Ready to analyze your construction documents with AI-powered QA/QC?
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <CreateProjectDialog>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                <ArrowDown className="h-12 w-12 text-red-600 mb-4" />
                <h3 className="font-semibold text-slate-900 mb-2">New Project</h3>
                <p className="text-sm text-slate-600">Start a fresh QA/QC analysis</p>
              </CardContent>
            </Card>
          </CreateProjectDialog>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <ArrowDown className="h-12 w-12 text-orange-600 mb-4" />
              <h3 className="font-semibold text-slate-900 mb-2">Upload Files</h3>
              <p className="text-sm text-slate-600">Add drawings & specifications</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <ArrowDown className="h-12 w-12 text-red-600 mb-4" />
              <h3 className="font-semibold text-slate-900 mb-2">Recent Reports</h3>
              <p className="text-sm text-slate-600">View analysis results</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <ArrowDown className="h-12 w-12 text-orange-600 mb-4" />
              <h3 className="font-semibold text-slate-900 mb-2">Team Access</h3>
              <p className="text-sm text-slate-600">Collaborate with your team</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
            <CardHeader>
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>Your latest QA/QC analyses</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-slate-500">
                  <ArrowDown className="h-12 w-12 mx-auto mb-4 animate-spin" />
                  <p>Loading projects...</p>
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <ArrowDown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No projects yet. Create your first project to get started!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.slice(0, 5).map((project) => (
                    <Link key={project.id} to={`/project/${project.id}`}>
                      <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                        <h3 className="font-medium text-slate-900">{project.name}</h3>
                        {project.description && (
                          <p className="text-sm text-slate-600 mt-1">{project.description}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                          Created {new Date(project.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analysis Status</CardTitle>
              <CardDescription>Current processing queue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-slate-500">
                <ArrowDown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active analyses. Upload files to begin processing.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

const Dashboard = () => {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
};

export default Dashboard;
