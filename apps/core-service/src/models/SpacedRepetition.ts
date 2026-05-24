import { Schema, model, Document, Types } from 'mongoose';

export interface SpacedRepetitionDoc extends Document {
  flashcardId: Types.ObjectId;
  userId: Types.ObjectId;
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueAt: Date;
  lastReviewedAt?: Date;
}

const SpacedRepetitionSchema = new Schema<SpacedRepetitionDoc>(
  {
    flashcardId: { type: Schema.Types.ObjectId, unique: true, index: true, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    easeFactor: { type: Number, default: 2.5, min: 1.3 },
    interval: { type: Number, default: 0 },
    repetitions: { type: Number, default: 0 },
    dueAt: { type: Date, index: true },
    lastReviewedAt: { type: Date },
  },
  { timestamps: false },
);

export const SpacedRepetition = model<SpacedRepetitionDoc>(
  'SpacedRepetition',
  SpacedRepetitionSchema,
);
