import { Schema, model, Document, Types } from 'mongoose';

export interface UsageQuotaDoc extends Document {
  userId: Types.ObjectId;
  period: string;
  tokensUsed: number;
  pdfsIngested: number;
  feynmanSessions: number;
}

const UsageQuotaSchema = new Schema<UsageQuotaDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    period: { type: String, required: true },
    tokensUsed: { type: Number, default: 0 },
    pdfsIngested: { type: Number, default: 0 },
    feynmanSessions: { type: Number, default: 0 },
  },
  { timestamps: false },
);

UsageQuotaSchema.index({ userId: 1, period: 1 }, { unique: true });

export const UsageQuota = model<UsageQuotaDoc>('UsageQuota', UsageQuotaSchema);
