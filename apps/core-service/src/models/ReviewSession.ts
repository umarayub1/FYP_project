import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReviewSession extends Document {
  userId: Types.ObjectId;
  studySetId: Types.ObjectId;
  flashcardIds: Types.ObjectId[];
  startedAt: Date;
  completedAt?: Date;
  cram: boolean;
  cardsReviewed: number;
  accuracy: number;
  durationMinutes: number;
  results: Array<{
    flashcardId: Types.ObjectId;
    quality: number;
    timeTakenMs: number;
  }>;
  createdAt: Date;
}

const ReviewSessionSchema = new Schema<IReviewSession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  studySetId: { type: Schema.Types.ObjectId, ref: 'StudySet', required: true },
  flashcardIds: [{ type: Schema.Types.ObjectId, ref: 'Flashcard' }],
  startedAt: { type: Date, required: true, default: Date.now },
  completedAt: { type: Date },
  cram: { type: Boolean, default: false },
  cardsReviewed: { type: Number, default: 0 },
  accuracy: { type: Number, default: 0 },
  durationMinutes: { type: Number, default: 0 },
  results: [{
    flashcardId: { type: Schema.Types.ObjectId, ref: 'Flashcard' },
    quality: { type: Number },
    timeTakenMs: { type: Number },
  }],
}, { timestamps: true });

ReviewSessionSchema.index({ userId: 1, startedAt: -1 });
ReviewSessionSchema.index({ userId: 1, studySetId: 1, startedAt: -1 });

export const ReviewSession = mongoose.model<IReviewSession>('ReviewSession', ReviewSessionSchema);
