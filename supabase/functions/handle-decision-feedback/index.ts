import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { decisionId, type, content, status } = await req.json();
    
    if (!decisionId || !type) {
      throw new Error('Missing required parameters');
    }

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Authentication failed');
    }

    // Validate that the decision exists and user has access
    const { data: decision, error: decisionError } = await supabaseClient
      .from('design_logs')
      .select(`
        id,
        project_id,
        projects:project_id(user_id)
      `)
      .eq('id', decisionId)
      .single();

    if (decisionError || !decision) {
      throw new Error('Decision not found or access denied');
    }

    // Insert the feedback
    const { data: feedback, error: feedbackError } = await supabaseClient
      .from('decision_feedback')
      .insert({
        decision_id: decisionId,
        user_id: user.id,
        type: type,
        content: content || null,
        status: status || null,
      })
      .select()
      .single();

    if (feedbackError) {
      throw new Error(`Failed to save feedback: ${feedbackError.message}`);
    }

    // Create notification for project owner if this is from a project member
    if (decision.projects?.user_id && decision.projects.user_id !== user.id) {
      const notificationTitle = type === 'approval' 
        ? `Decision ${status || 'reviewed'}` 
        : 'New comment on decision';
        
      const notificationMessage = content 
        ? `"${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`
        : `A decision has been ${type === 'approval' ? status || 'reviewed' : 'commented on'}`;

      await supabaseClient
        .from('notifications')
        .insert({
          user_id: decision.projects.user_id,
          title: notificationTitle,
          message: notificationMessage,
          type: 'decision_feedback',
          related_id: decisionId,
        });
    }

    console.log(`Successfully saved ${type} feedback for decision ${decisionId}`);

    return new Response(
      JSON.stringify({
        success: true,
        feedback: feedback
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in handle-decision-feedback function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});