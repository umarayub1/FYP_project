import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  createdAt?: Date;
}

export interface ICoachConversation extends Document {
  userId: Types.ObjectId;
  studySetId?: Types.ObjectId;
  title: string;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const CoachConversationSchema = new Schema<ICoachConversation>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  studySetId: { type: Schema.Types.ObjectId, ref: 'StudySet' },
  title: { type: String, maxlength: 100, default: 'New conversation' },
  messages: [MessageSchema],
}, { timestamps: true });

CoachConversationSchema.index({ userId: 1, updatedAt: -1 });
CoachConversationSchema.index({ userId: 1, studySetId: 1, createdAt: -1 });

export const CoachConversation = mongoose.model<ICoachConversation>(
  'CoachConversation', CoachConversationSchema
);
