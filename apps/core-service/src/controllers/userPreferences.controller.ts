import { Types } from 'mongoose';
import { UserPreferences } from '../models/UserPreferences';

const DEFAULTS = {
  theme:            'system',
  reviewBatchSize:  20,
  topK:             5,
  motionPref:       'auto',
  soundFx:          true,
  temperature:      0.7,
  browserShortcuts: true,
  llmProvider:      'external',
  llmModel:         'gpt-4o-mini',
};

export async function getPreferences(userId: string) {
  const prefs = await UserPreferences.findOne({ userId: new Types.ObjectId(userId) }).lean();
  return prefs ?? DEFAULTS;
}

export async function upsertPreferences(userId: string, data: Record<string, unknown>) {
  const allowed = [
    'theme', 'reviewBatchSize', 'topK', 'motionPref', 'soundFx', 'temperature',
    'browserShortcuts', 'llmProvider', 'llmModel',
    'pdfDarkInvert', 'comprehensionCheckpoints', 'comprehensionInterval', 'leechThreshold',
  ];
  const update = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
  return UserPreferences.findOneAndUpdate(
    { userId: new Types.ObjectId(userId) },
    { $set: update },
    { upsert: true, new: true },
  );
}
