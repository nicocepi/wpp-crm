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
      appointment_settings: {
        Row: {
          allow_choose_professional: boolean
          allow_multiple_per_conversation: boolean
          appointment_minutes: number
          cancellation_policy: string | null
          created_at: string | null
          auto_assign_professional: boolean
          enabled: boolean
          gcal_sync_enabled: boolean
          hold_minutes: number
          max_advance_days: number
          min_lead_minutes: number
          msg_cancel_template: string | null
          msg_confirm_template: string | null
          msg_welcome_menu: string | null
          reschedule_policy: string | null
          slot_minutes: number
          tenant_id: string
          timezone: string
        }
        Insert: {
          allow_choose_professional?: boolean
          allow_multiple_per_conversation?: boolean
          appointment_minutes?: number
          cancellation_policy?: string | null
          created_at?: string | null
          auto_assign_professional?: boolean
          enabled?: boolean
          gcal_sync_enabled?: boolean
          hold_minutes?: number
          max_advance_days?: number
          min_lead_minutes?: number
          msg_cancel_template?: string | null
          msg_confirm_template?: string | null
          msg_welcome_menu?: string | null
          reschedule_policy?: string | null
          slot_minutes?: number
          tenant_id: string
          timezone?: string
        }
        Update: {
          allow_choose_professional?: boolean
          allow_multiple_per_conversation?: boolean
          appointment_minutes?: number
          cancellation_policy?: string | null
          created_at?: string | null
          auto_assign_professional?: boolean
          enabled?: boolean
          gcal_sync_enabled?: boolean
          hold_minutes?: number
          max_advance_days?: number
          min_lead_minutes?: number
          msg_cancel_template?: string | null
          msg_confirm_template?: string | null
          msg_welcome_menu?: string | null
          reschedule_policy?: string | null
          slot_minutes?: number
          tenant_id?: string
          timezone?: string
        }
        Relationships: []
      }
      specialties: {
        Row: {
          active: boolean
          created_at: string | null
          description: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: []
      }
      treatments: {
        Row: {
          active: boolean
          buffer_minutes: number
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number | null
          requirements: string | null
          specialty_id: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          buffer_minutes?: number
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          price?: number | null
          requirements?: string | null
          specialty_id?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          buffer_minutes?: number
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price?: number | null
          requirements?: string | null
          specialty_id?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      professionals: {
        Row: {
          active: boolean
          color: string | null
          created_at: string | null
          external_ref: string | null
          first_name: string
          id: string
          last_name: string | null
          max_per_slot: number
          slot_minutes: number | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string | null
          external_ref?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          max_per_slot?: number
          slot_minutes?: number | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string | null
          external_ref?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          max_per_slot?: number
          slot_minutes?: number | null
          tenant_id?: string
        }
        Relationships: []
      }
      professional_specialties: {
        Row: { professional_id: string; specialty_id: string }
        Insert: { professional_id: string; specialty_id: string }
        Update: { professional_id?: string; specialty_id?: string }
        Relationships: []
      }
      professional_treatments: {
        Row: {
          duration_minutes: number | null
          max_per_slot: number | null
          professional_id: string
          slot_minutes: number | null
          treatment_id: string
        }
        Insert: {
          duration_minutes?: number | null
          max_per_slot?: number | null
          professional_id: string
          slot_minutes?: number | null
          treatment_id: string
        }
        Update: {
          duration_minutes?: number | null
          max_per_slot?: number | null
          professional_id?: string
          slot_minutes?: number | null
          treatment_id?: string
        }
        Relationships: []
      }
      professional_schedules: {
        Row: {
          active: boolean
          created_at: string | null
          end_time: string
          id: string
          professional_id: string
          start_time: string
          tenant_id: string
          weekday: number
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          end_time: string
          id?: string
          professional_id: string
          start_time: string
          tenant_id: string
          weekday: number
        }
        Update: {
          active?: boolean
          created_at?: string | null
          end_time?: string
          id?: string
          professional_id?: string
          start_time?: string
          tenant_id?: string
          weekday?: number
        }
        Relationships: []
      }
      availability_exceptions: {
        Row: {
          created_at: string | null
          date: string
          end_time: string | null
          id: string
          professional_id: string | null
          reason: string | null
          start_time: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time?: string | null
          id?: string
          professional_id?: string | null
          reason?: string | null
          start_time?: string | null
          tenant_id: string
          type?: string
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string | null
          id?: string
          professional_id?: string | null
          reason?: string | null
          start_time?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          contact_id: string | null
          correlation_id: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number
          end_at: string
          gcal_calendar_id: string | null
          gcal_event_id: string | null
          hold_expires_at: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          origin: string
          phone: string | null
          professional_id: string | null
          rescheduled_from: string | null
          specialty_id: string | null
          start_at: string
          status: string
          sync_error: string | null
          sync_status: string
          synced_at: string | null
          tenant_id: string
          treatment_id: string | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes: number
          end_at: string
          gcal_calendar_id?: string | null
          gcal_event_id?: string | null
          hold_expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          origin?: string
          phone?: string | null
          professional_id?: string | null
          rescheduled_from?: string | null
          specialty_id?: string | null
          start_at: string
          status?: string
          sync_error?: string | null
          sync_status?: string
          synced_at?: string | null
          tenant_id: string
          treatment_id?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number
          end_at?: string
          gcal_calendar_id?: string | null
          gcal_event_id?: string | null
          hold_expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          origin?: string
          phone?: string | null
          professional_id?: string | null
          rescheduled_from?: string | null
          specialty_id?: string | null
          start_at?: string
          status?: string
          sync_error?: string | null
          sync_status?: string
          synced_at?: string | null
          tenant_id?: string
          treatment_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      appointment_audit: {
        Row: {
          action: string
          actor_source: string
          actor_user_id: string | null
          appointment_id: string | null
          correlation_id: string | null
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_source?: string
          actor_user_id?: string | null
          appointment_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_source?: string
          actor_user_id?: string | null
          appointment_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          tenant_id?: string
        }
        Relationships: []
      }
      gcal_connections: {
        Row: {
          access_token_encrypted: string | null
          calendar_id: string | null
          created_at: string | null
          google_account_email: string | null
          id: string
          last_sync_at: string | null
          professional_id: string | null
          refresh_token_encrypted: string | null
          scopes: string | null
          status: string
          tenant_id: string
          token_expires_at: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          calendar_id?: string | null
          created_at?: string | null
          google_account_email?: string | null
          id?: string
          last_sync_at?: string | null
          professional_id?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string | null
          status?: string
          tenant_id: string
          token_expires_at?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          calendar_id?: string | null
          created_at?: string | null
          google_account_email?: string | null
          id?: string
          last_sync_at?: string | null
          professional_id?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string | null
          status?: string
          tenant_id?: string
          token_expires_at?: string | null
        }
        Relationships: []
      }
      gcal_sync_outbox: {
        Row: {
          appointment_id: string | null
          attempts: number
          correlation_id: string | null
          created_at: string | null
          id: string
          last_error: string | null
          next_attempt_at: string | null
          operation: string
          payload: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          appointment_id?: string | null
          attempts?: number
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          operation: string
          payload?: Json | null
          status?: string
          tenant_id: string
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          operation?: string
          payload?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
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
      book_appointment: {
        Args: {
          p_tenant_id: string
          p_professional_id: string
          p_treatment_id: string
          p_specialty_id: string
          p_start_at: string
          p_duration_minutes: number
          p_status?: string
          p_contact_id?: string | null
          p_phone?: string | null
          p_origin?: string
          p_hold_minutes?: number
          p_idempotency_key?: string | null
          p_correlation_id?: string | null
          p_created_by?: string | null
          p_notes?: string | null
        }
        Returns: Database["public"]["Tables"]["appointments"]["Row"]
      }
      confirm_held_appointment: {
        Args: {
          p_appointment_id: string
          p_tenant_id: string
          p_correlation_id?: string | null
          p_created_by?: string | null
        }
        Returns: Database["public"]["Tables"]["appointments"]["Row"]
      }
      reopen_appointment: {
        Args: {
          p_tenant_id: string
          p_appointment_id: string
          p_status?: string
          p_correlation_id?: string | null
          p_created_by?: string | null
        }
        Returns: Database["public"]["Tables"]["appointments"]["Row"]
      }
      expire_appointment_holds: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
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
