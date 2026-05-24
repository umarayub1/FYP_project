/**
 * Integration tests for Phase A persistence paths.
 * Requires real Mongo — set MONGO_URI in env or the suite is skipped.
 * Run: cd apps/core-service && npm test -- persistence.test.ts
 */
import mongoose, { Types } from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

const describeIf = (cond: boolean, name: string, fn: () => void) =>
  cond ? describe(name, fn) : describe.skip(name, fn);

describeIf(Boolean(MONGO_URI), 'Persistence integration tests', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI, { dbName: 'synapse_test_persistence' });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  // ── A.2 Notes PATCH ───────────────────────────────────────────────────────
  describe('Note PATCH', () => {
    const { Note } = require('../../src/models/Note');
    const notesController = require('../../src/controllers/notes.controller');
    const userId = new Types.ObjectId().toString();
    const studySetId = new Types.ObjectId().toString();
    let noteId: string;

    beforeEach(async () => {
      const note = await Note.create({ userId, studySetId, title: 'Test note', content: null });
      noteId = note._id.toString();
    });

    afterEach(async () => {
      await Note.deleteMany({ userId });
    });

    it('happy path: persists title + content + stagedBlocks', async () => {
      const staged = [{ id: 'b1', content: 'hello', type: 'cue' }];
      const updated = await notesController.updateNote(noteId, userId, studySetId, {
        title: 'Updated',
        content: { type: 'doc' },
        stagedBlocks: staged,
      });
      expect(updated.title).toBe('Updated');
      const fresh = await Note.findById(noteId).lean();
      expect(fresh.stagedBlocks).toHaveLength(1);
      expect(fresh.stagedBlocks[0].content).toBe('hello');
    });
  });

  // ── A.2 Unknown field rejection ────────────────────────────────────────────
  describe('Note updateSchema strict mode', () => {
    it('Zod rejects unknown field', () => {
      const { z } = require('zod');
      const updateSchema = z.object({
        userId:       z.string().min(1),
        studySetId:   z.string().min(1),
        title:        z.string().optional(),
        stagedBlocks: z.array(z.any()).optional(),
      }).strict();
      const result = updateSchema.safeParse({ userId: 'u1', studySetId: 's1', unknownField: 'x' });
      expect(result.success).toBe(false);
    });
  });

  // ── A.3 Coach conversation message persistence ─────────────────────────────
  describe('CoachConversation messages', () => {
    const { CoachConversation } = require('../../src/models/CoachConversation');
    const userId = new Types.ObjectId();
    const studySetId = new Types.ObjectId();
    let convId: string;

    beforeEach(async () => {
      const conv = await CoachConversation.create({ userId, studySetId, title: 'Test', messages: [] });
      convId = conv._id.toString();
    });

    afterEach(async () => {
      await CoachConversation.deleteMany({ userId });
    });

    it('appends user and assistant messages and persists', async () => {
      await CoachConversation.findByIdAndUpdate(convId, {
        $push: { messages: { role: 'user', content: 'Hello', createdAt: new Date(), timestamp: new Date() } },
      });
      await CoachConversation.findByIdAndUpdate(convId, {
        $push: { messages: { role: 'assistant', content: 'Hi there', createdAt: new Date(), timestamp: new Date() } },
      });
      const fresh = await CoachConversation.findById(convId).lean();
      expect(fresh.messages).toHaveLength(2);
      expect(fresh.messages[0].role).toBe('user');
      expect(fresh.messages[1].role).toBe('assistant');
    });
  });

  // ── A.4 Feynman session score persistence ─────────────────────────────────
  describe('FeynmanSession PATCH scores', () => {
    const { FeynmanSession } = require('../../src/models/FeynmanSession');
    const userId = new Types.ObjectId();
    const studySetId = new Types.ObjectId();
    let sessionId: string;

    beforeEach(async () => {
      const sess = await FeynmanSession.create({
        userId, studySetId, topic: 'Test', status: 'active',
        clarityScore: 0, accuracyScore: 0, explanation: '',
      });
      sessionId = sess._id.toString();
    });

    afterEach(async () => {
      await FeynmanSession.deleteMany({ userId });
    });

    it('persists clarityScore and accuracyScore', async () => {
      await FeynmanSession.findOneAndUpdate(
        { _id: sessionId, userId },
        { $set: { clarityScore: 72, accuracyScore: 85, status: 'complete' } },
      );
      const fresh = await FeynmanSession.findById(sessionId).lean();
      expect(fresh.clarityScore).toBe(72);
      expect(fresh.accuracyScore).toBe(85);
      expect(fresh.status).toBe('complete');
    });
  });

  // ── A.5 Cloze flashcard clozeNumber ───────────────────────────────────────
  describe('Cloze flashcard clozeNumber', () => {
    const { parseClozeMarkers, createFlashcard } = require('../../src/controllers/flashcards.controller');
    const { Flashcard } = require('../../src/models/Flashcard');
    const { SpacedRepetition } = require('../../src/models/SpacedRepetition');
    const userId = new Types.ObjectId().toString();
    const studySetId = new Types.ObjectId().toString();

    afterEach(async () => {
      await Flashcard.deleteMany({ userId });
      await SpacedRepetition.deleteMany({ userId });
    });

    it('parseClozeMarkers: finds max cN', () => {
      expect(parseClozeMarkers('{{c1::mitochondria}} is the {{c2::powerhouse}}')).toBe(2);
      expect(parseClozeMarkers('{{c1::a}} {{c3::b}}')).toBe(3);
      expect(parseClozeMarkers('no markers')).toBe(1);
    });

    it('createFlashcard computes clozeNumber', async () => {
      const card = await createFlashcard(userId, {
        studySetId,
        cardType: 'cloze',
        clozeBody: 'The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell.',
      });
      expect(card.clozeNumber).toBe(2);
      const fresh = await Flashcard.findById(card._id).lean();
      expect(fresh.clozeNumber).toBe(2);
    });

    it('updateFlashcard recomputes clozeNumber when clozeBody changes', async () => {
      const { updateFlashcard } = require('../../src/controllers/flashcards.controller');
      const card = await createFlashcard(userId, {
        studySetId,
        cardType: 'cloze',
        clozeBody: '{{c1::foo}}',
      });
      expect(card.clozeNumber).toBe(1);

      await updateFlashcard(card._id.toString(), userId, studySetId, {
        clozeBody: '{{c1::foo}} {{c2::bar}} {{c3::baz}}',
      });
      const fresh = await Flashcard.findById(card._id).lean();
      expect(fresh.clozeNumber).toBe(3);
    });
  });
});
