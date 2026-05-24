import { addDays } from 'date-fns';

export interface SM2State {
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueAt: Date;
  lastReviewedAt: Date;
}

export function applySM2(card: SM2State, quality: 1 | 2 | 3 | 4): SM2State {
  if (quality === 1) {
    return { ...card, repetitions: 0, interval: 1, dueAt: addDays(new Date(), 1), lastReviewedAt: new Date() };
  }
  const newEase = Math.max(1.3, card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  let interval: number;
  if (card.repetitions === 0) interval = 1;
  else if (card.repetitions === 1) interval = 6;
  else interval = Math.round(card.interval * newEase);
  return {
    ...card,
    easeFactor: newEase,
    interval,
    repetitions: card.repetitions + 1,
    dueAt: addDays(new Date(), interval),
    lastReviewedAt: new Date(),
  };
}
