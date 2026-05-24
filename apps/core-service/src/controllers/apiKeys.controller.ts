import crypto from 'crypto';
import { Types } from 'mongoose';
import { ApiKey } from '../models/ApiKey';

const ALGO = 'aes-256-cbc';

function getEncKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? 'synapse-default-enc-key-32-chars!';
  return Buffer.from(raw.padEnd(32, '0').slice(0, 32));
}

function encrypt(text: string): { encryptedKey: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getEncKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { encryptedKey: encrypted.toString('hex'), iv: iv.toString('hex') };
}

export function decrypt(encryptedKey: string, iv: string): string {
  const decipher = crypto.createDecipheriv(ALGO, getEncKey(), Buffer.from(iv, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedKey, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

export async function upsertApiKey(userId: string, provider: 'openai' | 'anthropic', key: string) {
  const { encryptedKey, iv } = encrypt(key);
  return ApiKey.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), provider },
    { $set: { encryptedKey, iv, validatedAt: new Date() } },
    { upsert: true, new: true },
  );
}

export async function deleteApiKey(userId: string, provider: 'openai' | 'anthropic') {
  await ApiKey.deleteOne({ userId: new Types.ObjectId(userId), provider });
}

export async function listApiKeys(userId: string) {
  return ApiKey.find(
    { userId: new Types.ObjectId(userId) },
    { encryptedKey: 0, iv: 0 },
  ).lean();
}
