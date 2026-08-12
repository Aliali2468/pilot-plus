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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      playlists: {
        Row: {
          channel_row_id: string
          created_at: string
          description: string | null
          id: string
          item_count: number
          playlist_id: string
          privacy_status: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_row_id: string
          created_at?: string
          description?: string | null
          id?: string
          item_count?: number
          playlist_id: string
          privacy_status?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_row_id?: string
          created_at?: string
          description?: string | null
          id?: string
          item_count?: number
          playlist_id?: string
          privacy_status?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlists_channel_row_id_fkey"
            columns: ["channel_row_id"]
            isOneToOne: false
            referencedRelation: "youtube_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      upload_jobs: {
        Row: {
          channel_row_id: string
          created_at: string
          error_message: string | null
          file_name: string | null
          file_size: number | null
          id: string
          metadata: Json
          progress: number
          scheduled_at: string | null
          status: string
          updated_at: string
          upload_url: string | null
          user_id: string
          video_id: string | null
        }
        Insert: {
          channel_row_id: string
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json
          progress?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          upload_url?: string | null
          user_id: string
          video_id?: string | null
        }
        Update: {
          channel_row_id?: string
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json
          progress?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          upload_url?: string | null
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_jobs_channel_row_id_fkey"
            columns: ["channel_row_id"]
            isOneToOne: false
            referencedRelation: "youtube_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          category_id: string | null
          channel_row_id: string
          comment_count: number
          created_at: string
          description: string | null
          duration: string | null
          id: string
          like_count: number
          privacy_status: string | null
          published_at: string | null
          scheduled_at: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          upload_status: string | null
          user_id: string
          video_id: string
          view_count: number
        }
        Insert: {
          category_id?: string | null
          channel_row_id: string
          comment_count?: number
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          like_count?: number
          privacy_status?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          upload_status?: string | null
          user_id: string
          video_id: string
          view_count?: number
        }
        Update: {
          category_id?: string | null
          channel_row_id?: string
          comment_count?: number
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          like_count?: number
          privacy_status?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          upload_status?: string | null
          user_id?: string
          video_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "videos_channel_row_id_fkey"
            columns: ["channel_row_id"]
            isOneToOne: false
            referencedRelation: "youtube_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_channels: {
        Row: {
          channel_id: string
          created_at: string
          description: string | null
          google_email: string | null
          handle: string | null
          id: string
          last_synced_at: string | null
          status: string
          subscriber_count: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          uploads_playlist_id: string | null
          user_id: string
          video_count: number
          view_count: number
        }
        Insert: {
          channel_id: string
          created_at?: string
          description?: string | null
          google_email?: string | null
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          status?: string
          subscriber_count?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          uploads_playlist_id?: string | null
          user_id: string
          video_count?: number
          view_count?: number
        }
        Update: {
          channel_id?: string
          created_at?: string
          description?: string | null
          google_email?: string | null
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          status?: string
          subscriber_count?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          uploads_playlist_id?: string | null
          user_id?: string
          video_count?: number
          view_count?: number
        }
        Relationships: []
      }
      youtube_connections: {
        Row: {
          access_token: string | null
          channel_row_id: string | null
          created_at: string
          google_email: string | null
          id: string
          refresh_token: string | null
          revoked: boolean
          scope: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          channel_row_id?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string | null
          revoked?: boolean
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          channel_row_id?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string | null
          revoked?: boolean
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_connections_channel_row_id_fkey"
            columns: ["channel_row_id"]
            isOneToOne: false
            referencedRelation: "youtube_channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
