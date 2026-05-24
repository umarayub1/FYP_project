import { Schema, model, Document, Types } from 'mongoose';

export interface UserPreferencesDoc extends Document {
  userId:                   Types.ObjectId;
  theme:                    'system' | 'light' | 'dark';
  reviewBatchSize:          number;
  topK:                     number;
  motionPref:               'auto' | 'on' | 'off';
  soundFx:                  boolean;
  temperature:              number;
  browserShortcuts:         boolean;
  llmProvider:              string;
  llmModel:                 string;
  pdfDarkInvert:            boolean;
  comprehensionCheckpoints: boolean;
  comprehensionInterval:    number;
  leechThreshold:           number;
}

const UserPreferencesSchema = new Schema<UserPreferencesDoc>(
  {
    userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    theme:            { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    reviewBatchSize:  { type: Number, default: 20 },
    topK:             { type: Number, default: 5 },
    motionPref:       { type: String, enum: ['auto', 'on', 'off'], default: 'auto' },
    soundFx:          { type: Boolean, default: true },
    temperature:      { type: Number, default: 0.7 },
    browserShortcuts:         { type: Boolean, default: true },
    llmProvider:              { type: String, default: 'external' },
    llmModel:                 { type: String, default: 'gpt-4o-mini' },
    pdfDarkInvert:            { type: Boolean, default: false },
    comprehensionCheckpoints: { type: Boolean, default: true },
    comprehensionInterval:    { type: Number, default: 5, min: 1, max: 50 },
    leechThreshold:           { type: Number, default: 8, min: 3, max: 20 },
  },
  { timestamps: true },
);

export const UserPreferences = model<UserPreferencesDoc>('UserPreferences', UserPreferencesSchema);
