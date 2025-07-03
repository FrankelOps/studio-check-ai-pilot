
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Upload, FileText, Users, Bell, LogOut, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { NotificationCenter } from '@/components/NotificationCenter';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import type { User } from '@supabase/supabase-js';

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }
      setUser(user);
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out successfully",
      description: "You have been logged out of StudioCheck.",
    });
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading dashboard...</p>
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
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-orange-500 rounded-lg flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900">StudioCheck</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <NotificationCenter />
              <div className="text-sm text-slate-600">
                {user?.email}
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Welcome back, {user?.user_metadata?.first_name || 'User'}!
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
                <Plus className="h-12 w-12 text-red-600 mb-4" />
                <h3 className="font-semibold text-slate-900 mb-2">New Project</h3>
                <p className="text-sm text-slate-600">Start a fresh QA/QC analysis</p>
              </CardContent>
            </Card>
          </CreateProjectDialog>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <Upload className="h-12 w-12 text-orange-600 mb-4" />
              <h3 className="font-semibold text-slate-900 mb-2">Upload Files</h3>
              <p className="text-sm text-slate-600">Add drawings & specifications</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <FileText className="h-12 w-12 text-red-600 mb-4" />
              <h3 className="font-semibold text-slate-900 mb-2">Recent Reports</h3>
              <p className="text-sm text-slate-600">View analysis results</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <Users className="h-12 w-12 text-orange-600 mb-4" />
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
              <div className="text-center py-8 text-slate-500">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No projects yet. Create your first project to get started!</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analysis Status</CardTitle>
              <CardDescription>Current processing queue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-slate-500">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active analyses. Upload files to begin processing.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
