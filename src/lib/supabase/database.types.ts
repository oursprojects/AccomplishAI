/**
 * Hand-written to mirror `supabase gen types typescript` for 0001_init.sql.
 * Regenerate after schema changes:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name_last_first: string;
          name_first_last: string;
          office: string;
          default_verifier: string;
          default_daily_hours: number;
          internship_start_date: string | null;
          target_ojt_hours: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name_last_first?: string;
          name_first_last?: string;
          office?: string;
          default_verifier?: string;
          default_daily_hours?: number;
          internship_start_date?: string | null;
          target_ojt_hours?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          original_path: string;
          storage_path: string;
          schema: Json;
          status: "pending_review" | "confirmed";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name?: string;
          original_path: string;
          storage_path: string;
          schema?: Json;
          status?: "pending_review" | "confirmed";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["templates"]["Insert"]>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          user_id: string;
          template_id: string | null;
          title: string;
          raw_notes: string;
          structured_data: Json;
          chat_messages: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          template_id?: string | null;
          title?: string;
          raw_notes?: string;
          structured_data?: Json;
          chat_messages?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "reports_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_settings: {
        Row: {
          id: number;
          default_daily_prompt_limit: number;
          default_max_reports: number | null;
          active_text_model: string;
          active_stt_model: string;
          max_bullets_per_day: number;
          max_chat_messages: number;
          global_rpm_limit: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          default_daily_prompt_limit?: number;
          default_max_reports?: number | null;
          active_text_model?: string;
          active_stt_model?: string;
          max_bullets_per_day?: number;
          max_chat_messages?: number;
          global_rpm_limit?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_settings"]["Insert"]>;
        Relationships: [];
      };
      user_quotas: {
        Row: {
          user_id: string;
          email: string;
          custom_daily_limit: number | null;
          custom_max_reports: number | null;
          is_blocked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email?: string;
          custom_daily_limit?: number | null;
          custom_max_reports?: number | null;
          is_blocked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_quotas"]["Insert"]>;
        Relationships: [];
      };
      prompt_usage_logs: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          model: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          kind?: string;
          model?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prompt_usage_logs"]["Insert"]>;
        Relationships: [];
      };
      workspace_drafts: {
        Row: {
          user_id: string;
          report_id: string | null;
          structured_data: Json;
          chat_messages: Json;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          report_id?: string | null;
          structured_data?: Json;
          chat_messages?: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_drafts"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type TemplateRow = Database["public"]["Tables"]["templates"]["Row"];
export type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
