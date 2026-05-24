import mongoose, { Schema, Document, Types } from 'mongoose';

export type DeadlineType = 'exam' | 'quiz' | 'assignment' | 'custom';

export interface IDeadline extends Document {
  userId:           Types.ObjectId;
  studySetId?:      Types.ObjectId | null;
  type:             DeadlineType;
  label:            string;
  date:             Date;
  notifyDaysBefore: number[];
  snoozeUntil?:     Date | null;
  remindedAt?:      Date | null;
  passedAt?:        Date | null;
  createdAt:        Date;
  updatedAt:        Date;
}

const DeadlineSchema = new Schema<IDeadline>(
  {
    userId:           { type: Schema.Types.ObjectId, ref: 'User',     required: true, index: true },
    studySetId:       { type: Schema.Types.ObjectId, ref: 'StudySet', default: null, index: true },
    type:             { type: String, enum: ['exam', 'quiz', 'assignment', 'custom'], required: true },
    label:            { type: String, required: true, maxlength: 100 },
    date:             { type: Date, required: true },
    notifyDaysBefore: { type: [Number], default: [7, 3, 1] },
    snoozeUntil:      { type: Date, default: null },
    remindedAt:       { type: Date, default: null },
    passedAt:         { type: Date, default: null },
  },
  { timestamps: true },
);

DeadlineSchema.index({ userId: 1, date: 1 });
DeadlineSchema.index({ userId: 1, studySetId: 1 });

export const Deadline = mongoose.model<IDeadline>('Deadline', DeadlineSchema);
