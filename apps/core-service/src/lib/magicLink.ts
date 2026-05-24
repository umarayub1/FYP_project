import crypto from 'crypto';
import { getRedis } from './redis';

const TTL_MINUTES = () => parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES ?? '10', 10);

function secret(): string {
  if (!process.env.MAGIC_LINK_SECRET) throw new Error('MAGIC_LINK_SECRET env var not set');
  return process.env.MAGIC_LINK_SECRET;
}

function sign(payload: object): string {
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, sig })).toString('base64url');
}

function unsign(token: string): { email: string; nonce: string; exp: number } {
  const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
    data: string;
    sig: string;
  };
  const expected = crypto.createHmac('sha256', secret()).update(decoded.data).digest('hex');
  if (expected !== decoded.sig) throw new Error('Invalid token signature');
  return JSON.parse(decoded.data) as { email: string; nonce: string; exp: number };
}

export async function generateToken(email: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const exp = Date.now() + TTL_MINUTES() * 60 * 1000;
  const token = sign({ email, nonce, exp });
  const redis = getRedis();
  await redis.set(`magic:${token}`, email, 'EX', TTL_MINUTES() * 60);
  return token;
}

export async function verifyToken(token: string): Promise<string> {
  const payload = unsign(token);
  if (Date.now() > payload.exp) throw new Error('Token expired');
  const redis = getRedis();
  const stored = await redis.get(`magic:${token}`);
  if (!stored) throw new Error('Token not found or already used');
  await redis.del(`magic:${token}`);
  return stored;
}
