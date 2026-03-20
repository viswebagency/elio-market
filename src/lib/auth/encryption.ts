/**
 * AES-256-GCM encryption for sensitive data (broker API keys, secrets).
 * Keys are encrypted before storage and decrypted only at execution time.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

/** Get the encryption key from environment */
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error('ENCRYPTION_KEY not set');

  const keyBytes = hexToBytes(keyHex);
  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt a plaintext string */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  // Format: iv:ciphertext (both hex-encoded)
  const ivHex = bytesToHex(iv);
  const ctHex = bytesToHex(new Uint8Array(ciphertext));
  return `${ivHex}:${ctHex}`;
}

/** Decrypt an encrypted string */
export async function decrypt(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const [ivHex, ctHex] = encrypted.split(':');
  if (!ivHex || !ctHex) throw new Error('Invalid encrypted format');

  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ctHex);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
