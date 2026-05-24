import { Types } from 'mongoose';
import { UserSession } from '../models/UserSession';

function parseDevice(ua: string): string {
  if (!ua) return 'Unknown device';
  const browser =
    ua.includes('Chrome') ? 'Chrome' :
    ua.includes('Firefox') ? 'Firefox' :
    ua.includes('Safari') ? 'Safari' :
    ua.includes('Edge') ? 'Edge' : 'Browser';
  const os =
    ua.includes('Windows') ? 'Windows' :
    ua.includes('Mac') ? 'macOS' :
    ua.includes('Linux') ? 'Linux' :
    ua.includes('Android') ? 'Android' :
    ua.includes('iPhone') || ua.includes('iPad') ? 'iOS' : 'Unknown OS';
  return `${browser} · ${os}`;
}

export async function createSession(userId: string, userAgent: string, expiresAt: Date) {
  const device = parseDevice(userAgent);
  return UserSession.create({ userId: new Types.ObjectId(userId), device, expiresAt });
}

export async function listSessions(userId: string) {
  return UserSession.find({ userId: new Types.ObjectId(userId) })
    .sort({ lastActiveAt: -1 })
    .lean();
}

export async function deleteSession(userId: string, sessionId: string) {
  await UserSession.deleteOne({ _id: new Types.ObjectId(sessionId), userId: new Types.ObjectId(userId) });
}

export async function deleteAllSessions(userId: string) {
  await UserSession.deleteMany({ userId: new Types.ObjectId(userId) });
}
