import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFeynmanSchedule extends Document {
  userId: Types.ObjectId;
  studySetId: Types.ObjectId;
  feynmanSessionId: Types.ObjectId;
  topic: string;
  scheduledFor: Date;
  interval: number; // days
  easeFactor: number;
  repetitions: number;
  nextReviewAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FeynmanScheduleSchema = new Schema<IFeynmanSchedule>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  studySetId: { type: Schema.Types.ObjectId, ref: 'StudySet', required: true },
  feynmanSessionId: { type: Schema.Types.ObjectId, ref: 'FeynmanSession', required: true },
  topic: { type: String, required: true },
  scheduledFor: { type: Date, required: true },
  interval: { type: Number, required: true, min: 1 },
  easeFactor: { type: Number, required: true, default: 2.5 },
  repetitions: { type: Number, required: true, default: 0 },
  nextReviewAt: { type: Date, required: true },
  completedAt: { type: Date },
}, { timestamps: true });

FeynmanScheduleSchema.index({ userId: 1, nextReviewAt: 1 });
FeynmanScheduleSchema.index({ feynmanSessionId: 1 });
FeynmanScheduleSchema.index({ userId: 1, studySetId: 1 });

export const FeynmanSchedule = mongoose.model<IFeynmanSchedule>(
  'FeynmanSchedule', FeynmanScheduleSchema
);
