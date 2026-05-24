/**
 * Migration: 2026-05 — User.preferences (embedded) → UserPreferences collection.
 *
 * Plan 18.1: the embedded subdoc was missing llmModel/pdfDarkInvert/leechThreshold/
 * comprehensionCheckpoints, and writes from one path were invisible to the other.
 * Drop the subdoc; backfill any data into the side collection.
 *
 * Idempotent: re-runs upsert without overwriting newer side-collection values.
 *
 * Run: npx ts-node apps/core-service/scripts/migrate-2026-05-user-prefs.ts
 *   or: cd apps/core-service && npx ts-node scripts/migrate-2026-05-user-prefs.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { UserPreferences } from '../src/models/UserPreferences';

interface LegacyPrefs {
  theme?: 'light' | 'dark' | 'system';
  llmProvider?: 'external' | 'local';
  embeddingProvider?: 'openai' | 'local';
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI (or MONGODB_URI) env var required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected: ${mongoose.connection.name}`);

  const users = mongoose.connection.collection('users');
  const cursor = users.find({ preferences: { $exists: true, $ne: null } });

  let scanned = 0;
  let migrated = 0;
  let unset = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const userId = doc._id;
    const legacy = doc.preferences as LegacyPrefs | undefined;

    if (legacy && typeof legacy === 'object') {
      const update: Record<string, unknown> = {};
      if (legacy.theme) update.theme = legacy.theme;
      if (legacy.llmProvider) update.llmProvider = legacy.llmProvider;

      if (Object.keys(update).length > 0) {
        await UserPreferences.updateOne(
          { userId },
          { $setOnInsert: { userId, ...update } },
          { upsert: true },
        );
        migrated += 1;
      }
    }

    const res = await users.updateOne({ _id: userId }, { $unset: { preferences: '' } });
    if (res.modifiedCount > 0) unset += 1;
  }

  console.log(`Scanned: ${scanned}, side-collection upserts: ${migrated}, unset: ${unset}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
