import { Schema, model, Document } from 'mongoose';

export interface UserDoc extends Document {
  email: string;
  name?: string;
  passwordHash?: string;
  onboardingComplete: boolean;
  apiKeys: { openai?: string; anthropic?: string };
  subscription: { tier: 'free' | 'pro'; renewsAt?: Date };
}

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    // Deprecated: magic link auth replaces password auth. Field kept to avoid data loss on existing documents.
    passwordHash: { type: String, select: false },
    onboardingComplete: { type: Boolean, default: false },
    apiKeys: { type: Schema.Types.Mixed, default: {} },
    subscription: {
      tier: { type: String, enum: ['free', 'pro'], default: 'free' },
      renewsAt: { type: Date },
    },
  },
  { timestamps: true },
);

UserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete (ret as unknown as Record<string, unknown>).passwordHash;
    return ret;
  },
});

export const User = model<UserDoc>('User', UserSchema);
