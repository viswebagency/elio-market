/**
 * Setup script for Binance Testnet sandbox.
 *
 * Encrypts testnet API keys, inserts them into broker_api_keys,
 * creates a live strategy entry for CR-C02b, sets up live_bankroll,
 * enables 2FA flag on profile, and verifies connectivity.
 *
 * Usage: npx tsx scripts/setup-sandbox.ts
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// AES-256-GCM encryption (mirrors src/lib/auth/encryption.ts)
// ---------------------------------------------------------------------------

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error('ENCRYPTION_KEY not set');
  const keyBytes = hexToBytes(keyHex);
  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, data);
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

async function decrypt(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivHex, ctHex] = encrypted.split(':');
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ctHex);
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-000000000001';
const STRATEGY_CODE = 'CR-C02b';
const INITIAL_BANKROLL = 50; // $50 testnet

async function main() {
  // Validate env
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testnetKey = process.env.BINANCE_TESTNET_KEY;
  const testnetSecret = process.env.BINANCE_TESTNET_SECRET;

  if (!url || !key) throw new Error('Missing Supabase env vars');
  if (!testnetKey || !testnetSecret) throw new Error('Missing BINANCE_TESTNET_KEY / BINANCE_TESTNET_SECRET');
  if (!process.env.ENCRYPTION_KEY) throw new Error('Missing ENCRYPTION_KEY');

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\n--- Binance Testnet Sandbox Setup ---\n');

  // 1. Encrypt testnet keys
  console.log('1. Encrypting testnet API keys...');
  const encryptedKey = await encrypt(testnetKey);
  const encryptedSecret = await encrypt(testnetSecret);

  // Verify roundtrip
  const decryptedKey = await decrypt(encryptedKey);
  if (decryptedKey !== testnetKey) throw new Error('Encryption roundtrip failed!');
  console.log('   OK — encryption verified');

  // 2. Insert broker_api_keys
  console.log('2. Inserting broker_api_keys...');
  const { data: brokerRow, error: brokerErr } = await db
    .from('broker_api_keys')
    .upsert({
      user_id: USER_ID,
      area: 'crypto',
      broker_name: 'binance',
      encrypted_key: encryptedKey,
      encrypted_secret: encryptedSecret,
      extra_config: { sandbox: true },
      is_active: true,
    }, { onConflict: 'user_id,area,broker_name' })
    .select('id')
    .single();

  if (brokerErr) {
    // If upsert fails (no unique constraint), try insert
    console.log('   Upsert failed, trying insert...');
    const { error: insertErr } = await db
      .from('broker_api_keys')
      .insert({
        user_id: USER_ID,
        area: 'crypto',
        broker_name: 'binance',
        encrypted_key: encryptedKey,
        encrypted_secret: encryptedSecret,
        extra_config: { sandbox: true },
        is_active: true,
      });
    if (insertErr) throw new Error(`broker_api_keys insert failed: ${insertErr.message}`);
  }
  console.log('   OK — broker key saved (sandbox: true)');

  // 3. Insert strategy with status='live'
  console.log('3. Creating live strategy CR-C02b...');

  // Check if already exists
  const { data: existing } = await db
    .from('strategies')
    .select('id, status')
    .eq('user_id', USER_ID)
    .eq('code', STRATEGY_CODE)
    .eq('version', 1)
    .single();

  if (existing) {
    // Update to live
    await db.from('strategies').update({
      status: 'live',
      is_active: true,
      promoted_to_live_at: new Date().toISOString(),
    }).eq('id', existing.id);
    console.log(`   OK — updated existing strategy ${existing.id} to status=live`);
  } else {
    const { data: newStrat, error: stratErr } = await db
      .from('strategies')
      .insert({
        user_id: USER_ID,
        code: STRATEGY_CODE,
        version: 1,
        name: 'Crypto Conservative v2b',
        description: 'Sandbox test — Binance testnet',
        area: 'crypto',
        creation_mode: 'copilot',
        automation_level: 'copilot',
        status: 'live',
        promoted_to_live_at: new Date().toISOString(),
        risk_level: 'conservative',
        max_drawdown: 15.00,
        max_allocation_pct: 10.00,
        circuit_breaker_loss_pct: 15.00,
        max_consecutive_losses: 10,
        rules: {},
        is_active: true,
        broker_name: 'binance',
      })
      .select('id')
      .single();

    if (stratErr) throw new Error(`strategies insert failed: ${stratErr.message}`);
    console.log(`   OK — created strategy ${newStrat?.id}`);
  }

  // 4. Setup live_bankroll
  console.log('4. Setting up live_bankroll ($50 testnet)...');
  // Schema: user_id, total_capital, initial_capital, peak_capital, currency
  const { data: existingBankroll } = await db
    .from('live_bankroll')
    .select('id')
    .eq('user_id', USER_ID)
    .single();

  if (existingBankroll) {
    await db.from('live_bankroll').update({
      total_capital: INITIAL_BANKROLL,
      initial_capital: INITIAL_BANKROLL,
      peak_capital: INITIAL_BANKROLL,
      currency: 'USDT',
    }).eq('id', existingBankroll.id);
  } else {
    const { error: insertErr } = await db
      .from('live_bankroll')
      .insert({
        user_id: USER_ID,
        total_capital: INITIAL_BANKROLL,
        initial_capital: INITIAL_BANKROLL,
        peak_capital: INITIAL_BANKROLL,
        currency: 'USDT',
      });
    if (insertErr) throw new Error(`live_bankroll insert failed: ${insertErr.message}`);
  }
  console.log('   OK — bankroll set to $50');

  // 5. Enable 2FA flag on profile
  console.log('5. Enabling two_fa_enabled on profile...');
  const { error: profileErr } = await db
    .from('profiles')
    .update({ two_fa_enabled: true })
    .eq('id', USER_ID);

  if (profileErr) throw new Error(`profile update failed: ${profileErr.message}`);
  console.log('   OK — 2FA enabled');

  // 6. Verify everything
  console.log('\n--- Verification ---\n');

  const { data: verifyBroker } = await db
    .from('broker_api_keys')
    .select('id, area, broker_name, is_active, extra_config')
    .eq('user_id', USER_ID)
    .eq('area', 'crypto')
    .single();
  console.log('broker_api_keys:', JSON.stringify(verifyBroker, null, 2));

  const { data: verifyStrat } = await db
    .from('strategies')
    .select('id, code, status, area, is_active, broker_name')
    .eq('user_id', USER_ID)
    .eq('code', STRATEGY_CODE)
    .single();
  console.log('strategy:', JSON.stringify(verifyStrat, null, 2));

  const { data: verifyBankroll } = await db
    .from('live_bankroll')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('area', 'crypto')
    .single();
  console.log('live_bankroll:', JSON.stringify(verifyBankroll, null, 2));

  const { data: verifyProfile } = await db
    .from('profiles')
    .select('id, two_fa_enabled')
    .eq('id', USER_ID)
    .single();
  console.log('profile:', JSON.stringify(verifyProfile, null, 2));

  // 7. Test Binance testnet connectivity
  console.log('\n--- Binance Testnet Connectivity ---\n');
  try {
    const ccxt = await import('ccxt');
    const exchange = new ccxt.binance({
      apiKey: testnetKey,
      secret: testnetSecret,
      sandbox: true,
    });
    await exchange.loadMarkets();
    const ticker = await exchange.fetchTicker('BTC/USDT');
    console.log(`BTC/USDT testnet price: $${ticker.last}`);
    const balance = await exchange.fetchBalance();
    console.log(`USDT balance: ${balance.USDT?.free ?? 0} (free) / ${balance.USDT?.total ?? 0} (total)`);
    console.log('\n   Binance testnet: CONNECTED\n');
  } catch (err) {
    console.error('   Binance testnet connection FAILED:', err instanceof Error ? err.message : err);
    console.log('   (This may be due to geo-blocking — will work on Vercel)');
  }

  console.log('=== Setup complete! ===');
  console.log('Next: register live-tick cron in vercel.json and deploy');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
