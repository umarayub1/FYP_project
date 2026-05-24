import mongoose, { Schema, Document, Types } from 'mongoose';

export type ActivityType = 'flashcard' | 'feynman' | 'document' | 'coach';

export interface IStudySession extends Document {
  userId: Types.ObjectId;
  startedAt: Date;
  endedAt?: Date;
  activityType: ActivityType;
  studySetId?: Types.ObjectId;
  durationSeconds: number;
  durationMinutes: number;
  date: string; // YYYY-MM-DD for heatmap grouping
  createdAt: Date;
}

const StudySessionSchema = new Schema<IStudySession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: { type: Date, required: true, default: Date.now },
  endedAt: { type: Date },
  activityType: {
    type: String,
    enum: ['flashcard', 'feynman', 'document', 'coach'],
    required: true,
  },
  studySetId: { type: Schema.Types.ObjectId, ref: 'StudySet' },
  durationSeconds: { type: Number, default: 0 },
  durationMinutes: { type: Number, default: 0 },
  date: { type: String, required: true }, // YYYY-MM-DD
}, { timestamps: true });

StudySessionSchema.index({ userId: 1, startedAt: -1 });
StudySessionSchema.index({ userId: 1, activityType: 1 });
StudySessionSchema.index({ userId: 1, date: -1 });

export const StudySession = mongoose.model<IStudySession>('StudySession', StudySessionSchema);
