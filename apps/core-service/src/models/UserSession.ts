import { Schema, model, Document, Types } from 'mongoose';

export interface UserSessionDoc extends Document {
  userId:       Types.ObjectId;
  device:       string;
  createdAt:    Date;
  lastActiveAt: Date;
  expiresAt:    Date;
}

const UserSessionSchema = new Schema<UserSessionDoc>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    device:       { type: String, required: true, maxlength: 200 },
    lastActiveAt: { type: Date, default: Date.now },
    expiresAt:    { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Auto-purge expired sessions
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserSession = model<UserSessionDoc>('UserSession', UserSessionSchema);
