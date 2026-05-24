import { Schema, model, Document, Types } from 'mongoose';

export interface TagDoc extends Document {
  userId:     Types.ObjectId;
  name:       string;
  slug:       string;
  color?:     string;
  global:     boolean;
  usageCount: number;
}

const TagSchema = new Schema<TagDoc>(
  {
    userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name:       { type: String, required: true, maxlength: 50 },
    slug:       { type: String, required: true },
    color:      { type: String },
    global:     { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

TagSchema.index({ userId: 1, slug: 1 }, { unique: true });

export const Tag = model<TagDoc>('Tag', TagSchema);
