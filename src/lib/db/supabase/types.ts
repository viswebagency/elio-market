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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          area: Database["public"]["Enums"]["market_area"] | null
          asset_symbol: string | null
          channels: Database["public"]["Enums"]["notification_channel"][]
          condition_config: Json
          condition_type: Database["public"]["Enums"]["alert_condition_type"]
          cooldown_minutes: number
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          is_priority: boolean
          last_triggered_at: string | null
          name: string
          strategy_id: string | null
          trigger_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: Database["public"]["Enums"]["market_area"] | null
          asset_symbol?: string | null
          channels?: Database["public"]["Enums"]["notification_channel"][]
          condition_config?: Json
          condition_type: Database["public"]["Enums"]["alert_condition_type"]
          cooldown_minutes?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_priority?: boolean
          last_triggered_at?: string | null
          name: string
          strategy_id?: string | null
          trigger_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: Database["public"]["Enums"]["market_area"] | null
          asset_symbol?: string | null
          channels?: Database["public"]["Enums"]["notification_channel"][]
          condition_config?: Json
          condition_type?: Database["public"]["Enums"]["alert_condition_type"]
          cooldown_minutes?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_priority?: boolean
          last_triggered_at?: string | null
          name?: string
          strategy_id?: string | null
          trigger_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          area: Database["public"]["Enums"]["market_area"] | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          area?: Database["public"]["Enums"]["market_area"] | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          area?: Database["public"]["Enums"]["market_area"] | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_runs: {
        Row: {
          alpha: number | null
          avg_holding_time: string | null
          avg_loser: number | null
          avg_trade_pnl: number | null
          avg_winner: number | null
          benchmark_name: string | null
          benchmark_return: number | null
          calmar_ratio: number | null
          commission_model: Json
          created_at: string
          end_date: string
          execution_time_ms: number | null
          failure_reason: string | null
          gross_profit: number | null
          id: string
          initial_capital: number
          level: Database["public"]["Enums"]["backtest_level"]
          losing_trades: number | null
          max_consecutive_losses: number | null
          max_consecutive_wins: number | null
          max_drawdown: number | null
          monte_carlo_iterations: number | null
          monte_carlo_results: Json | null
          net_profit: number | null
          notes: string | null
          overfitting_parameter_variations: Json | null
          overfitting_results: Json | null
          overfitting_stability_score: number | null
          passed: boolean
          profit_factor: number | null
          roi: number | null
          sharpe_ratio: number | null
          slippage_pct: number
          sortino_ratio: number | null
          start_date: string
          strategy_id: string
          total_commission: number | null
          total_slippage: number | null
          total_trades: number | null
          user_id: string
          walk_forward_windows: Json | null
          win_rate: number | null
          winning_trades: number | null
        }
        Insert: {
          alpha?: number | null
          avg_holding_time?: string | null
          avg_loser?: number | null
          avg_trade_pnl?: number | null
          avg_winner?: number | null
          benchmark_name?: string | null
          benchmark_return?: number | null
          calmar_ratio?: number | null
          commission_model?: Json
          created_at?: string
          end_date: string
          execution_time_ms?: number | null
          failure_reason?: string | null
          gross_profit?: number | null
          id?: string
          initial_capital: number
          level: Database["public"]["Enums"]["backtest_level"]
          losing_trades?: number | null
          max_consecutive_losses?: number | null
          max_consecutive_wins?: number | null
          max_drawdown?: number | null
          monte_carlo_iterations?: number | null
          monte_carlo_results?: Json | null
          net_profit?: number | null
          notes?: string | null
          overfitting_parameter_variations?: Json | null
          overfitting_results?: Json | null
          overfitting_stability_score?: number | null
          passed?: boolean
          profit_factor?: number | null
          roi?: number | null
          sharpe_ratio?: number | null
          slippage_pct?: number
          sortino_ratio?: number | null
          start_date: string
          strategy_id: string
          total_commission?: number | null
          total_slippage?: number | null
          total_trades?: number | null
          user_id: string
          walk_forward_windows?: Json | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Update: {
          alpha?: number | null
          avg_holding_time?: string | null
          avg_loser?: number | null
          avg_trade_pnl?: number | null
          avg_winner?: number | null
          benchmark_name?: string | null
          benchmark_return?: number | null
          calmar_ratio?: number | null
          commission_model?: Json
          created_at?: string
          end_date?: string
          execution_time_ms?: number | null
          failure_reason?: string | null
          gross_profit?: number | null
          id?: string
          initial_capital?: number
          level?: Database["public"]["Enums"]["backtest_level"]
          losing_trades?: number | null
          max_consecutive_losses?: number | null
          max_consecutive_wins?: number | null
          max_drawdown?: number | null
          monte_carlo_iterations?: number | null
          monte_carlo_results?: Json | null
          net_profit?: number | null
          notes?: string | null
          overfitting_parameter_variations?: Json | null
          overfitting_results?: Json | null
          overfitting_stability_score?: number | null
          passed?: boolean
          profit_factor?: number | null
          roi?: number | null
          sharpe_ratio?: number | null
          slippage_pct?: number
          sortino_ratio?: number | null
          start_date?: string
          strategy_id?: string
          total_commission?: number | null
          total_slippage?: number | null
          total_trades?: number | null
          user_id?: string
          walk_forward_windows?: Json | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backtest_runs_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bankroll_allocations: {
        Row: {
          allocated_amount: number
          allocated_pct: number | null
          bankroll_id: string
          created_at: string
          current_value: number
          high_water_mark: number
          id: string
          strategy_id: string
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          allocated_pct?: number | null
          bankroll_id: string
          created_at?: string
          current_value?: number
          high_water_mark?: number
          id?: string
          strategy_id: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          allocated_pct?: number | null
          bankroll_id?: string
          created_at?: string
          current_value?: number
          high_water_mark?: number
          id?: string
          strategy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bankroll_allocations_bankroll_id_fkey"
            columns: ["bankroll_id"]
            isOneToOne: false
            referencedRelation: "bankrolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bankroll_allocations_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      bankrolls: {
        Row: {
          area: Database["public"]["Enums"]["market_area"]
          area_paused_at: string | null
          created_at: string
          currency: string
          current_balance: number
          current_drawdown_pct: number
          id: string
          initial_balance: number
          is_area_paused: boolean
          is_dynamic_allocation: boolean
          max_drawdown_pct: number
          paper_balance: number
          paper_initial: number
          peak_balance: number
          total_deposited: number
          total_withdrawn: number
          updated_at: string
          user_id: string
        }
        Insert: {
          area: Database["public"]["Enums"]["market_area"]
          area_paused_at?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          current_drawdown_pct?: number
          id?: string
          initial_balance?: number
          is_area_paused?: boolean
          is_dynamic_allocation?: boolean
          max_drawdown_pct?: number
          paper_balance?: number
          paper_initial?: number
          peak_balance?: number
          total_deposited?: number
          total_withdrawn?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: Database["public"]["Enums"]["market_area"]
          area_paused_at?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          current_drawdown_pct?: number
          id?: string
          initial_balance?: number
          is_area_paused?: boolean
          is_dynamic_allocation?: boolean
          max_drawdown_pct?: number
          paper_balance?: number
          paper_initial?: number
          peak_balance?: number
          total_deposited?: number
          total_withdrawn?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bankrolls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_api_keys: {
        Row: {
          area: Database["public"]["Enums"]["market_area"]
          broker_name: string
          created_at: string
          encrypted_key: string
          encrypted_secret: string | null
          extra_config: Json | null
          id: string
          is_active: boolean
          label: string | null
          last_error: string | null
          last_verified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area: Database["public"]["Enums"]["market_area"]
          broker_name: string
          created_at?: string
          encrypted_key: string
          encrypted_secret?: string | null
          extra_config?: Json | null
          id?: string
          is_active?: boolean
          label?: string | null
          last_error?: string | null
          last_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: Database["public"]["Enums"]["market_area"]
          broker_name?: string
          created_at?: string
          encrypted_key?: string
          encrypted_secret?: string | null
          extra_config?: Json | null
          id?: string
          is_active?: boolean
          label?: string | null
          last_error?: string | null
          last_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_log: {
        Row: {
          area: Database["public"]["Enums"]["market_area"]
          asset_symbol: string
          detected_at: string
          executed_strategy_id: string | null
          id: string
          net_direction: Database["public"]["Enums"]["trade_direction"] | null
          resolution: Database["public"]["Enums"]["conflict_resolution_type"]
          resolution_detail: string | null
          signal_a: Json
          signal_b: Json
          strategy_a_id: string
          strategy_b_id: string
          user_id: string
          was_neutralized: boolean
        }
        Insert: {
          area: Database["public"]["Enums"]["market_area"]
          asset_symbol: string
          detected_at?: string
          executed_strategy_id?: string | null
          id?: string
          net_direction?: Database["public"]["Enums"]["trade_direction"] | null
          resolution: Database["public"]["Enums"]["conflict_resolution_type"]
          resolution_detail?: string | null
          signal_a: Json
          signal_b: Json
          strategy_a_id: string
          strategy_b_id: string
          user_id: string
          was_neutralized?: boolean
        }
        Update: {
          area?: Database["public"]["Enums"]["market_area"]
          asset_symbol?: string
          detected_at?: string
          executed_strategy_id?: string | null
          id?: string
          net_direction?: Database["public"]["Enums"]["trade_direction"] | null
          resolution?: Database["public"]["Enums"]["conflict_resolution_type"]
          resolution_detail?: string | null
          signal_a?: Json
          signal_b?: Json
          strategy_a_id?: string
          strategy_b_id?: string
          user_id?: string
          was_neutralized?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "conflict_log_executed_strategy_id_fkey"
            columns: ["executed_strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_log_strategy_a_id_fkey"
            columns: ["strategy_a_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_log_strategy_b_id_fkey"
            columns: ["strategy_b_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_trading_subscriptions: {
        Row: {
          allocation_pct: number | null
          follower_id: string
          id: string
          is_active: boolean
          max_stake: number | null
          published_strategy_id: string
          scale_factor: number | null
          subscribed_at: string
          total_pnl: number
          total_trades_copied: number
          unsubscribed_at: string | null
        }
        Insert: {
          allocation_pct?: number | null
          follower_id: string
          id?: string
          is_active?: boolean
          max_stake?: number | null
          published_strategy_id: string
          scale_factor?: number | null
          subscribed_at?: string
          total_pnl?: number
          total_trades_copied?: number
          unsubscribed_at?: string | null
        }
        Update: {
          allocation_pct?: number | null
          follower_id?: string
          id?: string
          is_active?: boolean
          max_stake?: number | null
          published_strategy_id?: string
          scale_factor?: number | null
          subscribed_at?: string
          total_pnl?: number
          total_trades_copied?: number
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_trading_subscriptions_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copy_trading_subscriptions_published_strategy_id_fkey"
            columns: ["published_strategy_id"]
            isOneToOne: false
            referencedRelation: "published_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      country_regulations: {
        Row: {
          allowed_areas: Database["public"]["Enums"]["market_area"][]
          country_code: string
          country_name: string
          created_at: string
          disclaimers: Json | null
          gambling_disclaimer: string | null
          gambling_helpline: string | null
          gambling_min_age: number
          is_supported: boolean
          legal_notes: string | null
          requires_legal_review: boolean
          restricted_areas: Database["public"]["Enums"]["market_area"][] | null
          support_phase: number | null
          tax_rules: Json | null
          updated_at: string
        }
        Insert: {
          allowed_areas?: Database["public"]["Enums"]["market_area"][]
          country_code: string
          country_name: string
          created_at?: string
          disclaimers?: Json | null
          gambling_disclaimer?: string | null
          gambling_helpline?: string | null
          gambling_min_age?: number
          is_supported?: boolean
          legal_notes?: string | null
          requires_legal_review?: boolean
          restricted_areas?: Database["public"]["Enums"]["market_area"][] | null
          support_phase?: number | null
          tax_rules?: Json | null
          updated_at?: string
        }
        Update: {
          allowed_areas?: Database["public"]["Enums"]["market_area"][]
          country_code?: string
          country_name?: string
          created_at?: string
          disclaimers?: Json | null
          gambling_disclaimer?: string | null
          gambling_helpline?: string | null
          gambling_min_age?: number
          is_supported?: boolean
          legal_notes?: string | null
          requires_legal_review?: boolean
          restricted_areas?: Database["public"]["Enums"]["market_area"][] | null
          support_phase?: number | null
          tax_rules?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      crypto_paper_positions: {
        Row: {
          closed_at: string | null
          created_at: string
          current_price: number
          direction: string
          entry_price: number
          entry_reason: string
          id: string
          opened_at: string
          pnl: number
          pnl_pct: number
          session_id: string
          signal_confidence: number | null
          size: number
          stake: number
          status: string
          symbol: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          current_price: number
          direction?: string
          entry_price: number
          entry_reason: string
          id?: string
          opened_at?: string
          pnl?: number
          pnl_pct?: number
          session_id: string
          signal_confidence?: number | null
          size: number
          stake: number
          status?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          current_price?: number
          direction?: string
          entry_price?: number
          entry_reason?: string
          id?: string
          opened_at?: string
          pnl?: number
          pnl_pct?: number
          session_id?: string
          signal_confidence?: number | null
          size?: number
          stake?: number
          status?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crypto_paper_positions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "crypto_paper_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_paper_sessions: {
        Row: {
          auto_rotation_count: number
          circuit_broken_at: string | null
          circuit_broken_reason: string | null
          cooldown_until: string | null
          created_at: string
          current_capital: number
          id: string
          initial_capital: number
          is_circuit_broken: boolean
          last_tick_at: string | null
          last_warning_at: string | null
          last_warning_level: number | null
          max_auto_rotations: number
          max_drawdown_pct: number
          pairs: string[]
          parent_session_id: string | null
          pause_reason: string | null
          peak_capital: number
          portfolio_state: Json
          realized_pnl: number
          started_at: string
          status: string
          stopped_at: string | null
          strategy_code: string
          strategy_name: string
          total_pnl: number
          total_pnl_pct: number
          total_ticks: number
          unrealized_pnl: number
          updated_at: string
        }
        Insert: {
          auto_rotation_count?: number
          circuit_broken_at?: string | null
          circuit_broken_reason?: string | null
          cooldown_until?: string | null
          created_at?: string
          current_capital?: number
          id?: string
          initial_capital?: number
          is_circuit_broken?: boolean
          last_tick_at?: string | null
          last_warning_at?: string | null
          last_warning_level?: number | null
          max_auto_rotations?: number
          max_drawdown_pct?: number
          pairs?: string[]
          parent_session_id?: string | null
          pause_reason?: string | null
          peak_capital?: number
          portfolio_state?: Json
          realized_pnl?: number
          started_at?: string
          status?: string
          stopped_at?: string | null
          strategy_code: string
          strategy_name: string
          total_pnl?: number
          total_pnl_pct?: number
          total_ticks?: number
          unrealized_pnl?: number
          updated_at?: string
        }
        Update: {
          auto_rotation_count?: number
          circuit_broken_at?: string | null
          circuit_broken_reason?: string | null
          cooldown_until?: string | null
          created_at?: string
          current_capital?: number
          id?: string
          initial_capital?: number
          is_circuit_broken?: boolean
          last_tick_at?: string | null
          last_warning_at?: string | null
          last_warning_level?: number | null
          max_auto_rotations?: number
          max_drawdown_pct?: number
          pairs?: string[]
          parent_session_id?: string | null
          pause_reason?: string | null
          peak_capital?: number
          portfolio_state?: Json
          realized_pnl?: number
          started_at?: string
          status?: string
          stopped_at?: string | null
          strategy_code?: string
          strategy_name?: string
          total_pnl?: number
          total_pnl_pct?: number
          total_ticks?: number
          unrealized_pnl?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crypto_paper_sessions_parent_session_id_fkey"
            columns: ["parent_session_id"]
            isOneToOne: false
            referencedRelation: "crypto_paper_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_paper_trades: {
        Row: {
          action: string
          created_at: string
          executed_at: string
          id: string
          pnl: number | null
          pnl_pct: number | null
          position_id: string | null
          price: number
          reason: string
          session_id: string
          size: number
          stake: number
          symbol: string
        }
        Insert: {
          action: string
          created_at?: string
          executed_at?: string
          id?: string
          pnl?: number | null
          pnl_pct?: number | null
          position_id?: string | null
          price: number
          reason?: string
          session_id: string
          size: number
          stake?: number
          symbol: string
        }
        Update: {
          action?: string
          created_at?: string
          executed_at?: string
          id?: string
          pnl?: number | null
          pnl_pct?: number | null
          position_id?: string | null
          price?: number
          reason?: string
          session_id?: string
          size?: number
          stake?: number
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "crypto_paper_trades_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "crypto_paper_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_paper_trades_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "crypto_paper_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      equity_snapshots: {
        Row: {
          backtest_run_id: string | null
          capital: number
          created_at: string
          id: string
          max_drawdown_pct: number
          open_positions: number
          pnl_today: number
          realized_pnl: number
          session_id: string
          snapshot_date: string
          source: string
          strategy_id: string
          total_pnl: number
          total_pnl_pct: number
          trades_today: number
          unrealized_pnl: number
        }
        Insert: {
          backtest_run_id?: string | null
          capital: number
          created_at?: string
          id?: string
          max_drawdown_pct?: number
          open_positions?: number
          pnl_today?: number
          realized_pnl?: number
          session_id: string
          snapshot_date: string
          source?: string
          strategy_id: string
          total_pnl?: number
          total_pnl_pct?: number
          trades_today?: number
          unrealized_pnl?: number
        }
        Update: {
          backtest_run_id?: string | null
          capital?: number
          created_at?: string
          id?: string
          max_drawdown_pct?: number
          open_positions?: number
          pnl_today?: number
          realized_pnl?: number
          session_id?: string
          snapshot_date?: string
          source?: string
          strategy_id?: string
          total_pnl?: number
          total_pnl_pct?: number
          trades_today?: number
          unrealized_pnl?: number
        }
        Relationships: [
          {
            foreignKeyName: "equity_snapshots_backtest_run_id_fkey"
            columns: ["backtest_run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equity_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "paper_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equity_snapshots_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          ai_analysis: string | null
          ai_model: string | null
          ai_recommendations: string | null
          area: Database["public"]["Enums"]["market_area"] | null
          created_at: string
          entry_snapshot: Json | null
          entry_type: Database["public"]["Enums"]["journal_entry_type"]
          exit_snapshot: Json | null
          id: string
          is_pinned: boolean
          lessons_learned: string | null
          strategy_id: string | null
          strategy_stats_at_time: Json | null
          tags: string[] | null
          title: string | null
          trade_id: string | null
          user_id: string
          what_went_well: string | null
          what_went_wrong: string | null
        }
        Insert: {
          ai_analysis?: string | null
          ai_model?: string | null
          ai_recommendations?: string | null
          area?: Database["public"]["Enums"]["market_area"] | null
          created_at?: string
          entry_snapshot?: Json | null
          entry_type?: Database["public"]["Enums"]["journal_entry_type"]
          exit_snapshot?: Json | null
          id?: string
          is_pinned?: boolean
          lessons_learned?: string | null
          strategy_id?: string | null
          strategy_stats_at_time?: Json | null
          tags?: string[] | null
          title?: string | null
          trade_id?: string | null
          user_id: string
          what_went_well?: string | null
          what_went_wrong?: string | null
        }
        Update: {
          ai_analysis?: string | null
          ai_model?: string | null
          ai_recommendations?: string | null
          area?: Database["public"]["Enums"]["market_area"] | null
          created_at?: string
          entry_snapshot?: Json | null
          entry_type?: Database["public"]["Enums"]["journal_entry_type"]
          exit_snapshot?: Json | null
          id?: string
          is_pinned?: boolean
          lessons_learned?: string | null
          strategy_id?: string | null
          strategy_stats_at_time?: Json | null
          tags?: string[] | null
          title?: string | null
          trade_id?: string | null
          user_id?: string
          what_went_well?: string | null
          what_went_wrong?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_analyses: {
        Row: {
          analysis_type: string
          area: string
          cache_level: string
          confidence: number
          content: string
          created_at: string
          data_points_used: Json
          estimated_cost_usd: number
          expires_at: string
          id: string
          market_id: string
          price_at_generation: number | null
          source_analysis_id: string | null
          structured_data: Json
          tokens_used: number
          updated_at: string
          version: number
        }
        Insert: {
          analysis_type: string
          area: string
          cache_level?: string
          confidence?: number
          content: string
          created_at?: string
          data_points_used?: Json
          estimated_cost_usd?: number
          expires_at?: string
          id?: string
          market_id: string
          price_at_generation?: number | null
          source_analysis_id?: string | null
          structured_data?: Json
          tokens_used?: number
          updated_at?: string
          version?: number
        }
        Update: {
          analysis_type?: string
          area?: string
          cache_level?: string
          confidence?: number
          content?: string
          created_at?: string
          data_points_used?: Json
          estimated_cost_usd?: number
          expires_at?: string
          id?: string
          market_id?: string
          price_at_generation?: number | null
          source_analysis_id?: string | null
          structured_data?: Json
          tokens_used?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "kb_analyses_source_analysis_id_fkey"
            columns: ["source_analysis_id"]
            isOneToOne: false
            referencedRelation: "kb_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_analysis_requests: {
        Row: {
          analysis_id: string | null
          analysis_type: string
          area: string
          cache_hit: boolean
          cache_level: string | null
          estimated_cost_saved_usd: number
          id: string
          market_id: string
          requested_at: string
          response_time_ms: number | null
          user_id: string | null
        }
        Insert: {
          analysis_id?: string | null
          analysis_type: string
          area: string
          cache_hit?: boolean
          cache_level?: string | null
          estimated_cost_saved_usd?: number
          id?: string
          market_id: string
          requested_at?: string
          response_time_ms?: number | null
          user_id?: string | null
        }
        Update: {
          analysis_id?: string | null
          analysis_type?: string
          area?: string
          cache_hit?: boolean
          cache_level?: string | null
          estimated_cost_saved_usd?: number
          id?: string
          market_id?: string
          requested_at?: string
          response_time_ms?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_analysis_requests_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "kb_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_analysis_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_market_profiles: {
        Row: {
          area: string
          created_at: string
          expires_at: string
          generated_at: string
          id: string
          last_known_price: number | null
          market_id: string
          price_at_generation: number | null
          profile_data: Json
          summary: string | null
          updated_at: string
          version: number
        }
        Insert: {
          area: string
          created_at?: string
          expires_at?: string
          generated_at?: string
          id?: string
          last_known_price?: number | null
          market_id: string
          price_at_generation?: number | null
          profile_data?: Json
          summary?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          area?: string
          created_at?: string
          expires_at?: string
          generated_at?: string
          id?: string
          last_known_price?: number | null
          market_id?: string
          price_at_generation?: number | null
          profile_data?: Json
          summary?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          ai_model: string | null
          area: Database["public"]["Enums"]["market_area"]
          content: Json
          created_at: string
          embedding_vector: string | null
          entity_id: string
          entity_name: string | null
          entity_type: string
          id: string
          invalidation_count: number
          invalidation_rule: string | null
          last_invalidated_at: string | null
          level: Database["public"]["Enums"]["kb_level"]
          prompt_hash: string | null
          summary: string | null
          tokens_used: number | null
          updated_at: string
          user_id: string | null
          valid_until: string | null
        }
        Insert: {
          ai_model?: string | null
          area: Database["public"]["Enums"]["market_area"]
          content: Json
          created_at?: string
          embedding_vector?: string | null
          entity_id: string
          entity_name?: string | null
          entity_type: string
          id?: string
          invalidation_count?: number
          invalidation_rule?: string | null
          last_invalidated_at?: string | null
          level: Database["public"]["Enums"]["kb_level"]
          prompt_hash?: string | null
          summary?: string | null
          tokens_used?: number | null
          updated_at?: string
          user_id?: string | null
          valid_until?: string | null
        }
        Update: {
          ai_model?: string | null
          area?: Database["public"]["Enums"]["market_area"]
          content?: Json
          created_at?: string
          embedding_vector?: string | null
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          id?: string
          invalidation_count?: number
          invalidation_rule?: string | null
          last_invalidated_at?: string | null
          level?: Database["public"]["Enums"]["kb_level"]
          prompt_hash?: string | null
          summary?: string | null
          tokens_used?: number | null
          updated_at?: string
          user_id?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_bankroll: {
        Row: {
          created_at: string
          currency: string
          id: string
          initial_capital: number
          peak_capital: number
          total_capital: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          initial_capital?: number
          peak_capital?: number
          total_capital?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          initial_capital?: number
          peak_capital?: number
          total_capital?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_bankroll_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_equity_snapshots: {
        Row: {
          created_at: string
          equity: number
          id: string
          pnl_pct: number
          timestamp: string
          user_id: string
        }
        Insert: {
          created_at?: string
          equity: number
          id?: string
          pnl_pct?: number
          timestamp?: string
          user_id: string
        }
        Update: {
          created_at?: string
          equity?: number
          id?: string
          pnl_pct?: number
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_equity_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_positions: {
        Row: {
          broker_order_id: string | null
          closed_at: string | null
          created_at: string
          current_price: number
          direction: string
          entry_price: number
          id: string
          opened_at: string
          size: number
          status: string
          strategy_id: string | null
          symbol: string
          unrealized_pnl: number
          unrealized_pnl_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          broker_order_id?: string | null
          closed_at?: string | null
          created_at?: string
          current_price?: number
          direction?: string
          entry_price: number
          id?: string
          opened_at?: string
          size: number
          status?: string
          strategy_id?: string | null
          symbol: string
          unrealized_pnl?: number
          unrealized_pnl_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          broker_order_id?: string | null
          closed_at?: string | null
          created_at?: string
          current_price?: number
          direction?: string
          entry_price?: number
          id?: string
          opened_at?: string
          size?: number
          status?: string
          strategy_id?: string | null
          symbol?: string
          unrealized_pnl?: number
          unrealized_pnl_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_trades: {
        Row: {
          actual_fill_price: number | null
          broker_entry_order_id: string | null
          broker_exit_order_id: string | null
          commission: number | null
          created_at: string
          direction: string
          entry_price: number | null
          executed_at: string
          exit_price: number | null
          exit_reason: string | null
          exited_at: string | null
          fill_time_ms: number | null
          id: string
          pnl: number | null
          position_id: string | null
          reconciliation_status: string | null
          size: number
          slippage: number | null
          status: string
          strategy_id: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_fill_price?: number | null
          broker_entry_order_id?: string | null
          broker_exit_order_id?: string | null
          commission?: number | null
          created_at?: string
          direction?: string
          entry_price?: number | null
          executed_at?: string
          exit_price?: number | null
          exit_reason?: string | null
          exited_at?: string | null
          fill_time_ms?: number | null
          id?: string
          pnl?: number | null
          position_id?: string | null
          reconciliation_status?: string | null
          size: number
          slippage?: number | null
          status?: string
          strategy_id?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_fill_price?: number | null
          broker_entry_order_id?: string | null
          broker_exit_order_id?: string | null
          commission?: number | null
          created_at?: string
          direction?: string
          entry_price?: number | null
          executed_at?: string
          exit_price?: number | null
          exit_reason?: string | null
          exited_at?: string | null
          fill_time_ms?: number | null
          id?: string
          pnl?: number | null
          position_id?: string | null
          reconciliation_status?: string | null
          size?: number
          slippage?: number | null
          status?: string
          strategy_id?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_trades_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "live_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_payload: Json | null
          action_responded_at: string | null
          action_response: string | null
          action_timeout_at: string | null
          action_type: string | null
          alert_id: string | null
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          delivery_error: string | null
          id: string
          is_read: boolean
          is_sent: boolean
          priority: boolean
          read_at: string | null
          sent_at: string | null
          title: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          action_payload?: Json | null
          action_responded_at?: string | null
          action_response?: string | null
          action_timeout_at?: string | null
          action_type?: string | null
          alert_id?: string | null
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivery_error?: string | null
          id?: string
          is_read?: boolean
          is_sent?: boolean
          priority?: boolean
          read_at?: string | null
          sent_at?: string | null
          title: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          action_payload?: Json | null
          action_responded_at?: string | null
          action_response?: string | null
          action_timeout_at?: string | null
          action_type?: string | null
          alert_id?: string | null
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivery_error?: string | null
          id?: string
          is_read?: boolean
          is_sent?: boolean
          priority?: boolean
          read_at?: string | null
          sent_at?: string | null
          title?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_positions: {
        Row: {
          closed_at: string | null
          created_at: string
          current_price: number
          entry_price: number
          entry_reason: string
          id: string
          market_id: string
          market_name: string
          opened_at: string
          quantity: number
          remaining_quantity: number
          session_id: string
          signal_confidence: number | null
          stake: number
          status: string
          strategy_id: string
          tier: string
          unrealized_pnl: number
          unrealized_pnl_pct: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          current_price: number
          entry_price: number
          entry_reason: string
          id?: string
          market_id: string
          market_name: string
          opened_at?: string
          quantity: number
          remaining_quantity: number
          session_id: string
          signal_confidence?: number | null
          stake: number
          status?: string
          strategy_id: string
          tier?: string
          unrealized_pnl?: number
          unrealized_pnl_pct?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          current_price?: number
          entry_price?: number
          entry_reason?: string
          id?: string
          market_id?: string
          market_name?: string
          opened_at?: string
          quantity?: number
          remaining_quantity?: number
          session_id?: string
          signal_confidence?: number | null
          stake?: number
          status?: string
          strategy_id?: string
          tier?: string
          unrealized_pnl?: number
          unrealized_pnl_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_positions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "paper_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_scan_results: {
        Row: {
          created_at: string
          current_price: number
          id: string
          market_category: string | null
          market_id: string
          market_name: string
          motivation: string
          scanned_at: string
          score: number
          session_id: string | null
          strategy_id: string
          suggested_stake: number | null
          volume_24h: number | null
        }
        Insert: {
          created_at?: string
          current_price: number
          id?: string
          market_category?: string | null
          market_id: string
          market_name: string
          motivation: string
          scanned_at?: string
          score: number
          session_id?: string | null
          strategy_id: string
          suggested_stake?: number | null
          volume_24h?: number | null
        }
        Update: {
          created_at?: string
          current_price?: number
          id?: string
          market_category?: string | null
          market_id?: string
          market_name?: string
          motivation?: string
          scanned_at?: string
          score?: number
          session_id?: string | null
          strategy_id?: string
          suggested_stake?: number | null
          volume_24h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_scan_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "paper_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_scan_results_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_sessions: {
        Row: {
          auto_rotation_count: number
          circuit_broken_at: string | null
          circuit_broken_reason: string | null
          cooldown_until: string | null
          created_at: string
          current_capital: number
          id: string
          initial_capital: number
          is_circuit_broken: boolean
          last_tick_at: string | null
          last_warning_at: string | null
          last_warning_level: number | null
          max_auto_rotations: number
          max_drawdown_pct: number
          parent_session_id: string | null
          pause_reason: string | null
          peak_capital: number
          portfolio_state: Json
          realized_pnl: number
          started_at: string
          status: string
          stopped_at: string | null
          strategy_id: string
          total_pnl: number
          total_pnl_pct: number
          total_ticks: number
          unrealized_pnl: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_rotation_count?: number
          circuit_broken_at?: string | null
          circuit_broken_reason?: string | null
          cooldown_until?: string | null
          created_at?: string
          current_capital?: number
          id?: string
          initial_capital?: number
          is_circuit_broken?: boolean
          last_tick_at?: string | null
          last_warning_at?: string | null
          last_warning_level?: number | null
          max_auto_rotations?: number
          max_drawdown_pct?: number
          parent_session_id?: string | null
          pause_reason?: string | null
          peak_capital?: number
          portfolio_state?: Json
          realized_pnl?: number
          started_at?: string
          status?: string
          stopped_at?: string | null
          strategy_id: string
          total_pnl?: number
          total_pnl_pct?: number
          total_ticks?: number
          unrealized_pnl?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_rotation_count?: number
          circuit_broken_at?: string | null
          circuit_broken_reason?: string | null
          cooldown_until?: string | null
          created_at?: string
          current_capital?: number
          id?: string
          initial_capital?: number
          is_circuit_broken?: boolean
          last_tick_at?: string | null
          last_warning_at?: string | null
          last_warning_level?: number | null
          max_auto_rotations?: number
          max_drawdown_pct?: number
          parent_session_id?: string | null
          pause_reason?: string | null
          peak_capital?: number
          portfolio_state?: Json
          realized_pnl?: number
          started_at?: string
          status?: string
          stopped_at?: string | null
          strategy_id?: string
          total_pnl?: number
          total_pnl_pct?: number
          total_ticks?: number
          unrealized_pnl?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_sessions_parent_session_id_fkey"
            columns: ["parent_session_id"]
            isOneToOne: false
            referencedRelation: "paper_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_sessions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trades: {
        Row: {
          action: string
          created_at: string
          executed_at: string
          gross_pnl: number | null
          id: string
          market_id: string
          market_name: string
          net_pnl: number | null
          position_id: string | null
          price: number
          quantity: number
          reason: string
          return_pct: number | null
          session_id: string
          signal_confidence: number | null
          stake: number
          strategy_id: string
          tier: string
        }
        Insert: {
          action: string
          created_at?: string
          executed_at?: string
          gross_pnl?: number | null
          id?: string
          market_id: string
          market_name: string
          net_pnl?: number | null
          position_id?: string | null
          price: number
          quantity: number
          reason: string
          return_pct?: number | null
          session_id: string
          signal_confidence?: number | null
          stake?: number
          strategy_id: string
          tier?: string
        }
        Update: {
          action?: string
          created_at?: string
          executed_at?: string
          gross_pnl?: number | null
          id?: string
          market_id?: string
          market_name?: string
          net_pnl?: number | null
          position_id?: string | null
          price?: number
          quantity?: number
          reason?: string
          return_pct?: number | null
          session_id?: string
          signal_confidence?: number | null
          stake?: number
          strategy_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "paper_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_trades_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "paper_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trading_snapshots: {
        Row: {
          area: string
          equity: number
          id: string
          open_positions: number
          pnl_pct: number
          session_id: string
          timestamp: string
        }
        Insert: {
          area: string
          equity: number
          id?: string
          open_positions?: number
          pnl_pct?: number
          session_id: string
          timestamp?: string
        }
        Update: {
          area?: string
          equity?: number
          id?: string
          open_positions?: number
          pnl_pct?: number
          session_id?: string
          timestamp?: string
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_areas: Database["public"]["Enums"]["market_area"][]
          anonymous_data_optin: boolean
          avatar_url: string | null
          betting_experience:
            | Database["public"]["Enums"]["experience_betting"]
            | null
          conflict_resolution: Database["public"]["Enums"]["conflict_resolution_type"]
          country_code: string
          created_at: string
          data_export_requested_at: string | null
          date_of_birth: string | null
          default_automation_level: Database["public"]["Enums"]["automation_level"]
          default_creation_mode: Database["public"]["Enums"]["creation_mode"]
          deletion_requested_at: string | null
          display_name: string | null
          dnd_end: string | null
          dnd_start: string | null
          expertise_level: Database["public"]["Enums"]["expertise_level"] | null
          financial_experience:
            | Database["public"]["Enums"]["experience_financial"]
            | null
          funds_source: Database["public"]["Enums"]["fund_source"] | null
          global_pause_at: string | null
          id: string
          is_global_pause: boolean
          locale: string
          max_affordable_loss:
            | Database["public"]["Enums"]["max_loss_tier"]
            | null
          max_drawdown_global: number
          max_sessions: number
          questionnaire_completed: boolean
          risk_understanding: boolean | null
          subscription_expires_at: string | null
          subscription_started_at: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          subscription_tier: Database["public"]["Enums"]["user_tier"]
          telegram_chat_id: number | null
          telegram_username: string | null
          telegram_verified: boolean
          timezone: string
          two_fa_enabled: boolean
          updated_at: string
        }
        Insert: {
          active_areas?: Database["public"]["Enums"]["market_area"][]
          anonymous_data_optin?: boolean
          avatar_url?: string | null
          betting_experience?:
            | Database["public"]["Enums"]["experience_betting"]
            | null
          conflict_resolution?: Database["public"]["Enums"]["conflict_resolution_type"]
          country_code?: string
          created_at?: string
          data_export_requested_at?: string | null
          date_of_birth?: string | null
          default_automation_level?: Database["public"]["Enums"]["automation_level"]
          default_creation_mode?: Database["public"]["Enums"]["creation_mode"]
          deletion_requested_at?: string | null
          display_name?: string | null
          dnd_end?: string | null
          dnd_start?: string | null
          expertise_level?:
            | Database["public"]["Enums"]["expertise_level"]
            | null
          financial_experience?:
            | Database["public"]["Enums"]["experience_financial"]
            | null
          funds_source?: Database["public"]["Enums"]["fund_source"] | null
          global_pause_at?: string | null
          id: string
          is_global_pause?: boolean
          locale?: string
          max_affordable_loss?:
            | Database["public"]["Enums"]["max_loss_tier"]
            | null
          max_drawdown_global?: number
          max_sessions?: number
          questionnaire_completed?: boolean
          risk_understanding?: boolean | null
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: Database["public"]["Enums"]["user_tier"]
          telegram_chat_id?: number | null
          telegram_username?: string | null
          telegram_verified?: boolean
          timezone?: string
          two_fa_enabled?: boolean
          updated_at?: string
        }
        Update: {
          active_areas?: Database["public"]["Enums"]["market_area"][]
          anonymous_data_optin?: boolean
          avatar_url?: string | null
          betting_experience?:
            | Database["public"]["Enums"]["experience_betting"]
            | null
          conflict_resolution?: Database["public"]["Enums"]["conflict_resolution_type"]
          country_code?: string
          created_at?: string
          data_export_requested_at?: string | null
          date_of_birth?: string | null
          default_automation_level?: Database["public"]["Enums"]["automation_level"]
          default_creation_mode?: Database["public"]["Enums"]["creation_mode"]
          deletion_requested_at?: string | null
          display_name?: string | null
          dnd_end?: string | null
          dnd_start?: string | null
          expertise_level?:
            | Database["public"]["Enums"]["expertise_level"]
            | null
          financial_experience?:
            | Database["public"]["Enums"]["experience_financial"]
            | null
          funds_source?: Database["public"]["Enums"]["fund_source"] | null
          global_pause_at?: string | null
          id?: string
          is_global_pause?: boolean
          locale?: string
          max_affordable_loss?:
            | Database["public"]["Enums"]["max_loss_tier"]
            | null
          max_drawdown_global?: number
          max_sessions?: number
          questionnaire_completed?: boolean
          risk_understanding?: boolean | null
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: Database["public"]["Enums"]["user_tier"]
          telegram_chat_id?: number | null
          telegram_username?: string | null
          telegram_verified?: boolean
          timezone?: string
          two_fa_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      published_strategies: {
        Row: {
          area: Database["public"]["Enums"]["market_area"]
          avg_trade_duration: string | null
          copiers_count: number
          description: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          is_free: boolean
          max_drawdown: number | null
          platform_fee_pct: number | null
          price_monthly: number | null
          profit_factor: number | null
          published_at: string
          publisher_id: string
          risk_level: Database["public"]["Enums"]["risk_level"]
          roi: number | null
          sharpe_ratio: number | null
          strategy_id: string
          title: string
          total_trades: number
          track_record_days: number
          updated_at: string
          win_rate: number | null
        }
        Insert: {
          area: Database["public"]["Enums"]["market_area"]
          avg_trade_duration?: string | null
          copiers_count?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_free?: boolean
          max_drawdown?: number | null
          platform_fee_pct?: number | null
          price_monthly?: number | null
          profit_factor?: number | null
          published_at?: string
          publisher_id: string
          risk_level: Database["public"]["Enums"]["risk_level"]
          roi?: number | null
          sharpe_ratio?: number | null
          strategy_id: string
          title: string
          total_trades?: number
          track_record_days?: number
          updated_at?: string
          win_rate?: number | null
        }
        Update: {
          area?: Database["public"]["Enums"]["market_area"]
          avg_trade_duration?: string | null
          copiers_count?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_free?: boolean
          max_drawdown?: number | null
          platform_fee_pct?: number | null
          price_monthly?: number | null
          profit_factor?: number | null
          published_at?: string
          publisher_id?: string
          risk_level?: Database["public"]["Enums"]["risk_level"]
          roi?: number | null
          sharpe_ratio?: number | null
          strategy_id?: string
          title?: string
          total_trades?: number
          track_record_days?: number
          updated_at?: string
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "published_strategies_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_strategies_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: true
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          archived_at: string | null
          area: Database["public"]["Enums"]["market_area"]
          automation_level: Database["public"]["Enums"]["automation_level"]
          backtest_passed_levels:
            | Database["public"]["Enums"]["backtest_level"][]
            | null
          backtest_summary: Json | null
          broker_name: string | null
          circuit_breaker_days: number | null
          circuit_breaker_loss_pct: number | null
          code: string
          consecutive_losses: number
          created_at: string
          creation_mode: Database["public"]["Enums"]["creation_mode"]
          current_max_drawdown: number | null
          current_profit_factor: number | null
          current_roi: number | null
          current_sharpe_ratio: number | null
          current_win_rate: number | null
          description: string | null
          highest_backtest_level:
            | Database["public"]["Enums"]["backtest_level"]
            | null
          id: string
          is_active: boolean
          is_archived: boolean
          is_paused: boolean
          losing_trades: number
          max_allocation_pct: number
          max_consecutive_losses: number | null
          max_drawdown: number
          min_ev: number | null
          min_probability: number | null
          name: string
          paper_profitable_days: number
          paper_trading_days: number
          pause_reason: string | null
          paused_at: string | null
          promoted_to_live_at: string | null
          promoted_to_paper_at: string | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          rules: Json
          rules_readable: string | null
          rules_version: number
          sizing_method: Database["public"]["Enums"]["sizing_method"]
          sizing_value: number | null
          status: Database["public"]["Enums"]["execution_mode"]
          tags: string[] | null
          total_trades: number
          updated_at: string
          user_id: string
          version: number
          winning_trades: number
        }
        Insert: {
          archived_at?: string | null
          area: Database["public"]["Enums"]["market_area"]
          automation_level?: Database["public"]["Enums"]["automation_level"]
          backtest_passed_levels?:
            | Database["public"]["Enums"]["backtest_level"][]
            | null
          backtest_summary?: Json | null
          broker_name?: string | null
          circuit_breaker_days?: number | null
          circuit_breaker_loss_pct?: number | null
          code: string
          consecutive_losses?: number
          created_at?: string
          creation_mode?: Database["public"]["Enums"]["creation_mode"]
          current_max_drawdown?: number | null
          current_profit_factor?: number | null
          current_roi?: number | null
          current_sharpe_ratio?: number | null
          current_win_rate?: number | null
          description?: string | null
          highest_backtest_level?:
            | Database["public"]["Enums"]["backtest_level"]
            | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_paused?: boolean
          losing_trades?: number
          max_allocation_pct?: number
          max_consecutive_losses?: number | null
          max_drawdown?: number
          min_ev?: number | null
          min_probability?: number | null
          name: string
          paper_profitable_days?: number
          paper_trading_days?: number
          pause_reason?: string | null
          paused_at?: string | null
          promoted_to_live_at?: string | null
          promoted_to_paper_at?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          rules?: Json
          rules_readable?: string | null
          rules_version?: number
          sizing_method?: Database["public"]["Enums"]["sizing_method"]
          sizing_value?: number | null
          status?: Database["public"]["Enums"]["execution_mode"]
          tags?: string[] | null
          total_trades?: number
          updated_at?: string
          user_id: string
          version?: number
          winning_trades?: number
        }
        Update: {
          archived_at?: string | null
          area?: Database["public"]["Enums"]["market_area"]
          automation_level?: Database["public"]["Enums"]["automation_level"]
          backtest_passed_levels?:
            | Database["public"]["Enums"]["backtest_level"][]
            | null
          backtest_summary?: Json | null
          broker_name?: string | null
          circuit_breaker_days?: number | null
          circuit_breaker_loss_pct?: number | null
          code?: string
          consecutive_losses?: number
          created_at?: string
          creation_mode?: Database["public"]["Enums"]["creation_mode"]
          current_max_drawdown?: number | null
          current_profit_factor?: number | null
          current_roi?: number | null
          current_sharpe_ratio?: number | null
          current_win_rate?: number | null
          description?: string | null
          highest_backtest_level?:
            | Database["public"]["Enums"]["backtest_level"]
            | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_paused?: boolean
          losing_trades?: number
          max_allocation_pct?: number
          max_consecutive_losses?: number | null
          max_drawdown?: number
          min_ev?: number | null
          min_probability?: number | null
          name?: string
          paper_profitable_days?: number
          paper_trading_days?: number
          pause_reason?: string | null
          paused_at?: string | null
          promoted_to_live_at?: string | null
          promoted_to_paper_at?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          rules?: Json
          rules_readable?: string | null
          rules_version?: number
          sizing_method?: Database["public"]["Enums"]["sizing_method"]
          sizing_value?: number | null
          status?: Database["public"]["Enums"]["execution_mode"]
          tags?: string[] | null
          total_trades?: number
          updated_at?: string
          user_id?: string
          version?: number
          winning_trades?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_parameters: {
        Row: {
          description: string | null
          id: string
          is_optimizable: boolean
          param_max: number | null
          param_min: number | null
          param_name: string
          param_type: string | null
          param_value: number
          strategy_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          is_optimizable?: boolean
          param_max?: number | null
          param_min?: number | null
          param_name: string
          param_type?: string | null
          param_value: number
          strategy_id: string
        }
        Update: {
          description?: string | null
          id?: string
          is_optimizable?: boolean
          param_max?: number | null
          param_min?: number | null
          param_name?: string
          param_type?: string | null
          param_value?: number
          strategy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_parameters_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          allocation_id: string | null
          area: Database["public"]["Enums"]["market_area"]
          asset_name: string | null
          asset_symbol: string
          bankroll_id: string | null
          broker_name: string | null
          broker_order_id: string | null
          commission: number | null
          created_at: string
          direction: Database["public"]["Enums"]["trade_direction"]
          edge_at_entry: number | null
          entered_at: string
          entry_price: number
          execution_type: Database["public"]["Enums"]["execution_type"]
          exit_price: number | null
          exit_reason: Database["public"]["Enums"]["exit_reason"] | null
          exited_at: string | null
          gross_pnl: number | null
          holding_duration: string | null
          id: string
          market_category: string | null
          market_condition:
            | Database["public"]["Enums"]["market_condition"]
            | null
          market_id: string | null
          market_probability: number | null
          market_snapshot: Json | null
          market_type: string | null
          net_pnl: number | null
          notes: string | null
          our_probability: number | null
          quantity: number
          signal_confidence: number | null
          slippage: number | null
          slippage_simulated: number | null
          stake: number
          status: Database["public"]["Enums"]["trade_status"]
          stop_price: number | null
          strategy_id: string
          tags: string[] | null
          target_price: number | null
          timeframe: Database["public"]["Enums"]["trade_timeframe"] | null
          trigger_rule: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allocation_id?: string | null
          area: Database["public"]["Enums"]["market_area"]
          asset_name?: string | null
          asset_symbol: string
          bankroll_id?: string | null
          broker_name?: string | null
          broker_order_id?: string | null
          commission?: number | null
          created_at?: string
          direction: Database["public"]["Enums"]["trade_direction"]
          edge_at_entry?: number | null
          entered_at?: string
          entry_price: number
          execution_type: Database["public"]["Enums"]["execution_type"]
          exit_price?: number | null
          exit_reason?: Database["public"]["Enums"]["exit_reason"] | null
          exited_at?: string | null
          gross_pnl?: number | null
          holding_duration?: string | null
          id?: string
          market_category?: string | null
          market_condition?:
            | Database["public"]["Enums"]["market_condition"]
            | null
          market_id?: string | null
          market_probability?: number | null
          market_snapshot?: Json | null
          market_type?: string | null
          net_pnl?: number | null
          notes?: string | null
          our_probability?: number | null
          quantity: number
          signal_confidence?: number | null
          slippage?: number | null
          slippage_simulated?: number | null
          stake: number
          status?: Database["public"]["Enums"]["trade_status"]
          stop_price?: number | null
          strategy_id: string
          tags?: string[] | null
          target_price?: number | null
          timeframe?: Database["public"]["Enums"]["trade_timeframe"] | null
          trigger_rule?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allocation_id?: string | null
          area?: Database["public"]["Enums"]["market_area"]
          asset_name?: string | null
          asset_symbol?: string
          bankroll_id?: string | null
          broker_name?: string | null
          broker_order_id?: string | null
          commission?: number | null
          created_at?: string
          direction?: Database["public"]["Enums"]["trade_direction"]
          edge_at_entry?: number | null
          entered_at?: string
          entry_price?: number
          execution_type?: Database["public"]["Enums"]["execution_type"]
          exit_price?: number | null
          exit_reason?: Database["public"]["Enums"]["exit_reason"] | null
          exited_at?: string | null
          gross_pnl?: number | null
          holding_duration?: string | null
          id?: string
          market_category?: string | null
          market_condition?:
            | Database["public"]["Enums"]["market_condition"]
            | null
          market_id?: string | null
          market_probability?: number | null
          market_snapshot?: Json | null
          market_type?: string | null
          net_pnl?: number | null
          notes?: string | null
          our_probability?: number | null
          quantity?: number
          signal_confidence?: number | null
          slippage?: number | null
          slippage_simulated?: number | null
          stake?: number
          status?: Database["public"]["Enums"]["trade_status"]
          stop_price?: number | null
          strategy_id?: string
          tags?: string[] | null
          target_price?: number | null
          timeframe?: Database["public"]["Enums"]["trade_timeframe"] | null
          trigger_rule?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "bankroll_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_bankroll_id_fkey"
            columns: ["bankroll_id"]
            isOneToOne: false
            referencedRelation: "bankrolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_strategy_performance: {
        Args: {
          p_execution_type?: Database["public"]["Enums"]["execution_type"]
          p_strategy_id: string
        }
        Returns: {
          avg_edge: number
          avg_holding_time: string
          avg_slippage_real: number
          avg_slippage_simulated: number
          gross_profit: number
          losing_trades: number
          max_consecutive_losses: number
          max_consecutive_wins: number
          max_drawdown: number
          net_profit: number
          profit_factor: number
          roi: number
          sharpe_ratio: number
          total_commission: number
          total_slippage: number
          total_trades: number
          win_rate: number
          winning_trades: number
        }[]
      }
      check_allocation_limit: {
        Args: {
          p_bankroll_id: string
          p_requested_amount: number
          p_strategy_id: string
        }
        Returns: Json
      }
      check_drawdown_limits: {
        Args: {
          p_area?: Database["public"]["Enums"]["market_area"]
          p_strategy_id?: string
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      alert_condition_type:
        | "price_move"
        | "indicator_threshold"
        | "consecutive_losses"
        | "circuit_breaker"
        | "anomaly"
        | "drawdown_warning"
        | "strategy_promoted"
        | "custom"
      audit_action:
        | "strategy_created"
        | "strategy_updated"
        | "strategy_promoted"
        | "strategy_paused"
        | "strategy_archived"
        | "trade_opened"
        | "trade_closed"
        | "trade_cancelled"
        | "bankroll_updated"
        | "bankroll_deposit"
        | "bankroll_withdrawal"
        | "alert_triggered"
        | "circuit_breaker_activated"
        | "kill_switch_activated"
        | "drawdown_limit_hit"
        | "settings_changed"
        | "api_key_added"
        | "api_key_removed"
        | "copy_trading_subscribed"
        | "copy_trading_unsubscribed"
        | "strategy_published"
        | "strategy_unpublished"
        | "login"
        | "logout"
        | "two_fa_enabled"
        | "two_fa_disabled"
        | "questionnaire_completed"
      automation_level: "pilot" | "copilot" | "autopilot"
      backtest_level:
        | "quick_scan"
        | "robustness"
        | "stress_test"
        | "overfitting_check"
      conflict_resolution_type:
        | "performance_priority"
        | "neutralize"
        | "netting"
      creation_mode: "autopilot" | "copilot" | "manual"
      execution_mode: "observation" | "paper_trading" | "live"
      execution_type: "paper" | "live"
      exit_reason:
        | "take_profit"
        | "stop_loss"
        | "trailing_stop"
        | "rule_exit"
        | "circuit_breaker"
        | "kill_switch"
        | "drawdown_limit"
        | "manual"
        | "expiration"
        | "margin_call"
      experience_betting: "none" | "occasional" | "regular"
      experience_financial: "none" | "basic" | "intermediate" | "advanced"
      expertise_level: "beginner" | "intermediate" | "expert"
      fund_source: "income" | "savings" | "other"
      journal_entry_type:
        | "trade_analysis"
        | "strategy_review"
        | "market_note"
        | "manual_note"
        | "ai_suggestion"
      kb_level: "l1_profile" | "l2_event" | "l3_personal"
      market_area: "polymarket" | "betfair" | "stocks" | "forex" | "crypto"
      market_condition: "trending" | "ranging" | "volatile" | "calm"
      max_loss_tier:
        | "under_100"
        | "from_100_to_1000"
        | "from_1000_to_10000"
        | "over_10000"
      notification_channel: "telegram" | "push" | "email"
      risk_level: "conservative" | "moderate" | "aggressive"
      sizing_method: "kelly_criterion" | "fixed_percentage" | "fixed_amount"
      subscription_status:
        | "active"
        | "trial"
        | "past_due"
        | "cancelled"
        | "expired"
      trade_direction: "long" | "short"
      trade_status: "open" | "closed" | "cancelled"
      trade_timeframe:
        | "scalping"
        | "intraday"
        | "swing"
        | "position"
        | "long_term"
      user_tier: "free" | "pro" | "elite"
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
      alert_condition_type: [
        "price_move",
        "indicator_threshold",
        "consecutive_losses",
        "circuit_breaker",
        "anomaly",
        "drawdown_warning",
        "strategy_promoted",
        "custom",
      ],
      audit_action: [
        "strategy_created",
        "strategy_updated",
        "strategy_promoted",
        "strategy_paused",
        "strategy_archived",
        "trade_opened",
        "trade_closed",
        "trade_cancelled",
        "bankroll_updated",
        "bankroll_deposit",
        "bankroll_withdrawal",
        "alert_triggered",
        "circuit_breaker_activated",
        "kill_switch_activated",
        "drawdown_limit_hit",
        "settings_changed",
        "api_key_added",
        "api_key_removed",
        "copy_trading_subscribed",
        "copy_trading_unsubscribed",
        "strategy_published",
        "strategy_unpublished",
        "login",
        "logout",
        "two_fa_enabled",
        "two_fa_disabled",
        "questionnaire_completed",
      ],
      automation_level: ["pilot", "copilot", "autopilot"],
      backtest_level: [
        "quick_scan",
        "robustness",
        "stress_test",
        "overfitting_check",
      ],
      conflict_resolution_type: [
        "performance_priority",
        "neutralize",
        "netting",
      ],
      creation_mode: ["autopilot", "copilot", "manual"],
      execution_mode: ["observation", "paper_trading", "live"],
      execution_type: ["paper", "live"],
      exit_reason: [
        "take_profit",
        "stop_loss",
        "trailing_stop",
        "rule_exit",
        "circuit_breaker",
        "kill_switch",
        "drawdown_limit",
        "manual",
        "expiration",
        "margin_call",
      ],
      experience_betting: ["none", "occasional", "regular"],
      experience_financial: ["none", "basic", "intermediate", "advanced"],
      expertise_level: ["beginner", "intermediate", "expert"],
      fund_source: ["income", "savings", "other"],
      journal_entry_type: [
        "trade_analysis",
        "strategy_review",
        "market_note",
        "manual_note",
        "ai_suggestion",
      ],
      kb_level: ["l1_profile", "l2_event", "l3_personal"],
      market_area: ["polymarket", "betfair", "stocks", "forex", "crypto"],
      market_condition: ["trending", "ranging", "volatile", "calm"],
      max_loss_tier: [
        "under_100",
        "from_100_to_1000",
        "from_1000_to_10000",
        "over_10000",
      ],
      notification_channel: ["telegram", "push", "email"],
      risk_level: ["conservative", "moderate", "aggressive"],
      sizing_method: ["kelly_criterion", "fixed_percentage", "fixed_amount"],
      subscription_status: [
        "active",
        "trial",
        "past_due",
        "cancelled",
        "expired",
      ],
      trade_direction: ["long", "short"],
      trade_status: ["open", "closed", "cancelled"],
      trade_timeframe: [
        "scalping",
        "intraday",
        "swing",
        "position",
        "long_term",
      ],
      user_tier: ["free", "pro", "elite"],
    },
  },
} as const
