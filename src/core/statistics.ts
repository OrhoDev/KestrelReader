import { db } from './db';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordReading(words: number, seconds: number): Promise<void> {
  if (words <= 0 && seconds <= 0) return;

  const date = todayKey();
  const existing = await db.statistics.get(date);
  await db.statistics.put({
    id: date,
    date,
    wordsRead: (existing?.wordsRead ?? 0) + words,
    secondsRead: (existing?.secondsRead ?? 0) + seconds,
  });
}

export interface ReadingStatsSummary {
  wordsToday: number;
  wordsWeek: number;
  secondsToday: number;
  streakDays: number;
}

export async function getReadingStatsSummary(): Promise<ReadingStatsSummary> {
  const all = await db.statistics.orderBy('date').toArray();
  const today = todayKey();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekStart = weekAgo.toISOString().slice(0, 10);

  let wordsToday = 0;
  let secondsToday = 0;
  let wordsWeek = 0;

  for (const row of all) {
    if (row.date === today) {
      wordsToday = row.wordsRead;
      secondsToday = row.secondsRead;
    }
    if (row.date >= weekStart) {
      wordsWeek += row.wordsRead;
    }
  }

  const streakDays = computeStreak(all);
  return { wordsToday, wordsWeek, secondsToday, streakDays };
}

function computeStreak(rows: { date: string; wordsRead: number }[]): number {
  const activeDates = new Set(
    rows.filter((r) => r.wordsRead > 0).map((r) => r.date),
  );
  if (activeDates.size === 0) return 0;

  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (activeDates.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    } else {
      break;
    }
  }
  return streak;
}

export function formatReadingTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}
