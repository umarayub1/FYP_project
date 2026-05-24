import { Schema, model, Document, Types } from 'mongoose';

export interface DeadlineSubDoc {
  _id:              Types.ObjectId;
  type:             'exam' | 'quiz' | 'assignment' | 'custom';
  label:            string;
  date:             string;   // YYYY-MM-DD
  notifyDaysBefore: number[];
  createdAt:        Date;
  passedAt?:        Date;
}

export interface StudySetDoc extends Document {
  userId:     Types.ObjectId;
  name:       string;
  color:      string;
  deadlines:  Types.DocumentArray<DeadlineSubDoc>;
  archived:   boolean;
  archivedAt?: Date;
}

const DeadlineSchema = new Schema<DeadlineSubDoc>(
  {
    type:             { type: String, enum: ['exam', 'quiz', 'assignment', 'custom'], required: true },
    label:            { type: String, required: true, maxlength: 100 },
    date:             { type: String, required: true },
    notifyDaysBefore: { type: [Number], default: [] },
    createdAt:        { type: Date, default: Date.now },
    passedAt:         { type: Date },
  },
  { _id: true },
);

const StudySetSchema = new Schema<StudySetDoc>(
  {
    userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name:       { type: String, required: true, maxlength: 100 },
    color:      { type: String, required: true, enum: ['--set-violet', '--set-teal', '--set-amber', '--set-red', '--set-blue', '--set-green', '--set-pink', '--set-slate'] },
    deadlines:  { type: [DeadlineSchema], default: [] },
    archived:   { type: Boolean, default: false, index: true },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);

export const StudySet = model<StudySetDoc>('StudySet', StudySetSchema);
