import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFeynmanSession extends Document {
  userId: Types.ObjectId;
  studySetId: Types.ObjectId;
  documentId?: string;
  topic: string;
  status: 'active' | 'paused' | 'complete';
  // Rubric strictness locked at session start — affects how the per-concept
  // judge grades "covered" vs "partial" vs "missing".
  difficulty: 'easy' | 'medium' | 'hard';
  clarityScore: number;
  accuracyScore: number;
  explanation: string;
  coverage: Array<{ id: string; label: string; status: 'covered' | 'partial' | 'missing' }>;
  scheduledReviewAt?: Date;
  // Soft-delete marker. List queries filter out non-null values so user-deleted
  // sessions disappear from the dashboard while the row is retained for recovery.
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const FeynmanSessionSchema = new Schema<IFeynmanSession>({
  userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  studySetId: { type: Schema.Types.ObjectId, ref: 'StudySet', required: true },
  documentId: { type: String, default: null },
  topic:      { type: String, required: true },
  status:     { type: String, enum: ['active', 'paused', 'complete'], required: true, default: 'active' },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true, default: 'medium' },
  clarityScore:  { type: Number, default: 0 },
  accuracyScore: { type: Number, default: 0 },
  explanation: { type: String, default: '' },
  coverage: [{
    id:     { type: String },
    label:  { type: String },
    status: { type: String, enum: ['covered', 'partial', 'missing'] },
  }],
  scheduledReviewAt: { type: Date },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// Existing indexes are still selective even with the deletedAt filter; no
// need for a separate partial index until the deleted-row count grows large.
FeynmanSessionSchema.index({ userId: 1, studySetId: 1, createdAt: -1 });
FeynmanSessionSchema.index({ userId: 1, createdAt: -1 });

export const FeynmanSession = mongoose.model<IFeynmanSession>('FeynmanSession', FeynmanSessionSchema);
