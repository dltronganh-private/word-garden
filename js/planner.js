// Weekly planner: how many new words today, per language; finish-date forecast; early warning.
// Pure functions (dates and counts in, numbers out) so they can be tested with fake data.
export const DAY_MS = 86400000;
// Rule of thumb from the Anki manual: in steady state one new card a day ~ 10 reviews a day.
export const REVIEWS_PER_NEW = 10;
// First-time learning of a card, seconds (FSRS simulator defaults are about 11-20 s).
export const LEARN_SEC = 20;

const atMidnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const daysBetween = (a, b) => Math.round((atMidnight(b) - atMidnight(a)) / DAY_MS);
export const addDays = (d, n) => { const x = atMidnight(d); x.setDate(x.getDate() + n); return x; };

export function minutesOn(settings, date) { return settings.minutes[new Date(date).getDay()] || 0; }
export function avgMinutesPerDay(settings) { return settings.minutes.reduce((a, b) => a + b, 0) / 7; }

/** Study days (minutes > 0) from `from` (inclusive) to `to` (inclusive). */
export function studyDaysBetween(settings, from, to) {
  let n = 0;
  for (let d = atMidnight(from); d <= atMidnight(to); d = addDays(d, 1)) if (minutesOn(settings, d) > 0) n++;
  return n;
}

/** Steady daily minutes one new word a day costs (two directions share the 1:10 rule as in the design: one direction). */
export function minutesPerWordPerDay(sec) { return (REVIEWS_PER_NEW * sec + LEARN_SEC) / 60; }

/**
 * Plan rate per language: words still to learn / study days left before the deadline.
 * remaining: {zh: n, ...}; returns {zh: wordsPerStudyDay, ...} for languages switched on.
 */
export function planRates(settings, remaining, today) {
  const out = {};
  for (const [lang, cfg] of Object.entries(settings.langs)) {
    if (!cfg.on) continue;
    const days = Math.max(1, studyDaysBetween(settings, today, new Date(cfg.deadline)));
    out[lang] = Math.max(0, remaining[lang] || 0) / days;
  }
  return out;
}

/** Does the plan fit the week? Compares the steady card load with the minutes set aside for cards. */
export function feasibility(settings, rates, sec) {
  const studyDays = settings.minutes.filter((m) => m > 0).length || 1;
  const perDayAvg = (rate) => rate * studyDays / 7;
  const need = Object.values(rates).reduce((s, r) => s + perDayAvg(r) * minutesPerWordPerDay(sec), 0);
  const cardMinutes = avgMinutesPerDay(settings) * settings.cardShare;
  return { needMinutes: need, cardMinutes, allMinutes: avgMinutesPerDay(settings), fits: need <= cardMinutes };
}

/**
 * New words allowed today. Missed days are not carried over: the cap is the plan rate for one day.
 * dueCount = started cards due today (reviews). Returns { total, perLang, reviewMinutes, cardMinutes, blocked }.
 */
export function planToday({ settings, date, dueCount, sec, rates }) {
  const cardMinutes = minutesOn(settings, date) * settings.cardShare;
  const reviewMinutes = (dueCount * sec) / 60;
  const perLang = {};
  Object.keys(rates).forEach((l) => { perLang[l] = 0; });
  if (cardMinutes <= 0) return { total: 0, perLang, reviewMinutes, cardMinutes, blocked: "rest" };
  if (reviewMinutes >= cardMinutes) return { total: 0, perLang, reviewMinutes, cardMinutes, blocked: "overdue" };
  const byTime = Math.floor((cardMinutes - reviewMinutes) / minutesPerWordPerDay(sec));
  // Share today's capacity by plan rate; long days get proportionally more than short days.
  const weekMinutes = settings.minutes.reduce((a, b) => a + b, 0) || 1;
  const dayShare = (minutesOn(settings, date) * 7) / weekMinutes;
  const want = {};
  let wantTotal = 0;
  for (const [l, r] of Object.entries(rates)) { want[l] = Math.ceil(r * dayShare); wantTotal += want[l]; }
  const total = Math.min(byTime, wantTotal);
  let left = total;
  // Fill by priority order so the first language never starves when time is short.
  for (const l of settings.priority) {
    if (!(l in want)) continue;
    const share = wantTotal ? Math.floor((total * want[l]) / wantTotal) : 0;
    perLang[l] = Math.min(want[l], share);
    left -= perLang[l];
  }
  for (const l of settings.priority) {
    if (left <= 0) break;
    if (!(l in want)) continue;
    const extra = Math.min(left, want[l] - perLang[l]);
    perLang[l] += extra; left -= extra;
  }
  return { total: total - left, perLang, reviewMinutes, cardMinutes, blocked: null };
}

/** Small seeded RNG (mulberry32) so forecasts are stable between reloads and testable. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Finish-date forecast for one language (Evidence-Based Scheduling): replay past weekly rates at random,
 * 100 times, until the remaining words are done. With fewer than 3 weeks of history, uses the plan rate.
 * Returns { p50, p80 (Dates), initial: bool }.
 */
export function forecast({ remaining, weeklyRates, planWeekly, today, runs = 100, seed = 1 }) {
  const hist = weeklyRates.filter((x) => x >= 0);
  const initial = hist.length < 3;
  if (remaining <= 0) return { p50: atMidnight(today), p80: atMidnight(today), initial };
  const pool = initial ? [planWeekly] : hist;
  if (!pool.some((x) => x > 0)) return { p50: null, p80: null, initial };
  const rand = rng(seed);
  const weeks = [];
  for (let i = 0; i < runs; i++) {
    let left = remaining, w = 0;
    while (left > 0 && w < 520) { left -= pool[Math.floor(rand() * pool.length)]; w++; }
    weeks.push(w);
  }
  weeks.sort((a, b) => a - b);
  const at = (q) => addDays(today, weeks[Math.min(runs - 1, Math.floor(q * runs))] * 7);
  return { p50: at(0.5), p80: at(0.8), initial };
}

/** Words per week that became "remembered", from a list of {date, count} day snapshots (oldest first). */
export function weeklyRatesFrom(snapshots, today) {
  const out = [];
  for (let w = 1; w <= 26; w++) {
    const end = addDays(today, -7 * (w - 1)), start = addDays(today, -7 * w);
    const a = [...snapshots].reverse().find((s) => new Date(s.date) <= start);
    const b = [...snapshots].reverse().find((s) => new Date(s.date) <= end);
    if (!a || !b) break;
    out.push(Math.max(0, b.count - a.count));
  }
  return out.reverse();
}

/**
 * Warning when the 80 % date is later than deadline + grace. Suggests cutting words from the lowest-priority
 * languages first (never the first one), or adding minutes per week.
 */
export function lateAdvice({ lang, p80, deadline, graceDays, remaining, weeklyRate, settings }) {
  // No date at all means no time is left for this language: that is the latest possible case.
  const limit = addDays(new Date(deadline), graceDays);
  if (p80 && p80 <= limit) return null;
  const weeksLeft = Math.max(0.1, daysBetween(new Date(), limit) / 7);
  const cutWords = Math.max(0, Math.ceil(remaining - weeklyRate * weeksLeft));
  const sec = settings.secPerReview;
  const extraWordsPerWeek = remaining / weeksLeft - weeklyRate;
  // k extra words a week = k/7 a day; each costs minutesPerWordPerDay daily, over 7 days, and cards are
  // only `cardShare` of a session, so the session time grows by that factor.
  const extraMinutesPerWeek = Math.ceil((Math.max(0, extraWordsPerWeek) * minutesPerWordPerDay(sec)) / settings.cardShare);
  return { lang, limit, cutWords, extraMinutesPerWeek, canCut: settings.priority[0] !== lang };
}
