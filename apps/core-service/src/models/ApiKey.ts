import { Schema, model, Document, Types } from 'mongoose';

export interface ApiKeyDoc extends Document {
  userId:       Types.ObjectId;
  provider:     'openai' | 'anthropic';
  encryptedKey: string;
  iv:           string;
  validatedAt?: Date;
}

const ApiKeySchema = new Schema<ApiKeyDoc>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider:     { type: String, enum: ['openai', 'anthropic'], required: true },
    encryptedKey: { type: String, required: true },
    iv:           { type: String, required: true },
    validatedAt:  { type: Date },
  },
  { timestamps: true },
);

ApiKeySchema.index({ userId: 1, provider: 1 }, { unique: true });

export const ApiKey = model<ApiKeyDoc>('ApiKey', ApiKeySchema);
