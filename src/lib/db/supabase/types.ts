/**
 * Supabase database types — auto-generated from schema.
 * Run `npx supabase gen types typescript` to regenerate.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          tier: string;
          currency: string;
          country: string | null;
          timezone: string | null;
          locale: string;
          onboarding_completed: boolean;
          telegram_chat_id: string | null;
          risk_profile: string | null;
          age_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      strategies: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          area: string;
          execution_mode: string;
          creation_mode: string;
          rules: unknown;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['strategies']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['strategies']['Row']>;
      };
      trades: {
        Row: {
          id: string;
          user_id: string;
          strategy_id: string | null;
          area: string;
          symbol: string;
          direction: string;
          size: number;
          entry_price: number | null;
          exit_price: number | null;
          net_pnl: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['trades']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['trades']['Row']>;
      };
      // Additional tables will be added as schema evolves
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
