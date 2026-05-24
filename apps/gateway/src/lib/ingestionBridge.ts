import Redis from 'ioredis';
import { Server as SocketServer } from 'socket.io';

export function startIngestionBridge(io: SocketServer): Redis {
  const subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  subscriber.psubscribe('ingestion:*', (err) => {
    if (err) console.error('[ingestionBridge] psubscribe error:', err);
  });

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    const documentId = channel.replace('ingestion:', '');
    try {
      const payload = JSON.parse(message) as Record<string, unknown>;
      const eventName = (typeof payload.event === 'string' ? payload.event : 'ingestion:progress');
      // Broadcast to BOTH the doc room (reader-side progress) and the
      // user room (list-page auto-refresh) in a single emit so a socket
      // joined to both rooms gets the event only once.
      const userId = typeof payload.userId === 'string' ? payload.userId : undefined;
      const target = userId
        ? io.to(`doc:${documentId}`).to(`user:${userId}`)
        : io.to(`doc:${documentId}`);
      target.emit(eventName, payload);
    } catch (err) {
      console.error('[ingestionBridge] Failed to parse message:', err);
    }
  });

  return subscriber;
}
