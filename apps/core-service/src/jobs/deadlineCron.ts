import { Deadline } from '../models/Deadline';

const HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * HOUR_MS;

const INTERVAL_MS = Number(process.env.DEADLINE_CRON_INTERVAL_MS ?? HOUR_MS);

export async function runDeadlineCronOnce(now: Date = new Date()): Promise<{
  marked: number;
  reminded: number;
}> {
  // Auto-passedAt: mark anything past its date that hasn't already been marked.
  const passedRes = await Deadline.updateMany(
    { date: { $lt: now }, passedAt: null },
    { $set: { passedAt: now } },
  );
  const marked = passedRes.modifiedCount ?? 0;

  // Reminder pass: for each non-passed deadline, if today's date is one of the
  // notifyDaysBefore offsets and we haven't reminded today (and not snoozed),
  // stamp remindedAt = now. Now Brief reads this stamp + the offset list and
  // surfaces reminders on next login.
  const dueForReminder = await Deadline.find({
    passedAt: null,
    $or: [{ snoozeUntil: null }, { snoozeUntil: { $lt: now } }],
  });

  let reminded = 0;
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);

  for (const d of dueForReminder) {
    const offsetsLeft = (d.notifyDaysBefore ?? []).slice().sort((a, b) => a - b);
    if (offsetsLeft.length === 0) continue;
    const daysUntil = Math.ceil((d.date.getTime() - startOfToday.getTime()) / ONE_DAY_MS);
    if (!offsetsLeft.includes(daysUntil)) continue;
    // Skip if we've already reminded within the past 23h.
    if (d.remindedAt && now.getTime() - d.remindedAt.getTime() < 23 * HOUR_MS) continue;
    d.remindedAt = now;
    await d.save();
    reminded += 1;
  }

  if (marked > 0 || reminded > 0) {
    // eslint-disable-next-line no-console
    console.log(`[deadlineCron] marked passed=${marked} reminded=${reminded}`);
  }
  return { marked, reminded };
}

let timer: NodeJS.Timeout | null = null;

export function startDeadlineCron(): void {
  if (timer) return;
  // Kick off once immediately so a freshly started process catches up.
  void runDeadlineCronOnce().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[deadlineCron] error:', err);
  });
  timer = setInterval(() => {
    void runDeadlineCronOnce().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[deadlineCron] error:', err);
    });
  }, INTERVAL_MS);
}

export function stopDeadlineCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
