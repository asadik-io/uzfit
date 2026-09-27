export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_statuses: {
        Row: {
          reason: string | null;
          status: Database["public"]["Enums"]["account_status"];
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        Insert: {
          reason?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
        };
        Update: {
          reason?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_statuses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activities: {
        Row: {
          category_id: string;
          created_at: string;
          default_capacity: number;
          description: NonNullable<Json>;
          duration_minutes: number;
          id: string;
          is_active: boolean;
          kind: Database["public"]["Enums"]["activity_kind"];
          title: NonNullable<Json>;
          updated_at: string;
          venue_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          default_capacity: number;
          description?: NonNullable<Json>;
          duration_minutes: number;
          id?: string;
          is_active?: boolean;
          kind: Database["public"]["Enums"]["activity_kind"];
          title: NonNullable<Json>;
          updated_at?: string;
          venue_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          default_capacity?: number;
          description?: NonNullable<Json>;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["activity_kind"];
          title?: NonNullable<Json>;
          updated_at?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      amenities: {
        Row: {
          icon: string;
          id: string;
          name: NonNullable<Json>;
          slug: string;
          sort_order: number;
        };
        Insert: {
          icon?: string;
          id?: string;
          name: NonNullable<Json>;
          slug: string;
          sort_order?: number;
        };
        Update: {
          icon?: string;
          id?: string;
          name?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_role: string;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          id: number;
          metadata: NonNullable<Json>;
          reason: string | null;
          request_id: string | null;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_role: string;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          reason?: string | null;
          request_id?: string | null;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_role?: string;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          reason?: string | null;
          request_id?: string | null;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          cancellation_deadline: string;
          cancellation_reason: string | null;
          cancellation_source: Database["public"]["Enums"]["cancellation_source"] | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          checked_in_at: string | null;
          checkin_closes_at: string;
          checkin_opens_at: string;
          created_at: string;
          finalized_at: string | null;
          id: string;
          idempotency_key: string;
          local_date: string;
          membership_id: string;
          policy_snapshot: NonNullable<Json>;
          session_ends_at: string;
          session_id: string;
          session_starts_at: string;
          state: Database["public"]["Enums"]["booking_state"];
          updated_at: string;
          user_id: string;
          venue_id: string;
        };
        Insert: {
          cancellation_deadline: string;
          cancellation_reason?: string | null;
          cancellation_source?: Database["public"]["Enums"]["cancellation_source"] | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          checked_in_at?: string | null;
          checkin_closes_at: string;
          checkin_opens_at: string;
          created_at?: string;
          finalized_at?: string | null;
          id?: string;
          idempotency_key: string;
          local_date: string;
          membership_id: string;
          policy_snapshot: NonNullable<Json>;
          session_ends_at: string;
          session_id: string;
          session_starts_at: string;
          state?: Database["public"]["Enums"]["booking_state"];
          updated_at?: string;
          user_id: string;
          venue_id: string;
        };
        Update: {
          cancellation_deadline?: string;
          cancellation_reason?: string | null;
          cancellation_source?: Database["public"]["Enums"]["cancellation_source"] | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          checked_in_at?: string | null;
          checkin_closes_at?: string;
          checkin_opens_at?: string;
          created_at?: string;
          finalized_at?: string | null;
          id?: string;
          idempotency_key?: string;
          local_date?: string;
          membership_id?: string;
          policy_snapshot?: NonNullable<Json>;
          session_ends_at?: string;
          session_id?: string;
          session_starts_at?: string;
          state?: Database["public"]["Enums"]["booking_state"];
          updated_at?: string;
          user_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          icon: string;
          id: string;
          name: NonNullable<Json>;
          slug: string;
          sort_order: number;
        };
        Insert: {
          icon?: string;
          id?: string;
          name: NonNullable<Json>;
          slug: string;
          sort_order?: number;
        };
        Update: {
          icon?: string;
          id?: string;
          name?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      checkin_tokens: {
        Row: {
          booking_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          token_hash: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          booking_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          revoked_at?: string | null;
          token_hash: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          token_hash?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "checkin_tokens_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      checkins: {
        Row: {
          booking_id: string;
          checked_in_at: string;
          created_at: string;
          id: string;
          token_id: string | null;
          venue_id: string;
          verified_by: string;
        };
        Insert: {
          booking_id: string;
          checked_in_at: string;
          created_at?: string;
          id?: string;
          token_id?: string | null;
          venue_id: string;
          verified_by: string;
        };
        Update: {
          booking_id?: string;
          checked_in_at?: string;
          created_at?: string;
          id?: string;
          token_id?: string | null;
          venue_id?: string;
          verified_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkins_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checkins_token_id_fkey";
            columns: ["token_id"];
            isOneToOne: false;
            referencedRelation: "checkin_tokens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checkins_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      cities: {
        Row: {
          id: string;
          is_active: boolean;
          name: NonNullable<Json>;
          slug: string;
          sort_order: number;
          timezone: string;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          name: NonNullable<Json>;
          slug: string;
          sort_order?: number;
          timezone?: string;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
          timezone?: string;
        };
        Relationships: [];
      };
      districts: {
        Row: {
          city_id: string;
          id: string;
          name: NonNullable<Json>;
          slug: string;
          sort_order: number;
        };
        Insert: {
          city_id: string;
          id?: string;
          name: NonNullable<Json>;
          slug: string;
          sort_order?: number;
        };
        Update: {
          city_id?: string;
          id?: string;
          name?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "districts_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          user_id: string;
          venue_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
          venue_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          ends_at: string;
          grant_reason: string | null;
          granted_by: string | null;
          id: string;
          is_demo: boolean;
          order_id: string | null;
          plan_version_id: string;
          revoke_reason: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          source: Database["public"]["Enums"]["membership_source"];
          starts_at: string;
          status: Database["public"]["Enums"]["membership_status"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          grant_reason?: string | null;
          granted_by?: string | null;
          id?: string;
          is_demo?: boolean;
          order_id?: string | null;
          plan_version_id: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          source: Database["public"]["Enums"]["membership_source"];
          starts_at: string;
          status?: Database["public"]["Enums"]["membership_status"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          grant_reason?: string | null;
          granted_by?: string | null;
          id?: string;
          is_demo?: boolean;
          order_id?: string | null;
          plan_version_id?: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          source?: Database["public"]["Enums"]["membership_source"];
          starts_at?: string;
          status?: Database["public"]["Enums"]["membership_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_plan_version_id_fkey";
            columns: ["plan_version_id"];
            isOneToOne: false;
            referencedRelation: "plan_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          message_key: string;
          params: NonNullable<Json>;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_key: string;
          params?: NonNullable<Json>;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_key?: string;
          params?: NonNullable<Json>;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          amount_minor: number;
          cancelled_at: string | null;
          created_at: string;
          currency: string;
          expires_at: string;
          failed_at: string | null;
          id: string;
          is_demo: boolean;
          needs_reconciliation: boolean;
          paid_at: string | null;
          plan_version_id: string;
          provider: Database["public"]["Enums"]["payment_provider"];
          reconciliation_note: string | null;
          refund_reference: string | null;
          refunded_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_minor: number;
          cancelled_at?: string | null;
          created_at?: string;
          currency: string;
          expires_at: string;
          failed_at?: string | null;
          id?: string;
          is_demo?: boolean;
          needs_reconciliation?: boolean;
          paid_at?: string | null;
          plan_version_id: string;
          provider: Database["public"]["Enums"]["payment_provider"];
          reconciliation_note?: string | null;
          refund_reference?: string | null;
          refunded_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_minor?: number;
          cancelled_at?: string | null;
          created_at?: string;
          currency?: string;
          expires_at?: string;
          failed_at?: string | null;
          id?: string;
          is_demo?: boolean;
          needs_reconciliation?: boolean;
          paid_at?: string | null;
          plan_version_id?: string;
          provider?: Database["public"]["Enums"]["payment_provider"];
          reconciliation_note?: string | null;
          refund_reference?: string | null;
          refunded_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_plan_version_id_fkey";
            columns: ["plan_version_id"];
            isOneToOne: false;
            referencedRelation: "plan_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          created_by: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          is_demo: boolean;
          name: string;
          status: Database["public"]["Enums"]["org_status"];
          status_reason: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name: string;
          status?: Database["public"]["Enums"]["org_status"];
          status_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name?: string;
          status?: Database["public"]["Enums"]["org_status"];
          status_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_events: {
        Row: {
          dedup_key: string;
          event_type: string;
          id: string;
          order_id: string | null;
          outcome: Database["public"]["Enums"]["payment_event_outcome"];
          outcome_code: string | null;
          payment_id: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id: string | null;
          received_at: string;
          safe_metadata: NonNullable<Json>;
        };
        Insert: {
          dedup_key: string;
          event_type: string;
          id?: string;
          order_id?: string | null;
          outcome: Database["public"]["Enums"]["payment_event_outcome"];
          outcome_code?: string | null;
          payment_id?: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id?: string | null;
          received_at?: string;
          safe_metadata?: NonNullable<Json>;
        };
        Update: {
          dedup_key?: string;
          event_type?: string;
          id?: string;
          order_id?: string | null;
          outcome?: Database["public"]["Enums"]["payment_event_outcome"];
          outcome_code?: string | null;
          payment_id?: string | null;
          provider?: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id?: string | null;
          received_at?: string;
          safe_metadata?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          created_at: string;
          currency: string;
          failed_at: string | null;
          id: string;
          order_id: string;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id: string;
          refunded_at: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          succeeded_at: string | null;
          updated_at: string;
        };
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency: string;
          failed_at?: string | null;
          id?: string;
          order_id: string;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id: string;
          refunded_at?: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          succeeded_at?: string | null;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          failed_at?: string | null;
          id?: string;
          order_id?: string;
          provider?: Database["public"]["Enums"]["payment_provider"];
          provider_transaction_id?: string;
          refunded_at?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          succeeded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_version_venues: {
        Row: {
          plan_version_id: string;
          venue_id: string;
        };
        Insert: {
          plan_version_id: string;
          venue_id: string;
        };
        Update: {
          plan_version_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_version_venues_plan_version_id_fkey";
            columns: ["plan_version_id"];
            isOneToOne: false;
            referencedRelation: "plan_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_version_venues_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_versions: {
        Row: {
          booking_window_days: number;
          checkin_closes_minutes: number;
          checkin_opens_minutes: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          daily_visit_limit: number;
          description: NonNullable<Json>;
          duration_days: number;
          free_cancellation_minutes: number;
          id: string;
          is_demo: boolean;
          max_future_bookings: number;
          name: NonNullable<Json>;
          plan_id: string;
          price_minor: number;
          published_at: string | null;
          retired_at: string | null;
          status: Database["public"]["Enums"]["plan_version_status"];
          version: number;
          visit_allowance: number;
        };
        Insert: {
          booking_window_days?: number;
          checkin_closes_minutes?: number;
          checkin_opens_minutes?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          daily_visit_limit?: number;
          description?: NonNullable<Json>;
          duration_days: number;
          free_cancellation_minutes?: number;
          id?: string;
          is_demo?: boolean;
          max_future_bookings?: number;
          name: NonNullable<Json>;
          plan_id: string;
          price_minor: number;
          published_at?: string | null;
          retired_at?: string | null;
          status?: Database["public"]["Enums"]["plan_version_status"];
          version: number;
          visit_allowance: number;
        };
        Update: {
          booking_window_days?: number;
          checkin_closes_minutes?: number;
          checkin_opens_minutes?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          daily_visit_limit?: number;
          description?: NonNullable<Json>;
          duration_days?: number;
          free_cancellation_minutes?: number;
          id?: string;
          is_demo?: boolean;
          max_future_bookings?: number;
          name?: NonNullable<Json>;
          plan_id?: string;
          price_minor?: number;
          published_at?: string | null;
          retired_at?: string | null;
          status?: Database["public"]["Enums"]["plan_version_status"];
          version?: number;
          visit_allowance?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          sort_order: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      platform_roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          role: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          role?: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          role?: Database["public"]["Enums"]["platform_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          anonymized_at: string | null;
          created_at: string;
          display_name: string;
          id: string;
          locale: Database["public"]["Enums"]["locale_code"];
          phone_e164: string | null;
          updated_at: string;
        };
        Insert: {
          anonymized_at?: string | null;
          created_at?: string;
          display_name?: string;
          id: string;
          locale?: Database["public"]["Enums"]["locale_code"];
          phone_e164?: string | null;
          updated_at?: string;
        };
        Update: {
          anonymized_at?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          locale?: Database["public"]["Enums"]["locale_code"];
          phone_e164?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          activity_id: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          capacity: number;
          created_at: string;
          created_by: string | null;
          ends_at: string;
          id: string;
          occupied_count: number;
          starts_at: string;
          status: Database["public"]["Enums"]["session_status"];
          updated_at: string;
          venue_id: string;
        };
        Insert: {
          activity_id: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          capacity: number;
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          id?: string;
          occupied_count?: number;
          starts_at: string;
          status?: Database["public"]["Enums"]["session_status"];
          updated_at?: string;
          venue_id: string;
        };
        Update: {
          activity_id?: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          id?: string;
          occupied_count?: number;
          starts_at?: string;
          status?: Database["public"]["Enums"]["session_status"];
          updated_at?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_activity_id_venue_id_fkey";
            columns: ["activity_id", "venue_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id", "venue_id"];
          },
          {
            foreignKeyName: "sessions_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_amenities: {
        Row: {
          amenity_id: string;
          venue_id: string;
        };
        Insert: {
          amenity_id: string;
          venue_id: string;
        };
        Update: {
          amenity_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_amenities_amenity_id_fkey";
            columns: ["amenity_id"];
            isOneToOne: false;
            referencedRelation: "amenities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venue_amenities_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_categories: {
        Row: {
          category_id: string;
          venue_id: string;
        };
        Insert: {
          category_id: string;
          venue_id: string;
        };
        Update: {
          category_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venue_categories_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_images: {
        Row: {
          alt: NonNullable<Json>;
          created_at: string;
          id: string;
          sort_order: number;
          storage_path: string;
          venue_id: string;
        };
        Insert: {
          alt?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          sort_order?: number;
          storage_path: string;
          venue_id: string;
        };
        Update: {
          alt?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          sort_order?: number;
          storage_path?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_images_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_opening_hours: {
        Row: {
          closes_at: string | null;
          is_closed: boolean;
          opens_at: string | null;
          venue_id: string;
          weekday: number;
        };
        Insert: {
          closes_at?: string | null;
          is_closed?: boolean;
          opens_at?: string | null;
          venue_id: string;
          weekday: number;
        };
        Update: {
          closes_at?: string | null;
          is_closed?: boolean;
          opens_at?: string | null;
          venue_id?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "venue_opening_hours_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_revisions: {
        Row: {
          content: NonNullable<Json>;
          created_at: string;
          created_by: string;
          id: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["revision_status"];
          submitted_at: string | null;
          submitted_by: string | null;
          updated_at: string;
          venue_id: string;
        };
        Insert: {
          content: NonNullable<Json>;
          created_at?: string;
          created_by: string;
          id?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["revision_status"];
          submitted_at?: string | null;
          submitted_by?: string | null;
          updated_at?: string;
          venue_id: string;
        };
        Update: {
          content?: NonNullable<Json>;
          created_at?: string;
          created_by?: string;
          id?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["revision_status"];
          submitted_at?: string | null;
          submitted_by?: string | null;
          updated_at?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_revisions_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      venues: {
        Row: {
          address: NonNullable<Json>;
          contact_phone: string | null;
          created_at: string;
          description: NonNullable<Json>;
          district_id: string;
          id: string;
          is_demo: boolean;
          latitude: number | null;
          longitude: number | null;
          name: NonNullable<Json>;
          operational_status: Database["public"]["Enums"]["venue_operational_status"];
          organization_id: string;
          publication_status: Database["public"]["Enums"]["venue_publication_status"];
          published_at: string | null;
          rules: NonNullable<Json>;
          search_text: string | null;
          slug: string;
          status_reason: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          address: NonNullable<Json>;
          contact_phone?: string | null;
          created_at?: string;
          description?: NonNullable<Json>;
          district_id: string;
          id?: string;
          is_demo?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name: NonNullable<Json>;
          operational_status?: Database["public"]["Enums"]["venue_operational_status"];
          organization_id: string;
          publication_status?: Database["public"]["Enums"]["venue_publication_status"];
          published_at?: string | null;
          rules?: NonNullable<Json>;
          search_text?: never;
          slug: string;
          status_reason?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          address?: NonNullable<Json>;
          contact_phone?: string | null;
          created_at?: string;
          description?: NonNullable<Json>;
          district_id?: string;
          id?: string;
          is_demo?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name?: NonNullable<Json>;
          operational_status?: Database["public"]["Enums"]["venue_operational_status"];
          organization_id?: string;
          publication_status?: Database["public"]["Enums"]["venue_publication_status"];
          published_at?: string | null;
          rules?: NonNullable<Json>;
          search_text?: never;
          slug?: string;
          status_reason?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venues_district_id_fkey";
            columns: ["district_id"];
            isOneToOne: false;
            referencedRelation: "districts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venues_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_anonymize_user: { Args: { p_reason: string; p_user_id: string }; Returns: undefined };
      admin_correct_booking: {
        Args: { p_booking_id: string; p_new_state: Database["public"]["Enums"]["booking_state"]; p_reason: string };
        Returns: undefined;
      };
      admin_create_organization: { Args: { p_is_demo?: boolean; p_name: string }; Returns: string };
      admin_create_plan: { Args: { p_code: string; p_sort_order?: number }; Returns: string };
      admin_create_plan_version: { Args: { p_plan_id: string; p_terms: Json; p_venue_ids: string[] }; Returns: string };
      admin_delete_plan_version_draft: { Args: { p_plan_version_id: string }; Returns: undefined };
      admin_find_users: {
        Args: { p_query?: string };
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          created_at: string;
          current_membership_ends_at: string;
          current_plan_code: string;
          display_name: string;
          email: string;
          email_confirmed_at: string;
          is_admin: boolean;
          organization_count: number;
          user_id: string;
        }[];
      };
      admin_grant_membership: {
        Args: { p_plan_version_id: string; p_reason: string; p_user_id: string };
        Returns: string;
      };
      admin_operational_totals: { Args: { p_from: string; p_to: string }; Returns: Json };
      admin_publish_plan_version: { Args: { p_plan_version_id: string }; Returns: undefined };
      admin_record_refund: { Args: { p_order_id: string; p_reason: string; p_reference: string }; Returns: undefined };
      admin_remove_org_member: { Args: { p_organization_id: string; p_user_id: string }; Returns: undefined };
      admin_resolve_reconciliation: { Args: { p_note: string; p_order_id: string }; Returns: undefined };
      admin_retire_plan_version: { Args: { p_plan_version_id: string }; Returns: undefined };
      admin_review_venue_revision: {
        Args: { p_approve: boolean; p_note?: string; p_revision_id: string };
        Returns: undefined;
      };
      admin_revoke_membership: { Args: { p_membership_id: string; p_reason: string }; Returns: number };
      admin_set_account_status: {
        Args: { p_reason: string; p_status: Database["public"]["Enums"]["account_status"]; p_user_id: string };
        Returns: undefined;
      };
      admin_set_org_member: {
        Args: { p_organization_id: string; p_role: Database["public"]["Enums"]["org_role"]; p_user_id: string };
        Returns: undefined;
      };
      admin_set_organization_status: {
        Args: { p_organization_id: string; p_reason: string; p_status: Database["public"]["Enums"]["org_status"] };
        Returns: undefined;
      };
      admin_set_venue_status: {
        Args: { p_action: string; p_cancel_future_sessions?: boolean; p_reason?: string; p_venue_id: string };
        Returns: number;
      };
      admin_user_summary: {
        Args: { p_user_id: string };
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          anonymized_at: string;
          created_at: string;
          display_name: string;
          email: string;
          email_confirmed_at: string;
          is_admin: boolean;
          last_sign_in_at: string;
          locale: Database["public"]["Enums"]["locale_code"];
          phone_e164: string;
          status_reason: string;
          user_id: string;
        }[];
      };
      apply_payment_event: {
        Args: {
          p_amount_minor: number;
          p_currency: string;
          p_dedup_key: string;
          p_event_type: string;
          p_metadata?: Json;
          p_order_id: string;
          p_provider: Database["public"]["Enums"]["payment_provider"];
          p_provider_transaction_id: string;
          p_status: Database["public"]["Enums"]["payment_status"];
        };
        Returns: {
          membership_id: string;
          order_status: Database["public"]["Enums"]["order_status"];
          outcome: Database["public"]["Enums"]["payment_event_outcome"];
          outcome_code: string;
        }[];
      };
      cancel_booking: {
        Args: { p_accept_late?: boolean; p_booking_id: string };
        Returns: {
          already_cancelled: boolean;
          booking_id: string;
          booking_state: Database["public"]["Enums"]["booking_state"];
        }[];
      };
      cancel_session: { Args: { p_reason: string; p_session_id: string }; Returns: number };
      cleanup_ephemeral_data: { Args: Record<PropertyKey, never>; Returns: Json };
      consume_rate_limit: { Args: { p_bucket: string; p_max: number; p_window_seconds: number }; Returns: boolean };
      create_booking: {
        Args: { p_idempotency_key: string; p_session_id: string };
        Returns: {
          booking_id: string;
          booking_state: Database["public"]["Enums"]["booking_state"];
          replayed: boolean;
        }[];
      };
      create_order: {
        Args: { p_plan_version_id: string; p_provider: Database["public"]["Enums"]["payment_provider"] };
        Returns: {
          amount_minor: number;
          currency: string;
          expires_at: string;
          is_demo: boolean;
          order_id: string;
        }[];
      };
      expire_stale_orders: { Args: { p_limit?: number }; Returns: number };
      get_my_access: {
        Args: Record<PropertyKey, never>;
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          admin_authorized: boolean;
          admin_mfa_required: boolean;
          has_admin_role: boolean;
          organizations: Json;
          user_id: string;
        }[];
      };
      get_my_booking: {
        Args: { p_booking_id: string };
        Returns: {
          activity_kind: Database["public"]["Enums"]["activity_kind"];
          activity_title: Json;
          booking_id: string;
          cancellation_deadline: string;
          cancellation_reason: string;
          cancellation_source: Database["public"]["Enums"]["cancellation_source"];
          cancelled_at: string;
          checked_in_at: string;
          checkin_closes_at: string;
          checkin_opens_at: string;
          created_at: string;
          free_cancellation_minutes: number;
          local_date: string;
          membership_id: string;
          plan_name: Json;
          server_now: string;
          session_cancellation_reason: string;
          session_ends_at: string;
          session_id: string;
          session_starts_at: string;
          session_status: Database["public"]["Enums"]["session_status"];
          state: Database["public"]["Enums"]["booking_state"];
          venue_address: Json;
          venue_id: string;
          venue_name: Json;
          venue_slug: string;
          venue_timezone: string;
        }[];
      };
      get_my_bookings: {
        Args: { p_limit?: number; p_offset?: number; p_scope?: string };
        Returns: {
          activity_kind: Database["public"]["Enums"]["activity_kind"];
          activity_title: Json;
          booking_id: string;
          cancellation_deadline: string;
          cancellation_reason: string;
          cancellation_source: Database["public"]["Enums"]["cancellation_source"];
          cancelled_at: string;
          checked_in_at: string;
          checkin_closes_at: string;
          checkin_opens_at: string;
          created_at: string;
          local_date: string;
          membership_id: string;
          session_cancellation_reason: string;
          session_ends_at: string;
          session_id: string;
          session_starts_at: string;
          session_status: Database["public"]["Enums"]["session_status"];
          state: Database["public"]["Enums"]["booking_state"];
          total_count: number;
          venue_address: Json;
          venue_id: string;
          venue_name: Json;
          venue_slug: string;
          venue_timezone: string;
        }[];
      };
      get_my_membership: {
        Args: Record<PropertyKey, never>;
        Returns: {
          available: number;
          booking_window_days: number;
          consumed: number;
          daily_visit_limit: number;
          eligible_venue_count: number;
          ends_at: string;
          free_cancellation_minutes: number;
          is_demo: boolean;
          max_future_bookings: number;
          membership_id: string;
          plan_code: string;
          plan_name: Json;
          plan_version: number;
          plan_version_id: string;
          reserved: number;
          source: Database["public"]["Enums"]["membership_source"];
          starts_at: string;
          upcoming_count: number;
          visit_allowance: number;
        }[];
      };
      get_order_for_payment: {
        Args: { p_order_id: string };
        Returns: {
          amount_minor: number;
          created_at: string;
          currency: string;
          expires_at: string;
          is_demo: boolean;
          order_id: string;
          plan_name: Json;
          plan_version_id: string;
          provider: Database["public"]["Enums"]["payment_provider"];
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
        }[];
      };
      get_session_roster: {
        Args: { p_session_id: string };
        Returns: {
          booked_at: string;
          booking_id: string;
          booking_state: Database["public"]["Enums"]["booking_state"];
          checked_in_at: string;
          member_display_name: string;
        }[];
      };
      issue_checkin_token: {
        Args: { p_booking_id: string };
        Returns: {
          expires_at: string;
          token: string;
        }[];
      };
      list_orders_for_reconciliation: {
        Args: { p_limit?: number };
        Returns: {
          amount_minor: number;
          created_at: string;
          currency: string;
          expires_at: string;
          order_id: string;
          provider: Database["public"]["Enums"]["payment_provider"];
        }[];
      };
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number };
      partner_attendance_report: {
        Args: { p_from: string; p_to: string; p_venue_id: string };
        Returns: {
          activity_title: Json;
          booking_id: string;
          booking_state: Database["public"]["Enums"]["booking_state"];
          checked_in_at: string;
          local_date: string;
          member_display_name: string;
          session_starts_at: string;
        }[];
      };
      partner_create_activity: {
        Args: {
          p_category_id: string;
          p_default_capacity: number;
          p_description: Json;
          p_duration_minutes: number;
          p_kind: Database["public"]["Enums"]["activity_kind"];
          p_title: Json;
          p_venue_id: string;
        };
        Returns: string;
      };
      partner_create_sessions: {
        Args: { p_activity_id: string; p_capacity?: number; p_local_starts: string[] };
        Returns: string[];
      };
      partner_create_venue: { Args: { p_content: Json; p_organization_id: string; p_slug: string }; Returns: string };
      partner_day_sessions: {
        Args: { p_date: string; p_venue_id: string };
        Returns: {
          activity_id: string;
          activity_kind: Database["public"]["Enums"]["activity_kind"];
          activity_title: Json;
          cancellation_reason: string;
          capacity: number;
          checked_in_count: number;
          confirmed_count: number;
          ends_at: string;
          late_cancel_count: number;
          no_show_count: number;
          session_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["session_status"];
        }[];
      };
      partner_save_venue_revision: { Args: { p_content: Json; p_venue_id: string }; Returns: string };
      partner_submit_venue_revision: { Args: { p_venue_id: string }; Returns: string };
      partner_update_activity: {
        Args: {
          p_activity_id: string;
          p_default_capacity: number;
          p_description: Json;
          p_duration_minutes: number;
          p_is_active: boolean;
          p_title: Json;
        };
        Returns: undefined;
      };
      partner_update_session_capacity: { Args: { p_capacity: number; p_session_id: string }; Returns: undefined };
      partner_withdraw_venue_revision: { Args: { p_venue_id: string }; Returns: string };
      reconcile_no_shows: { Args: { p_limit?: number }; Returns: number };
      redeem_checkin_token: {
        Args: { p_token: string; p_venue_id: string };
        Returns: {
          activity_title: Json;
          booking_id: string;
          checked_in_at: string;
          error_code: string;
          member_display_name: string;
          ok: boolean;
          session_starts_at: string;
        }[];
      };
      search_venues: {
        Args: {
          p_category?: string;
          p_city?: string;
          p_date?: string;
          p_district?: string;
          p_lat?: number;
          p_limit?: number;
          p_lng?: number;
          p_locale?: Database["public"]["Enums"]["locale_code"];
          p_offset?: number;
          p_plan?: string;
          p_query?: string;
        };
        Returns: {
          address: Json;
          category_slugs: string[];
          city_slug: string;
          cover_alt: Json;
          cover_path: string;
          distance_km: number;
          district_name: Json;
          district_slug: string;
          id: string;
          is_demo: boolean;
          latitude: number;
          longitude: number;
          name: Json;
          plan_codes: string[];
          slug: string;
          total_count: number;
        }[];
      };
      session_occupancy_drift: {
        Args: Record<PropertyKey, never>;
        Returns: {
          live_reservations: number;
          occupied_count: number;
          session_id: string;
        }[];
      };
    };
    Enums: {
      account_status: "active" | "suspended";
      activity_kind: "class" | "open_gym";
      booking_state:
        "confirmed" | "checked_in" | "cancelled_on_time" | "cancelled_late" | "venue_cancelled" | "no_show";
      cancellation_source: "member" | "venue" | "admin" | "system";
      locale_code: "uz" | "ru" | "en";
      membership_source: "payment" | "demo" | "admin";
      membership_status: "active" | "revoked";
      order_status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
      org_role: "manager" | "receptionist";
      org_status: "active" | "suspended";
      payment_event_outcome: "processed" | "duplicate" | "ignored" | "rejected";
      payment_provider: "demo" | "payme" | "click";
      payment_status: "pending" | "succeeded" | "failed" | "refunded";
      plan_version_status: "draft" | "published" | "retired";
      platform_role: "admin";
      revision_status: "draft" | "submitted" | "approved" | "rejected";
      session_status: "scheduled" | "cancelled";
      venue_operational_status: "active" | "suspended";
      venue_publication_status: "draft" | "published" | "unpublished";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "suspended"],
      activity_kind: ["class", "open_gym"],
      booking_state: ["confirmed", "checked_in", "cancelled_on_time", "cancelled_late", "venue_cancelled", "no_show"],
      cancellation_source: ["member", "venue", "admin", "system"],
      locale_code: ["uz", "ru", "en"],
      membership_source: ["payment", "demo", "admin"],
      membership_status: ["active", "revoked"],
      order_status: ["pending", "paid", "failed", "cancelled", "refunded"],
      org_role: ["manager", "receptionist"],
      org_status: ["active", "suspended"],
      payment_event_outcome: ["processed", "duplicate", "ignored", "rejected"],
      payment_provider: ["demo", "payme", "click"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      plan_version_status: ["draft", "published", "retired"],
      platform_role: ["admin"],
      revision_status: ["draft", "submitted", "approved", "rejected"],
      session_status: ["scheduled", "cancelled"],
      venue_operational_status: ["active", "suspended"],
      venue_publication_status: ["draft", "published", "unpublished"],
    },
  },
} as const;
