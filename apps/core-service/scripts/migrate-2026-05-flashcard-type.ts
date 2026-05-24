/**
 * Migration: 2026-05 — Flashcard.type (deprecated) → Flashcard.cardType.
 *
 * Plan 18.1: the schema had two parallel enums. `cardType` is canonical and
 * covers `basic`/`bidirectional`/`cloze`; `type` only covered `standard`/`cloze`.
 *
 * Mapping when backfilling:
 *   type === 'cloze'    → cardType = 'cloze'
 *   type === 'standard' → cardType = 'basic'
 *
 * Idempotent: if cardType is already set, the legacy field is just unset.
 *
 * Run: cd apps/core-service && npx ts-node scripts/migrate-2026-05-flashcard-type.ts
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

  const flashcards = mongoose.connection.collection('flashcards');
  const cursor = flashcards.find({ type: { $exists: true } });

  let scanned = 0;
  let backfilled = 0;
  let unset = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const legacyType = doc.type as 'standard' | 'cloze' | undefined;
    const hasCardType = typeof doc.cardType === 'string' && doc.cardType.length > 0;

    const update: { $set?: Record<string, unknown>; $unset: Record<string, ''> } = {
      $unset: { type: '' },
    };

    if (!hasCardType && legacyType) {
      update.$set = { cardType: legacyType === 'cloze' ? 'cloze' : 'basic' };
      backfilled += 1;
    }

    const res = await flashcards.updateOne({ _id: doc._id }, update);
    if (res.modifiedCount > 0) unset += 1;
  }

  console.log(`Scanned: ${scanned}, cardType backfilled: ${backfilled}, unset: ${unset}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
