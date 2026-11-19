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
          raw_notes: string;
          structured_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          template_id?: string | null;
          raw_notes?: string;
          structured_data?: Json;
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
