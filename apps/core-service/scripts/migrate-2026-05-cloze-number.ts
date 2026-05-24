/**
 * Migration: 2026-05 — Compute clozeNumber for existing cloze flashcards.
 *
 * Phase A.5: the clozeNumber field (max group count in {{cN::...}} markers)
 * was never set on historical cards. This script back-fills it idempotently.
 *
 * Idempotent: cards that already have clozeNumber set are skipped.
 *
 * Run: cd apps/core-service && npx ts-node scripts/migrate-2026-05-cloze-number.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';

function parseClozeMarkers(clozeBody: string): number {
  const matches = clozeBody.match(/\{\{c(\d+)::/g) ?? [];
  const nums = matches.map(m => parseInt(m.replace('{{c', '').replace('::', ''), 10));
  return nums.length > 0 ? Math.max(...nums) : 1;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI (or MONGODB_URI) env var required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected: ${mongoose.connection.name}`);

  const col = mongoose.connection.collection('flashcards');
  const cursor = col.find({ cardType: 'cloze', clozeBody: { $exists: true, $ne: null }, clozeNumber: { $exists: false } });

  let modified = 0;
  let skipped = 0;

  for await (const card of cursor) {
    const clozeBody = card.clozeBody as string | undefined;
    if (!clozeBody) { skipped++; continue; }
    const clozeNumber = parseClozeMarkers(clozeBody);
    await col.updateOne({ _id: card._id }, { $set: { clozeNumber } });
    modified++;
  }

  console.log(`Done: ${modified} updated, ${skipped} skipped (no clozeBody).`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
