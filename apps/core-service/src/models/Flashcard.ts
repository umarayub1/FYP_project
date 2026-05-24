import { Schema, model, Document, Types } from 'mongoose';

export interface FlashcardDoc extends Document {
  userId:           Types.ObjectId;
  studySetId:       Types.ObjectId;
  cardType:         'basic' | 'bidirectional' | 'cloze';
  front:            string;
  back:             string;
  clozeBody?:       string;
  clozeNumber?:     number;
  bidirectional?:   boolean;
  isBidirectional?: boolean;
  pairId?:          Types.ObjectId;
  tags:             string[];
  sourceDocumentId?: Types.ObjectId;
  sourceTitle?:     string;
  sourcePage?:      number;
  suspended:        boolean;
  lapses:           number;
  isLeech:          boolean;
  leechAt?:         Date;
}

const FlashcardSchema = new Schema<FlashcardDoc>(
  {
    userId:           { type: Schema.Types.ObjectId, index: true, required: true },
    studySetId:       { type: Schema.Types.ObjectId, index: true, required: true },
    cardType:         { type: String, enum: ['basic', 'bidirectional', 'cloze'], default: 'basic' },
    front:            { type: String, default: '' },
    back:             { type: String, default: '' },
    clozeBody:        { type: String },
    clozeNumber:      { type: Number },
    bidirectional:    { type: Boolean, default: false },
    isBidirectional:  { type: Boolean, default: false },
    pairId:           { type: Schema.Types.ObjectId },
    tags:             { type: [String], default: [] },
    sourceDocumentId: { type: Schema.Types.ObjectId },
    sourceTitle:      { type: String },
    sourcePage:       { type: Number },
    suspended:        { type: Boolean, default: false },
    lapses:           { type: Number, default: 0 },
    isLeech:          { type: Boolean, default: false, index: true },
    leechAt:          { type: Date },
  },
  { timestamps: true },
);

export const Flashcard = model<FlashcardDoc>('Flashcard', FlashcardSchema);
