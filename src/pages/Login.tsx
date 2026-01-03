
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Map Supabase auth errors to user-friendly messages
const getLoginErrorMessage = (error: any): string => {
  const msg = error?.message?.toLowerCase() || '';
  
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Incorrect email or password. Please check and try again.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please check your email and click the confirmation link before signing in.';
  }
  if (msg.includes('too many requests') || msg.includes('rate limit')) {
    return 'Too many sign-in attempts. Please wait a few minutes and try again.';
  }
  if (msg.includes('user not found')) {
    return 'No account found with this email. Please sign up first.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Connection error. Please check your internet and try again.';
  }
  return 'Unable to sign in. Please try again or contact support.';
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Welcome back!",
        description: "Successfully signed in to StudioCheck.",
      });

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: getLoginErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearSession = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      await supabase.auth.signOut();
    }
    window.location.href = '/login';
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <ArrowDown className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  // Don't render form if already authenticated (will redirect)
  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-orange-500 rounded-lg flex items-center justify-center">
              <ArrowDown className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-slate-900">StudioCheck</span>
          </Link>
        </div>

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to your StudioCheck account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <p className="text-slate-600">
                Don't have an account?{' '}
                <Link to="/signup" className="text-red-600 hover:text-red-700 font-medium">
                  Sign up
                </Link>
              </p>
            </div>

            {/* Clear Session Button */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-slate-500 hover:text-slate-700"
                onClick={handleClearSession}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Clear session & switch accounts
              </Button>
            </div>

            {/* Legal Disclaimer */}
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <ArrowDown className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  By using StudioCheck, you acknowledge that all AI-generated analyses 
                  are for informational purposes only and must be verified by licensed professionals.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
