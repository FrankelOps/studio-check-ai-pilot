
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowDown, CheckCircle, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Map Supabase auth errors to user-friendly messages
const getSignupErrorMessage = (error: any): string => {
  const msg = error?.message?.toLowerCase() || '';
  
  if (msg.includes('already registered') || msg.includes('already exists')) {
    return 'This email is already registered. Please sign in instead.';
  }
  if (msg.includes('password') && msg.includes('weak')) {
    return 'Password is too weak. Use at least 8 characters with letters and numbers.';
  }
  if (msg.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Connection error. Please check your internet and try again.';
  }
  return 'Unable to create account. Please try again or contact support.';
};

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState<{ email: string; needsConfirmation: boolean } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Password mismatch",
        description: "Passwords do not match. Please try again.",
      });
      return;
    }

    if (!acceptTerms) {
      toast({
        variant: "destructive",
        title: "Terms required",
        description: "Please accept the terms and conditions to continue.",
      });
      return;
    }

    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/login`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) throw error;

      // Check if email confirmation is required
      // If user.identities is empty, email confirmation is required
      const needsConfirmation = !data.user?.identities?.length || data.user?.identities?.length === 0;
      
      setSignupSuccess({ email, needsConfirmation });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign up failed",
        description: getSignupErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
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

  // Success state after signup
  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-orange-500 rounded-lg flex items-center justify-center">
                <ArrowDown className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-slate-900">StudioCheck</span>
            </Link>
          </div>

          <Card className="border-slate-200 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  {signupSuccess.needsConfirmation ? (
                    <Mail className="h-8 w-8 text-green-600" />
                  ) : (
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Account Created!</h2>
                <p className="text-slate-600">
                  {signupSuccess.needsConfirmation ? (
                    <>
                      We've sent a confirmation email to <strong>{signupSuccess.email}</strong>.
                      <br />
                      Please check your inbox and click the link to activate your account.
                    </>
                  ) : (
                    <>
                      Your account is ready! You can now sign in with <strong>{signupSuccess.email}</strong>.
                    </>
                  )}
                </p>
                <Button 
                  className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600"
                  onClick={() => navigate('/login')}
                >
                  Go to Sign In
                </Button>
                {signupSuccess.needsConfirmation && (
                  <p className="text-xs text-slate-500">
                    Didn't receive the email? Check your spam folder or try signing up again.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
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
            <CardTitle className="text-2xl">Get Started</CardTitle>
            <CardDescription>
              Create your StudioCheck account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
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
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="terms"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                />
                <Label htmlFor="terms" className="text-sm leading-relaxed">
                  I agree to the{' '}
                  <a href="#" className="text-red-600 hover:text-red-700">Terms of Service</a>
                  {' '}and{' '}
                  <a href="#" className="text-red-600 hover:text-red-700">Privacy Policy</a>
                </Label>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600"
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <p className="text-slate-600">
                Already have an account?{' '}
                <Link to="/login" className="text-red-600 hover:text-red-700 font-medium">
                  Sign in
                </Link>
              </p>
            </div>

            {/* Legal Disclaimer */}
            <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <ArrowDown className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  StudioCheck provides AI-assisted analysis for informational purposes only. 
                  All findings must be verified by licensed professionals. We do not replace 
                  professional architectural, engineering, or code compliance review.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
