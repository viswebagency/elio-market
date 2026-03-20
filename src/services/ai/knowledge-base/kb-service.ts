/**
 * Knowledge Base service — manages pre-computed analysis and RAG-based retrieval.
 */

import { KBLevel } from '@/core/types/ai';

export interface KBEntry {
  id: string;
  level: KBLevel;
  category: string;
  key: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  expiresAt?: string;
  createdAt: string;
}

export class KBService {
  /** Get cached/pre-computed response (L1) */
  async getL1(_category: string, _key: string): Promise<KBEntry | null> {
    // TODO: query Supabase for cached KB entries
    return null;
  }

  /** RAG search over knowledge base (L2) */
  async searchL2(_query: string, _category?: string, _limit = 5): Promise<KBEntry[]> {
    // TODO: vector similarity search via pgvector
    return [];
  }

  /** Store a KB entry */
  async store(_entry: Omit<KBEntry, 'id' | 'createdAt'>): Promise<KBEntry> {
    // TODO: store in Supabase with embedding
    throw new Error('KB store not yet implemented');
  }

  /** Invalidate cached entries */
  async invalidate(_category: string, _key?: string): Promise<number> {
    // TODO: delete matching entries
    return 0;
  }
}

export const kbService = new KBService();
