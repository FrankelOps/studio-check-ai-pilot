export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          completed_at: string | null
          created_at: string | null
          decision_id: string | null
          description: string
          due_date: string | null
          id: string
          priority: string | null
          project_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          decision_id?: string | null
          description: string
          due_date?: string | null
          id?: string
          priority?: string | null
          project_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          decision_id?: string | null
          description?: string
          due_date?: string | null
          id?: string
          priority?: string | null
          project_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_items_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "design_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_door_schedule_items_v1: {
        Row: {
          confidence: number
          created_at: string
          door_id: string
          evidence_asset_path: string
          extraction_source: string
          id: string
          job_id: string
          project_id: string
          row_bbox: Json
          schedule_sheet_number: string
          snippet_text: string
          source_index: number
        }
        Insert: {
          confidence: number
          created_at?: string
          door_id: string
          evidence_asset_path: string
          extraction_source: string
          id?: string
          job_id: string
          project_id: string
          row_bbox: Json
          schedule_sheet_number: string
          snippet_text: string
          source_index: number
        }
        Update: {
          confidence?: number
          created_at?: string
          door_id?: string
          evidence_asset_path?: string
          extraction_source?: string
          id?: string
          job_id?: string
          project_id?: string
          row_bbox?: Json
          schedule_sheet_number?: string
          snippet_text?: string
          source_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "analysis_door_schedule_items_v1_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_door_schedule_items_v1_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_door_tags_v1: {
        Row: {
          bbox: Json
          confidence: number
          created_at: string
          door_id: string
          evidence_asset_path: string
          extraction_source: string
          id: string
          job_id: string
          project_id: string
          sheet_number: string
          snippet_text: string
          source_index: number
        }
        Insert: {
          bbox: Json
          confidence: number
          created_at?: string
          door_id: string
          evidence_asset_path: string
          extraction_source: string
          id?: string
          job_id: string
          project_id: string
          sheet_number: string
          snippet_text: string
          source_index: number
        }
        Update: {
          bbox?: Json
          confidence?: number
          created_at?: string
          door_id?: string
          evidence_asset_path?: string
          extraction_source?: string
          id?: string
          job_id?: string
          project_id?: string
          sheet_number?: string
          snippet_text?: string
          source_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "analysis_door_tags_v1_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_door_tags_v1_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_issues_v1: {
        Row: {
          created_at: string
          id: string
          issue_json: Json
          job_id: string
          pattern_id: string
          pattern_version: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_json: Json
          job_id: string
          pattern_id: string
          pattern_version: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_json?: Json
          job_id?: string
          pattern_id?: string
          pattern_version?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_issues_v1_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_issues_v1_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          error: string | null
          file_id: string
          finished_at: string | null
          id: string
          model: string | null
          params: Json
          pass: number
          processed_pages: number
          project_id: string
          started_at: string | null
          status: string
          total_pages: number
        }
        Insert: {
          error?: string | null
          file_id: string
          finished_at?: string | null
          id?: string
          model?: string | null
          params?: Json
          pass?: number
          processed_pages?: number
          project_id: string
          started_at?: string | null
          status?: string
          total_pages?: number
        }
        Update: {
          error?: string | null
          file_id?: string
          finished_at?: string | null
          id?: string
          model?: string | null
          params?: Json
          pass?: number
          processed_pages?: number
          project_id?: string
          started_at?: string | null
          status?: string
          total_pages?: number
        }
        Relationships: []
      }
      analysis_page_results: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error: string | null
          findings: Json
          job_id: string
          model: string | null
          page: number
          status: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          findings?: Json
          job_id: string
          model?: string | null
          page: number
          status?: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          findings?: Json
          job_id?: string
          model?: string | null
          page?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_page_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_page_tasks: {
        Row: {
          created_at: string | null
          job_id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          page: number
          retries: number
          state: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          job_id: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          page: number
          retries?: number
          state?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          job_id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          page?: number
          retries?: number
          state?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_page_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_preflight_reports: {
        Row: {
          created_at: string
          created_by: string
          flags: Json
          id: string
          job_id: string
          metrics: Json
          project_id: string
          recommendations: Json
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          flags?: Json
          id?: string
          job_id: string
          metrics?: Json
          project_id: string
          recommendations?: Json
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string
          flags?: Json
          id?: string
          job_id?: string
          metrics?: Json
          project_id?: string
          recommendations?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_preflight_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_references_v1: {
        Row: {
          bbox: Json
          calling_sheet_number: string
          confidence: number
          created_at: string
          evidence_asset_path: string
          extraction_source: string
          id: string
          job_id: string
          project_id: string
          ref_id: string
          ref_type: string
          snippet_text: string
          source_index: number
          target_sheet_number: string
        }
        Insert: {
          bbox: Json
          calling_sheet_number: string
          confidence: number
          created_at?: string
          evidence_asset_path: string
          extraction_source: string
          id?: string
          job_id: string
          project_id: string
          ref_id: string
          ref_type: string
          snippet_text: string
          source_index: number
          target_sheet_number: string
        }
        Update: {
          bbox?: Json
          calling_sheet_number?: string
          confidence?: number
          created_at?: string
          evidence_asset_path?: string
          extraction_source?: string
          id?: string
          job_id?: string
          project_id?: string
          ref_id?: string
          ref_type?: string
          snippet_text?: string
          source_index?: number
          target_sheet_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_references_v1_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_references_v1_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_results: {
        Row: {
          analysis_data: Json
          created_at: string
          file_id: string
          id: string
          project_id: string
          status: string
        }
        Insert: {
          analysis_data: Json
          created_at?: string
          file_id: string
          id?: string
          project_id: string
          status?: string
        }
        Update: {
          analysis_data?: Json
          created_at?: string
          file_id?: string
          id?: string
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_results_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_sheet_index_v2: {
        Row: {
          attempt_count: number | null
          confidence: number
          created_at: string
          crop_asset_path: string | null
          crop_reason: string | null
          crop_strategy: string | null
          crop_valid: boolean | null
          discipline: string | null
          extraction_notes: Json
          extraction_source: string | null
          id: string
          job_id: string
          project_id: string
          sheet_kind: string | null
          sheet_number: string | null
          sheet_render_asset_path: string | null
          sheet_title: string | null
          source_index: number
          title_block_asset_path: string | null
        }
        Insert: {
          attempt_count?: number | null
          confidence?: number
          created_at?: string
          crop_asset_path?: string | null
          crop_reason?: string | null
          crop_strategy?: string | null
          crop_valid?: boolean | null
          discipline?: string | null
          extraction_notes?: Json
          extraction_source?: string | null
          id?: string
          job_id: string
          project_id: string
          sheet_kind?: string | null
          sheet_number?: string | null
          sheet_render_asset_path?: string | null
          sheet_title?: string | null
          source_index: number
          title_block_asset_path?: string | null
        }
        Update: {
          attempt_count?: number | null
          confidence?: number
          created_at?: string
          crop_asset_path?: string | null
          crop_reason?: string | null
          crop_strategy?: string | null
          crop_valid?: boolean | null
          discipline?: string | null
          extraction_notes?: Json
          extraction_source?: string | null
          id?: string
          job_id?: string
          project_id?: string
          sheet_kind?: string | null
          sheet_number?: string | null
          sheet_render_asset_path?: string | null
          sheet_title?: string | null
          source_index?: number
          title_block_asset_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_sheet_index_v2_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_target_labels_v1: {
        Row: {
          bbox: Json
          confidence: number
          created_at: string
          evidence_asset_path: string
          extraction_source: string
          id: string
          job_id: string
          label_id: string
          label_type: string
          project_id: string
          snippet_text: string
          source_index: number
          target_sheet_number: string
        }
        Insert: {
          bbox: Json
          confidence: number
          created_at?: string
          evidence_asset_path: string
          extraction_source: string
          id?: string
          job_id: string
          label_id: string
          label_type: string
          project_id: string
          snippet_text: string
          source_index: number
          target_sheet_number: string
        }
        Update: {
          bbox?: Json
          confidence?: number
          created_at?: string
          evidence_asset_path?: string
          extraction_source?: string
          id?: string
          job_id?: string
          label_id?: string
          label_type?: string
          project_id?: string
          snippet_text?: string
          source_index?: number
          target_sheet_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_target_labels_v1_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_target_labels_v1_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_titleblock_templates: {
        Row: {
          calibration_samples: Json
          confidence: number
          created_at: string
          discipline: string
          id: string
          job_id: string
          project_id: string
          template: Json
        }
        Insert: {
          calibration_samples?: Json
          confidence?: number
          created_at?: string
          discipline: string
          id?: string
          job_id: string
          project_id: string
          template?: Json
        }
        Update: {
          calibration_samples?: Json
          confidence?: number
          created_at?: string
          discipline?: string
          id?: string
          job_id?: string
          project_id?: string
          template?: Json
        }
        Relationships: [
          {
            foreignKeyName: "analysis_titleblock_templates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      check_execution_logs: {
        Row: {
          analysis_id: string | null
          created_at: string
          data: Json | null
          duration_ms: number | null
          function_name: string
          id: string
          level: string | null
          message: string | null
          project_id: string | null
          request_id: string | null
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          data?: Json | null
          duration_ms?: number | null
          function_name: string
          id?: string
          level?: string | null
          message?: string | null
          project_id?: string | null
          request_id?: string | null
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          data?: Json | null
          duration_ms?: number | null
          function_name?: string
          id?: string
          level?: string | null
          message?: string | null
          project_id?: string | null
          request_id?: string | null
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      decision_feedback: {
        Row: {
          content: string | null
          created_at: string | null
          decision_id: string
          id: string
          status: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          decision_id: string
          id?: string
          status?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          decision_id?: string
          id?: string
          status?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_feedback_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "design_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      design_logs: {
        Row: {
          created_at: string
          date: string | null
          file_id: string | null
          id: string
          meeting_event: string | null
          project_id: string
          rationale: string | null
          status: string | null
          summary: string
          tags: string[] | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          file_id?: string | null
          id?: string
          meeting_event?: string | null
          project_id: string
          rationale?: string | null
          status?: string | null
          summary: string
          tags?: string[] | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string | null
          file_id?: string | null
          id?: string
          meeting_event?: string | null
          project_id?: string
          rationale?: string | null
          status?: string | null
          summary?: string
          tags?: string[] | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_minutes: {
        Row: {
          created_at: string
          file_id: string
          has_transcript: boolean | null
          id: string
          meeting_date: string
          meeting_title: string
          project_id: string
          speaker_segments: Json | null
          summary_outline: string
          transcript_text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_id: string
          has_transcript?: boolean | null
          id?: string
          meeting_date: string
          meeting_title: string
          project_id: string
          speaker_segments?: Json | null
          summary_outline: string
          transcript_text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_id?: string
          has_transcript?: boolean | null
          id?: string
          meeting_date?: string
          meeting_title?: string
          project_id?: string
          speaker_segments?: Json | null
          summary_outline?: string
          transcript_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_minutes_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_minutes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      page_assets: {
        Row: {
          created_at: string | null
          dpi: number | null
          expires_at: string | null
          hash: string | null
          height: number | null
          image_url: string | null
          job_id: string
          ocr_url: string | null
          page: number
          updated_at: string | null
          width: number | null
        }
        Insert: {
          created_at?: string | null
          dpi?: number | null
          expires_at?: string | null
          hash?: string | null
          height?: number | null
          image_url?: string | null
          job_id: string
          ocr_url?: string | null
          page: number
          updated_at?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string | null
          dpi?: number | null
          expires_at?: string | null
          hash?: string | null
          height?: number | null
          image_url?: string | null
          job_id?: string
          ocr_url?: string | null
          page?: number
          updated_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "page_assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      parser_coverage_logs: {
        Row: {
          coverage_pct: number | null
          created_at: string
          data: Json | null
          file_id: string | null
          id: string
          pages_parsed: number | null
          pages_total: number | null
          parser_name: string
          project_id: string | null
        }
        Insert: {
          coverage_pct?: number | null
          created_at?: string
          data?: Json | null
          file_id?: string | null
          id?: string
          pages_parsed?: number | null
          pages_total?: number | null
          parser_name: string
          project_id?: string | null
        }
        Update: {
          coverage_pct?: number | null
          created_at?: string
          data?: Json | null
          file_id?: string | null
          id?: string
          pages_parsed?: number | null
          pages_total?: number | null
          parser_name?: string
          project_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          project_id: string
          role: Database["public"]["Enums"]["user_role"] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          retention_months: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          retention_months?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          retention_months?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qa_results: {
        Row: {
          analysis_id: string | null
          created_at: string | null
          evidence: Json | null
          id: string
          message: string
          module_id: string
          page_number: number | null
          rule_id: string
          severity: string
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string | null
          evidence?: Json | null
          id?: string
          message: string
          module_id: string
          page_number?: number | null
          rule_id: string
          severity: string
        }
        Update: {
          analysis_id?: string | null
          created_at?: string | null
          evidence?: Json | null
          id?: string
          message?: string
          module_id?: string
          page_number?: number | null
          rule_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_results_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analysis_results"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_embeddings: {
        Row: {
          content_text: string
          content_type: string
          created_at: string
          design_log_id: string
          embedding: string | null
          end_timestamp: number | null
          id: string
          speaker_name: string | null
          start_timestamp: number | null
          updated_at: string
        }
        Insert: {
          content_text: string
          content_type?: string
          created_at?: string
          design_log_id: string
          embedding?: string | null
          end_timestamp?: number | null
          id?: string
          speaker_name?: string | null
          start_timestamp?: number | null
          updated_at?: string
        }
        Update: {
          content_text?: string
          content_type?: string
          created_at?: string
          design_log_id?: string
          embedding?: string | null
          end_timestamp?: number | null
          id?: string
          speaker_name?: string | null
          start_timestamp?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_embeddings_design_log_id_fkey"
            columns: ["design_log_id"]
            isOneToOne: false
            referencedRelation: "design_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          project_id: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          project_id: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          project_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_project_id_from_job: { Args: { job_uuid: string }; Returns: string }
      is_project_actor: { Args: { pid: string }; Returns: boolean }
      is_project_owner_or_member: {
        Args: { project_uuid: string }
        Returns: boolean
      }
      safe_extract_project_id: { Args: { path: string }; Returns: string }
      search_transcript_embeddings: {
        Args: {
          match_count?: number
          match_threshold?: number
          project_id_param?: string
          query_embedding: string
        }
        Returns: {
          content_text: string
          content_type: string
          created_at: string
          date: string
          design_log_id: string
          id: string
          meeting_event: string
          rationale: string
          similarity: number
          summary: string
          type: string
        }[]
      }
    }
    Enums: {
      user_role: "architect" | "owner" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      user_role: ["architect", "owner", "admin"],
    },
  },
} as const
