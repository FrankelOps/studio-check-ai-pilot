
import { createClient } from '@supabase/supabase-js';

// These would be environment variables in production
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'your-supabase-url';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-anon-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database types
export interface Project {
  id: string;
  name: string;
  description?: string;
  user_id: string;
  data_retention_months: number;
  created_at: string;
  updated_at: string;
}

export interface Upload {
  id: string;
  project_id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  upload_status: 'uploading' | 'completed' | 'failed';
  version_number: number;
  supersedes_id?: string;
  created_at: string;
}

export interface Analysis {
  id: string;
  upload_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  ai_provider: string;
  findings: any;
  confidence_scores: any;
  processing_time_ms?: number;
  failure_reason?: string;
  created_at: string;
  completed_at?: string;
}

export interface Report {
  id: string;
  analysis_id: string;
  report_type: string;
  content: any;
  pdf_url?: string;
  shareable_link?: string;
  expires_at?: string;
  created_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'reviewer' | 'viewer';
  invited_by: string;
  created_at: string;
}

export interface AiPrompt {
  id: string;
  name: string;
  category: 'code_compliance' | 'coordination' | 'specifications' | 'general';
  prompt_text: string;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'analysis_complete' | 'analysis_failed' | 'team_invite' | 'system';
  title: string;
  message: string;
  is_read: boolean;
  related_id?: string;
  created_at: string;
}
