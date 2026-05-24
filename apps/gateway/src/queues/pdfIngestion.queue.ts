import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

export async function enqueueIngestionJob(payload: {
  documentId: string;
  userId: string;
  studySetId: string;
  storagePath: string;
}): Promise<void> {
  await redis.lpush('pdf-ingestion', JSON.stringify(payload));
}
