import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { UserMenu } from '@/components/UserMenu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AccountContent = () => {
  const { user } = useAuth();

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
            </div>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">Account</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Your StudioCheck account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-500">Email</label>
              <p className="text-slate-900">{user?.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-500">User ID</label>
              <p className="text-slate-900 font-mono text-sm">{user?.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-500">Account Created</label>
              <p className="text-slate-900">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

const Account = () => {
  return (
    <AuthGuard>
      <AccountContent />
    </AuthGuard>
  );
};

export default Account;
