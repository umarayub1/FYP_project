import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Idempotent: set parentNoteId: null on all notes that don't have the field
  const result = await mongoose.connection
    .collection('notes')
    .updateMany(
      { parentNoteId: { $exists: false } },
      { $set: { parentNoteId: null } },
    );

  console.log(`Updated ${result.modifiedCount} notes (${result.matchedCount} matched)`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
