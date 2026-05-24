/**
 * Migration: 2026-05 — flatten StudySet.deadlines[] → Deadline collection.
 *
 * Plan H (Phase 30). The new collection adds snooze, reminders, calendar
 * compatibility, and user-level deadlines (studySetId null). The subdoc is
 * preserved this release as a read-side fallback; cleanup will remove the
 * subdoc field once data parity is verified.
 *
 * Idempotent: upserts keyed on (userId, studySetId, label, date) so re-runs
 * never duplicate. Marks each migrated subdoc with `migratedAt` so the source
 * row is observably accounted for.
 *
 * Run:
 *   cd apps/core-service && npx ts-node scripts/migrate-2026-05-deadlines-collection.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Deadline } from '../src/models/Deadline';
import { StudySet } from '../src/models/StudySet';

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI (or MONGODB_URI) env var required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected: ${mongoose.connection.name}`);

  let scannedSets = 0;
  let upserts = 0;
  let skipped = 0;

  const cursor = StudySet.find({ 'deadlines.0': { $exists: true } }).cursor();

  for await (const set of cursor) {
    scannedSets += 1;
    const setId = set._id as mongoose.Types.ObjectId;
    const userId = set.userId;

    for (const sub of set.deadlines ?? []) {
      const date = new Date(sub.date);
      if (Number.isNaN(date.getTime())) {
        console.warn(`[skip] invalid date on set=${setId} sub=${sub._id}: ${sub.date}`);
        skipped += 1;
        continue;
      }

      // Idempotent key: (userId, studySetId, label, date)
      const existing = await Deadline.findOne({
        userId,
        studySetId: setId,
        label:      sub.label,
        date,
      });

      if (existing) {
        skipped += 1;
      } else {
        await Deadline.create({
          userId,
          studySetId:       setId,
          type:             sub.type,
          label:            sub.label,
          date,
          notifyDaysBefore: sub.notifyDaysBefore?.length ? sub.notifyDaysBefore : [7, 3, 1],
          passedAt:         sub.passedAt ?? null,
        });
        upserts += 1;
      }

      // Stamp the subdoc so the source row is annotated.
      await StudySet.updateOne(
        { _id: setId, 'deadlines._id': sub._id },
        { $set: { 'deadlines.$.migratedAt': new Date() } },
      );
    }
  }

  console.log(`Scanned sets: ${scannedSets}, upserts: ${upserts}, skipped (existing): ${skipped}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
