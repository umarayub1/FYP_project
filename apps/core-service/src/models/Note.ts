import { Schema, model, Document, Types } from 'mongoose';

export interface NoteDoc extends Document {
  userId:          Types.ObjectId;
  studySetId:      Types.ObjectId;
  title:           string;
  content:         unknown;
  isCornell:       boolean;
  cornellCue?:     unknown;
  cornellSummary?: unknown;
  tags:            string[];
  cornellScore?:   number;
  scoreHistory:    { score: number; timestamp: Date }[];
  parentNoteId:    Types.ObjectId | null;
  stagedBlocks?:   unknown[];
}

const NoteSchema = new Schema<NoteDoc>(
  {
    userId:          { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studySetId:      { type: Schema.Types.ObjectId, ref: 'StudySet', required: true, index: true },
    title:           { type: String, required: true, maxlength: 300 },
    content:         { type: Schema.Types.Mixed, default: null },
    isCornell:       { type: Boolean, default: false },
    cornellCue:      { type: Schema.Types.Mixed, default: null },
    cornellSummary:  { type: Schema.Types.Mixed, default: null },
    tags:            { type: [String], default: [] },
    cornellScore:    { type: Number, min: 0, max: 100 },
    scoreHistory:    { type: [{ score: Number, timestamp: Date }], default: [] },
    parentNoteId:    { type: Schema.Types.ObjectId, ref: 'Note', default: null, index: true },
    stagedBlocks:    { type: [Schema.Types.Mixed] },
  },
  { timestamps: true },
);

NoteSchema.index({ studySetId: 1, createdAt: -1 });

export const Note = model<NoteDoc>('Note', NoteSchema);
