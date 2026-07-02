export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bot_configs: {
        Row: {
          alert_delay_minutes: number
          alert_email: string | null
          enabled: boolean | null
          flow_definition: Json | null
          flow_type: string
          reply_delay_seconds: number | null
          system_prompt: string | null
          tenant_id: string
        }
        Insert: {
          alert_delay_minutes?: number
          alert_email?: string | null
          enabled?: boolean | null
          flow_definition?: Json | null
          flow_type?: string
          reply_delay_seconds?: number | null
          system_prompt?: string | null
          tenant_id: string
        }
        Update: {
          alert_delay_minutes?: number
          alert_email?: string | null
          enabled?: boolean | null
          flow_definition?: Json | null
          flow_type?: string
          reply_delay_seconds?: number | null
          system_prompt?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_labels: {
        Row: {
          contact_id: string
          label_id: string
        }
        Insert: {
          contact_id: string
          label_id: string
        }
        Update: {
          contact_id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_labels_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string | null
          flow_state: Json
          handoff: boolean
          handoff_at: string | null
          handoff_by: string | null
          handoff_by_name: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          name: string | null
          needs: string | null
          phone: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          flow_state?: Json
          handoff?: boolean
          handoff_at?: string | null
          handoff_by?: string | null
          handoff_by_name?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          name?: string | null
          needs?: string | null
          phone: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          flow_state?: Json
          handoff?: boolean
          handoff_at?: string | null
          handoff_by?: string | null
          handoff_by_name?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          name?: string | null
          needs?: string | null
          phone?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_logs: {
        Row: {
          contact_id: string | null
          created_at: string | null
          data: Json | null
          event: string
          id: string
          level: string
          message: string | null
          phone: string | null
          source: string
          tenant_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          data?: Json | null
          event: string
          id?: string
          level?: string
          message?: string | null
          phone?: string | null
          source?: string
          tenant_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          data?: Json | null
          event?: string
          id?: string
          level?: string
          message?: string | null
          phone?: string | null
          source?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      failed_messages: {
        Row: {
          contact_phone: string | null
          content: string | null
          created_at: string | null
          error: string | null
          id: string
          tenant_id: string | null
        }
        Insert: {
          contact_phone?: string | null
          content?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          tenant_id?: string | null
        }
        Update: {
          contact_phone?: string | null
          content?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          color: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          contact_id: string
          content: string | null
          created_at: string | null
          direction: string | null
          id: string
          media_filename: string | null
          media_mime: string | null
          media_url: string | null
          message_type: string | null
          sent_at: string
          tenant_id: string
          whatsapp_message_id: string | null
        }
        Insert: {
          contact_id: string
          content?: string | null
          created_at?: string | null
          direction?: string | null
          id?: string
          media_filename?: string | null
          media_mime?: string | null
          media_url?: string | null
          message_type?: string | null
          sent_at: string
          tenant_id: string
          whatsapp_message_id?: string | null
        }
        Update: {
          contact_id?: string
          content?: string | null
          created_at?: string | null
          direction?: string | null
          id?: string
          media_filename?: string | null
          media_mime?: string | null
          media_url?: string | null
          message_type?: string | null
          sent_at?: string
          tenant_id?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          role: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          role?: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          role?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          whatsapp_phone_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          whatsapp_phone_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          whatsapp_phone_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: Record<PropertyKey, never>; Returns: string }
    }
    Enums: {
      [_ in never]: never
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const
