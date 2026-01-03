import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowDown, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the hash fragment or query params from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        // Check for error in URL params
        const error = hashParams.get('error') || queryParams.get('error');
        const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');
        
        if (error) {
          console.error('Auth callback error:', error, errorDescription);
          setStatus('error');
          toast({
            variant: "destructive",
            title: "Authentication failed",
            description: errorDescription || "Unable to complete sign in. Please try again.",
          });
          setTimeout(() => navigate('/login', { replace: true }), 2000);
          return;
        }

        // Supabase handles the token exchange automatically when using PKCE
        // We just need to check if we now have a session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setStatus('error');
          toast({
            variant: "destructive",
            title: "Authentication failed",
            description: "Unable to complete sign in. Please try again.",
          });
          setTimeout(() => navigate('/login', { replace: true }), 2000);
          return;
        }

        if (session) {
          // Mark that we should show a success message (one-time flag)
          sessionStorage.setItem('auth_email_confirmed', 'true');
          setStatus('success');
          
          // Brief delay to show success state
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
          }, 1000);
        } else {
          // No session yet - might still be processing
          // Wait a moment and check again
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          
          if (retrySession) {
            sessionStorage.setItem('auth_email_confirmed', 'true');
            setStatus('success');
            setTimeout(() => navigate('/dashboard', { replace: true }), 1000);
          } else {
            // Still no session - redirect to login
            setStatus('error');
            toast({
              variant: "destructive",
              title: "Session not found",
              description: "Please sign in again.",
            });
            setTimeout(() => navigate('/login', { replace: true }), 2000);
          }
        }
      } catch (err) {
        console.error('Auth callback exception:', err);
        setStatus('error');
        toast({
          variant: "destructive",
          title: "Something went wrong",
          description: "Please try signing in again.",
        });
        setTimeout(() => navigate('/login', { replace: true }), 2000);
      }
    };

    handleAuthCallback();
  }, [navigate, toast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        {status === 'processing' && (
          <>
            <ArrowDown className="h-12 w-12 animate-spin text-red-600 mx-auto" />
            <p className="text-slate-600 text-lg">Completing sign in...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-slate-900 text-lg font-medium">Email confirmed!</p>
            <p className="text-slate-600">Redirecting to dashboard...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-slate-600">Redirecting to login...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
