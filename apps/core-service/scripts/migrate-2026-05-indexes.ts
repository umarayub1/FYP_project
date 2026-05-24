/**
 * Migration: 2026-05 — Index cleanup (Plan 18.1).
 *
 * - Drops the redundant standalone `{ studySetId: 1 }` index on `reviewsessions`.
 *   It is a strict prefix of the new compound `{ userId, studySetId, startedAt }`
 *   index, so it provides no additional query benefit. Mongoose ensureIndexes
 *   does not drop superseded indexes on its own.
 *
 * Idempotent: silently skips if the index is absent.
 *
 * Run: cd apps/core-service && npx ts-node scripts/migrate-2026-05-indexes.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI (or MONGODB_URI) env var required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected: ${mongoose.connection.name}`);

  const reviewsessions = mongoose.connection.collection('reviewsessions');
  const indexes = await reviewsessions.indexes();

  const candidate = indexes.find((idx) => {
    const keys = Object.keys(idx.key);
    return keys.length === 1 && keys[0] === 'studySetId' && idx.key.studySetId === 1;
  });

  if (candidate?.name) {
    await reviewsessions.dropIndex(candidate.name);
    console.log(`Dropped redundant index: ${candidate.name}`);
  } else {
    console.log('Redundant {studySetId:1} index not present — nothing to drop.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
