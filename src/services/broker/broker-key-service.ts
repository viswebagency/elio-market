/**
 * BrokerKeyService — retrieves encrypted broker API keys from Supabase,
 * decrypts them, and creates authenticated CryptoAdapter instances.
 *
 * Caches adapters in memory for 5 minutes to avoid repeated DB lookups.
 */

import { CryptoAdapter, SupportedExchange } from '@/plugins/crypto/adapter';
import { decrypt } from '@/lib/auth/encryption';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

interface CacheEntry {
  adapter: CryptoAdapter;
  createdAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class BrokerKeyService {
  private cache = new Map<string, CacheEntry>();
  private forceSandbox: boolean;

  constructor(opts?: { forceSandbox?: boolean }) {
    this.forceSandbox = opts?.forceSandbox ?? false;
  }

  /**
   * Get an authenticated CryptoAdapter for a given broker.
   * Reads from broker_api_keys, decrypts, and returns a ready adapter.
   */
  async getBrokerAdapter(area: string, brokerName: string): Promise<CryptoAdapter> {
    if (area !== 'crypto') {
      throw new Error(`[BrokerKeyService] Area '${area}' not supported — only 'crypto' is available`);
    }

    const supportedExchanges: SupportedExchange[] = ['binance', 'bybit'];
    if (!supportedExchanges.includes(brokerName as SupportedExchange)) {
      throw new Error(`[BrokerKeyService] Broker '${brokerName}' not supported — use 'binance' or 'bybit'`);
    }

    const cacheKey = `${area}:${brokerName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return cached.adapter;
    }

    const supabase = createUntypedAdminClient();

    const { data, error } = await supabase
      .from('broker_api_keys')
      .select('encrypted_key, encrypted_secret, extra_config')
      .eq('area', area)
      .eq('broker_name', brokerName)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      throw new Error(
        `[BrokerKeyService] No active API key found for ${area}/${brokerName}: ${error?.message ?? 'not found'}`,
      );
    }

    const apiKey = await decrypt(data.encrypted_key);
    const apiSecret = data.encrypted_secret ? await decrypt(data.encrypted_secret) : undefined;

    const sandbox = this.forceSandbox || (data.extra_config?.sandbox === true);

    const adapter = new CryptoAdapter({
      exchange: brokerName as SupportedExchange,
      apiKey,
      apiSecret,
      sandbox,
    });

    this.cache.set(cacheKey, { adapter, createdAt: Date.now() });

    return adapter;
  }

  /** Clear the adapter cache */
  clearCache(): void {
    this.cache.clear();
  }
}
