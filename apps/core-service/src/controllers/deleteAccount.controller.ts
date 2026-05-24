import { Types } from 'mongoose';
import { User } from '../models/User';
import { StudySet } from '../models/StudySet';
import { Flashcard } from '../models/Flashcard';
import { SpacedRepetition } from '../models/SpacedRepetition';
import { Doc } from '../models/Document';
import { Note } from '../models/Note';
import { Tag } from '../models/Tag';
import { UsageQuota } from '../models/UsageQuota';
import { UserPreferences } from '../models/UserPreferences';
import { ApiKey } from '../models/ApiKey';
import { UserSession } from '../models/UserSession';

export async function deleteAccount(userId: string): Promise<{ deleted: boolean }> {
  const oid = new Types.ObjectId(userId);
  await Promise.all([
    User.deleteOne({ _id: oid }),
    StudySet.deleteMany({ userId: oid }),
    Flashcard.deleteMany({ userId: oid }),
    SpacedRepetition.deleteMany({ userId: oid }),
    Doc.deleteMany({ userId: oid }),
    Note.deleteMany({ userId: oid }),
    Tag.deleteMany({ userId: oid }),
    UsageQuota.deleteMany({ userId: oid }),
    UserPreferences.deleteOne({ userId: oid }),
    ApiKey.deleteMany({ userId: oid }),
    UserSession.deleteMany({ userId: oid }),
  ]);
  return { deleted: true };
}
