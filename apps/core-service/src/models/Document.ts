import { Schema, model, Document as MongoDocument, Types } from 'mongoose';

export interface DocumentDoc extends MongoDocument {
  userId: Types.ObjectId;
  studySetId: Types.ObjectId;
  type: 'pdf' | 'note';
  title: string;
  storageUri?: string;
  blockNoteJson?: object;
  ingestionStatus: 'pending' | 'processing' | 'ready' | 'failed';
  vectorChunkIds: string[];
  checkpoints: { page: number; scrollY: number; savedAt: Date }[];
  comprehensionChecks: {
    page:     number;
    question: string;
    answer:   string;
    correct:  boolean;
    expected: string;
    feedback: string;
    takenAt:  Date;
  }[];
}

const DocumentSchema = new Schema<DocumentDoc>(
  {
    userId: { type: Schema.Types.ObjectId, index: true, required: true },
    studySetId: { type: Schema.Types.ObjectId, ref: 'StudySet', index: true, required: true },
    type: { type: String, enum: ['pdf', 'note'], required: true },
    title: { type: String, required: true },
    storageUri: { type: String },
    blockNoteJson: { type: Schema.Types.Mixed },
    ingestionStatus: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
    },
    vectorChunkIds: { type: [String], default: [] },
    checkpoints: {
      type: [{ page: Number, scrollY: Number, savedAt: Date }],
      default: [],
    },
    comprehensionChecks: {
      type: [{
        page:     Number,
        question: String,
        answer:   String,
        correct:  Boolean,
        expected: String,
        feedback: String,
        takenAt:  Date,
      }],
      default: [],
    },
  },
  { timestamps: true },
);

export const Doc = model<DocumentDoc>('Document', DocumentSchema);
