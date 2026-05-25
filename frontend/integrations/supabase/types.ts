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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activated_models: {
        Row: {
          activated_at: string | null
          domain: Database["public"]["Enums"]["model_domain"]
          id: string
          model_id: string
          model_name: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          domain: Database["public"]["Enums"]["model_domain"]
          id?: string
          model_id: string
          model_name: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          domain?: Database["public"]["Enums"]["model_domain"]
          id?: string
          model_id?: string
          model_name?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_pipelines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          schedule_config: Json | null
          steps: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          schedule_config?: Json | null
          steps?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          schedule_config?: Json | null
          steps?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_schedules: {
        Row: {
          created_at: string
          cron_expression: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          model_id: string
          model_name: string
          next_run_at: string | null
          prompt: string
          schedule_type: string
          scheduled_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cron_expression?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          model_id: string
          model_name: string
          next_run_at?: string | null
          prompt: string
          schedule_type: string
          scheduled_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cron_expression?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          model_id?: string
          model_name?: string
          next_run_at?: string | null
          prompt?: string
          schedule_type?: string
          scheduled_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string | null
          id: string
          model_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          model_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          model_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          decision_record_id: string
          event_type: string
          id: string
          notes: string | null
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          decision_record_id: string
          event_type: string
          id?: string
          notes?: string | null
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          decision_record_id?: string
          event_type?: string
          id?: string
          notes?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_events_decision_record_id_fkey"
            columns: ["decision_record_id"]
            isOneToOne: false
            referencedRelation: "decision_records"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_exports: {
        Row: {
          created_at: string
          decision_record_id: string
          exported_by: string
          file_hash: string | null
          format: string
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          decision_record_id: string
          exported_by: string
          file_hash?: string | null
          format: string
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          decision_record_id?: string
          exported_by?: string
          file_hash?: string | null
          format?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_exports_decision_record_id_fkey"
            columns: ["decision_record_id"]
            isOneToOne: false
            referencedRelation: "decision_records"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_records: {
        Row: {
          ai_confidence: number | null
          ai_human_agreement: boolean | null
          ai_output_snapshot: Json | null
          ai_recommendation: string | null
          created_at: string
          decision_type: string
          delta_summary: string | null
          domain: string
          final_decision: string | null
          final_decision_at: string | null
          final_decision_by: string | null
          final_reason_code: string | null
          final_reason_notes: string | null
          id: string
          input_snapshot: Json | null
          key_factors: Json | null
          model_version: string | null
          model_version_id: string | null
          pod_model_id: string
          pod_model_name: string
          policy_checks: Json | null
          prompt_snapshot: string | null
          reason_summary: string | null
          requires_review: boolean
          risk_level: string
          risk_score: number | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_human_agreement?: boolean | null
          ai_output_snapshot?: Json | null
          ai_recommendation?: string | null
          created_at?: string
          decision_type: string
          delta_summary?: string | null
          domain: string
          final_decision?: string | null
          final_decision_at?: string | null
          final_decision_by?: string | null
          final_reason_code?: string | null
          final_reason_notes?: string | null
          id?: string
          input_snapshot?: Json | null
          key_factors?: Json | null
          model_version?: string | null
          model_version_id?: string | null
          pod_model_id: string
          pod_model_name: string
          policy_checks?: Json | null
          prompt_snapshot?: string | null
          reason_summary?: string | null
          requires_review?: boolean
          risk_level?: string
          risk_score?: number | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_human_agreement?: boolean | null
          ai_output_snapshot?: Json | null
          ai_recommendation?: string | null
          created_at?: string
          decision_type?: string
          delta_summary?: string | null
          domain?: string
          final_decision?: string | null
          final_decision_at?: string | null
          final_decision_by?: string | null
          final_reason_code?: string | null
          final_reason_notes?: string | null
          id?: string
          input_snapshot?: Json | null
          key_factors?: Json | null
          model_version?: string | null
          model_version_id?: string | null
          pod_model_id?: string
          pod_model_name?: string
          policy_checks?: Json | null
          prompt_snapshot?: string | null
          reason_summary?: string | null
          requires_review?: boolean
          risk_level?: string
          risk_score?: number | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_records_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_reviews: {
        Row: {
          ai_recommendation: string | null
          confidence_score: number | null
          created_at: string
          decision_record_id: string | null
          decision_type: string
          domain: string
          id: string
          input_data: Json | null
          output_data: Json | null
          pod_model_id: string
          pod_model_name: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: string
          summary: string | null
          threshold_exceeded: boolean | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_recommendation?: string | null
          confidence_score?: number | null
          created_at?: string
          decision_record_id?: string | null
          decision_type: string
          domain: string
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          pod_model_id: string
          pod_model_name: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          summary?: string | null
          threshold_exceeded?: boolean | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_recommendation?: string | null
          confidence_score?: number | null
          created_at?: string
          decision_record_id?: string | null
          decision_type?: string
          domain?: string
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          pod_model_id?: string
          pod_model_name?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          summary?: string | null
          threshold_exceeded?: boolean | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_reviews_decision_record_id_fkey"
            columns: ["decision_record_id"]
            isOneToOne: false
            referencedRelation: "decision_records"
            referencedColumns: ["id"]
          },
        ]
      }
      device_analytics: {
        Row: {
          cpu_load_avg: number | null
          created_at: string
          date: string
          device_id: string
          error_count: number
          gpu_load_avg: number | null
          id: string
          model_id: string
          query_count: number
          token_usage: number
        }
        Insert: {
          cpu_load_avg?: number | null
          created_at?: string
          date?: string
          device_id: string
          error_count?: number
          gpu_load_avg?: number | null
          id?: string
          model_id: string
          query_count?: number
          token_usage?: number
        }
        Update: {
          cpu_load_avg?: number | null
          created_at?: string
          date?: string
          device_id?: string
          error_count?: number
          gpu_load_avg?: number | null
          id?: string
          model_id?: string
          query_count?: number
          token_usage?: number
        }
        Relationships: [
          {
            foreignKeyName: "device_analytics_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_licenses: {
        Row: {
          created_at: string
          device_id: string
          expires_at: string | null
          id: string
          issued_at: string
          issued_by: string | null
          license_type: Database["public"]["Enums"]["license_type"]
          notes: string | null
          status: Database["public"]["Enums"]["license_status"]
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          license_type?: Database["public"]["Enums"]["license_type"]
          notes?: string | null
          status?: Database["public"]["Enums"]["license_status"]
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          license_type?: Database["public"]["Enums"]["license_type"]
          notes?: string | null
          status?: Database["public"]["Enums"]["license_status"]
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_licenses_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_models: {
        Row: {
          allocated_at: string
          allocated_by: string | null
          device_id: string
          domain: string
          id: string
          is_downloaded: boolean | null
          last_synced_at: string | null
          model_id: string
          model_name: string
          ollama_model_name: string | null
        }
        Insert: {
          allocated_at?: string
          allocated_by?: string | null
          device_id: string
          domain: string
          id?: string
          is_downloaded?: boolean | null
          last_synced_at?: string | null
          model_id: string
          model_name: string
          ollama_model_name?: string | null
        }
        Update: {
          allocated_at?: string
          allocated_by?: string | null
          device_id?: string
          domain?: string
          id?: string
          is_downloaded?: boolean | null
          last_synced_at?: string | null
          model_id?: string
          model_name?: string
          ollama_model_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_models_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_sync_logs: {
        Row: {
          created_at: string
          details: Json | null
          device_id: string
          id: string
          status: string
          sync_type: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          device_id: string
          id?: string
          status: string
          sync_type: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          device_id?: string
          id?: string
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_sync_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_usage_logs: {
        Row: {
          device_id: string
          duration_seconds: number | null
          id: string
          logged_at: string
          model_id: string
          prompt_count: number | null
          tokens_used: number | null
        }
        Insert: {
          device_id: string
          duration_seconds?: number | null
          id?: string
          logged_at?: string
          model_id: string
          prompt_count?: number | null
          tokens_used?: number | null
        }
        Update: {
          device_id?: string
          duration_seconds?: number | null
          id?: string
          logged_at?: string
          model_id?: string
          prompt_count?: number | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "device_usage_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_name: string
          device_token: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          metadata: Json | null
          os_type: string | null
          registered_at: string
          registered_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_name: string
          device_token: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          metadata?: Json | null
          os_type?: string | null
          registered_at?: string
          registered_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_name?: string
          device_token?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          metadata?: Json | null
          os_type?: string | null
          registered_at?: string
          registered_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          file_size: number
          file_type: string
          filename: string
          id: string
          storage_path: string
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          file_size: number
          file_type: string
          filename: string
          id?: string
          storage_path: string
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          file_size?: number
          file_type?: string
          filename?: string
          id?: string
          storage_path?: string
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      federated_rounds: {
        Row: {
          aggregated_model_path: string | null
          aggregation_method: string | null
          completed_at: string | null
          current_participants: number | null
          distributed_at: string | null
          id: string
          metrics: Json | null
          min_participants: number | null
          model_id: string
          round_number: number
          started_at: string
          status: string
        }
        Insert: {
          aggregated_model_path?: string | null
          aggregation_method?: string | null
          completed_at?: string | null
          current_participants?: number | null
          distributed_at?: string | null
          id?: string
          metrics?: Json | null
          min_participants?: number | null
          model_id: string
          round_number: number
          started_at?: string
          status?: string
        }
        Update: {
          aggregated_model_path?: string | null
          aggregation_method?: string | null
          completed_at?: string | null
          current_participants?: number | null
          distributed_at?: string | null
          id?: string
          metrics?: Json | null
          min_participants?: number | null
          model_id?: string
          round_number?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      federated_contributions: {
        Row: {
          device_id: string
          gradient_hash: string
          gradient_size_bytes: number | null
          id: string
          metrics: Json | null
          model_id: string
          privacy_noise_added: boolean | null
          round_number: number
          status: string
          storage_path: string | null
          submitted_at: string
        }
        Insert: {
          device_id: string
          gradient_hash: string
          gradient_size_bytes?: number | null
          id?: string
          metrics?: Json | null
          model_id: string
          privacy_noise_added?: boolean | null
          round_number?: number
          status?: string
          storage_path?: string | null
          submitted_at?: string
        }
        Update: {
          device_id?: string
          gradient_hash?: string
          gradient_size_bytes?: number | null
          id?: string
          metrics?: Json | null
          model_id?: string
          privacy_noise_added?: boolean | null
          round_number?: number
          status?: string
          storage_path?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "federated_contributions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_items: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          action_taken: string | null
          created_at: string
          id: string
          payload: Json
          pod_id: string | null
          pod_name: string | null
          primary_action_label: string | null
          priority: string
          secondary_action_label: string | null
          source: string
          status: string
          subtitle: string | null
          summary: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          action_taken?: string | null
          created_at?: string
          id?: string
          payload?: Json
          pod_id?: string | null
          pod_name?: string | null
          primary_action_label?: string | null
          priority?: string
          secondary_action_label?: string | null
          source?: string
          status?: string
          subtitle?: string | null
          summary?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          action_taken?: string | null
          created_at?: string
          id?: string
          payload?: Json
          pod_id?: string | null
          pod_name?: string | null
          primary_action_label?: string | null
          priority?: string
          secondary_action_label?: string | null
          source?: string
          status?: string
          subtitle?: string | null
          summary?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_call_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          latency_ms: number | null
          request_summary: Json | null
          response_summary: Json | null
          source: string
          status: string
          token_id: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          request_summary?: Json | null
          response_summary?: Json | null
          source?: string
          status?: string
          token_id?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          request_summary?: Json | null
          response_summary?: Json | null
          source?: string
          status?: string
          token_id?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_call_log_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "mcp_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: Json
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: Json
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: Json
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      model_endpoints: {
        Row: {
          created_at: string | null
          endpoint_url: string
          id: string
          max_tokens: number | null
          name: string
          provider: Database["public"]["Enums"]["model_provider"]
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint_url: string
          id?: string
          max_tokens?: number | null
          name: string
          provider: Database["public"]["Enums"]["model_provider"]
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint_url?: string
          id?: string
          max_tokens?: number | null
          name?: string
          provider?: Database["public"]["Enums"]["model_provider"]
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      model_packs: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          domain: string
          id: string
          models: Json
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          domain: string
          id?: string
          models?: Json
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          domain?: string
          id?: string
          models?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          model_id: string
          model_name: string
          prompt_hash: string | null
          prompt_template: string | null
          rules_hash: string | null
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          model_id: string
          model_name: string
          prompt_hash?: string | null
          prompt_template?: string | null
          rules_hash?: string | null
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          model_id?: string
          model_name?: string
          prompt_hash?: string | null
          prompt_template?: string | null
          rules_hash?: string | null
          version?: string
        }
        Relationships: []
      }
      pod_activation_requests: {
        Row: {
          domain: string
          id: string
          model_id: string
          model_name: string
          rejection_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          domain: string
          id?: string
          model_id: string
          model_name: string
          rejection_reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          domain?: string
          id?: string
          model_id?: string
          model_name?: string
          rejection_reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      policy_comparisons: {
        Row: {
          comparison_result: Json | null
          created_at: string | null
          id: string
          policy_a_document_id: string | null
          policy_b_document_id: string | null
          user_id: string
        }
        Insert: {
          comparison_result?: Json | null
          created_at?: string | null
          id?: string
          policy_a_document_id?: string | null
          policy_b_document_id?: string | null
          user_id: string
        }
        Update: {
          comparison_result?: Json | null
          created_at?: string | null
          id?: string
          policy_a_document_id?: string | null
          policy_b_document_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_comparisons_policy_a_document_id_fkey"
            columns: ["policy_a_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_comparisons_policy_b_document_id_fkey"
            columns: ["policy_b_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      training_feedback: {
        Row: {
          corrected_response: string | null
          created_at: string
          device_id: string
          feedback_type: string
          id: string
          is_used_for_training: boolean | null
          metadata: Json | null
          model_id: string
          original_response: string
          prompt: string
          rating: number | null
        }
        Insert: {
          corrected_response?: string | null
          created_at?: string
          device_id: string
          feedback_type?: string
          id?: string
          is_used_for_training?: boolean | null
          metadata?: Json | null
          model_id: string
          original_response: string
          prompt: string
          rating?: number | null
        }
        Update: {
          corrected_response?: string | null
          created_at?: string
          device_id?: string
          feedback_type?: string
          id?: string
          is_used_for_training?: boolean | null
          metadata?: Json | null
          model_id?: string
          original_response?: string
          prompt?: string
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_feedback_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      training_jobs: {
        Row: {
          completed_at: string | null
          config: Json | null
          created_at: string
          device_id: string
          error_message: string | null
          feedback_count: number | null
          id: string
          metrics: Json | null
          model_id: string
          started_at: string | null
          status: string
          training_type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string
          device_id: string
          error_message?: string | null
          feedback_count?: number | null
          id?: string
          metrics?: Json | null
          model_id: string
          started_at?: string | null
          status?: string
          training_type?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string
          device_id?: string
          error_message?: string | null
          feedback_count?: number | null
          id?: string
          metrics?: Json | null
          model_id?: string
          started_at?: string | null
          status?: string
          training_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_jobs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      ams_connections: {
        Row: {
          id: string
          user_id: string
          ams_id: string
          auth_method: string
          username: string | null
          password: string | null
          api_key: string | null
          instance_url: string | null
          tenant_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ams_id: string
          auth_method: string
          username?: string | null
          password?: string | null
          api_key?: string | null
          instance_url?: string | null
          tenant_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ams_id?: string
          auth_method?: string
          username?: string | null
          password?: string | null
          api_key?: string | null
          instance_url?: string | null
          tenant_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      carrier_connections: {
        Row: {
          id: string
          user_id: string
          carrier_id: string
          username: string | null
          password: string | null
          producer_codes: Json
          extra: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          carrier_id: string
          username?: string | null
          password?: string | null
          producer_codes?: Json
          extra?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          carrier_id?: string
          username?: string | null
          password?: string | null
          producer_codes?: Json
          extra?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_pod_requests: {
        Row: {
          id: string
          user_id: string
          title: string
          sop_text: string | null
          sop_file_url: string | null
          target_carriers: Json
          priority: string
          status: string
          assigned_admin_id: string | null
          custom_agent_id: string | null
          installed_activated_model_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          sop_text?: string | null
          sop_file_url?: string | null
          target_carriers?: Json
          priority?: string
          status?: string
          assigned_admin_id?: string | null
          custom_agent_id?: string | null
          installed_activated_model_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          sop_text?: string | null
          sop_file_url?: string | null
          target_carriers?: Json
          priority?: string
          status?: string
          assigned_admin_id?: string | null
          custom_agent_id?: string | null
          installed_activated_model_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_retrieval_configs: {
        Row: {
          id: string
          user_id: string
          carrier_id: string
          sources: Json
          doc_types: Json
          email_alias: string | null
          is_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          carrier_id: string
          sources?: Json
          doc_types?: Json
          email_alias?: string | null
          is_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          carrier_id?: string
          sources?: Json
          doc_types?: Json
          email_alias?: string | null
          is_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_examples: {
        Row: {
          id: string
          user_id: string
          review_id: string | null
          model_id: string
          prompt: string
          original_output: string
          corrected_output: string | null
          rating: number | null
          feedback_type: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          review_id?: string | null
          model_id: string
          prompt: string
          original_output: string
          corrected_output?: string | null
          rating?: number | null
          feedback_type?: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          review_id?: string | null
          model_id?: string
          prompt?: string
          original_output?: string
          corrected_output?: string | null
          rating?: number | null
          feedback_type?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      training_overrides: {
        Row: {
          id: string
          user_id: string
          decision_review_id: string | null
          model_id: string
          original_output: string | null
          corrected_output: string
          reason_code: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          decision_review_id?: string | null
          model_id: string
          original_output?: string | null
          corrected_output: string
          reason_code?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          decision_review_id?: string | null
          model_id?: string
          original_output?: string | null
          corrected_output?: string
          reason_code?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visual_workflows: {
        Row: {
          created_at: string
          description: string | null
          edges: Json
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          nodes: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          edges?: Json
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          nodes?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          edges?: Json
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          nodes?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          current_step: number | null
          id: string
          started_at: string
          status: string
          step_results: Json | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          current_step?: number | null
          id?: string
          started_at?: string
          status?: string
          step_results?: Json | null
          user_id: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          current_step?: number | null
          id?: string
          started_at?: string
          status?: string
          step_results?: Json | null
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_template: boolean | null
          parsed_steps: Json | null
          sop_text: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean | null
          parsed_steps?: Json | null
          sop_text: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean | null
          parsed_steps?: Json | null
          sop_text?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_device_token: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      license_status: "active" | "suspended" | "expired"
      license_type: "standard" | "premium" | "model_based"
      model_domain: "insurance" | "healthcare" | "banking" | "legal" | "travel"
      model_provider: "ollama" | "lmstudio" | "openai" | "custom"
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
      app_role: ["admin", "user"],
      license_status: ["active", "suspended", "expired"],
      license_type: ["standard", "premium", "model_based"],
      model_domain: ["insurance", "healthcare", "banking", "legal", "travel"],
      model_provider: ["ollama", "lmstudio", "openai", "custom"],
    },
  },
} as const
