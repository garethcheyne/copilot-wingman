import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey(encryptionKey: string): Buffer {
  return createHash('sha256').update(encryptionKey).digest();
}

export function encrypt(plaintext: string, encryptionKey: string): Buffer {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: [iv (16)] [tag (16)] [ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

export function decrypt(data: Buffer | Uint8Array, encryptionKey: string): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const key = deriveKey(encryptionKey);
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
