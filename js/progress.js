// Joins cards + planner: today's plan, remembered counts, daily snapshots, forecasts and warnings.
import { LANGS, dayKey } from "./store.js";
import { dueCards, isRemembered, isSeen, measuredSecPerReview, langOf } from "./cards.js";
import { planRates, planToday, feasibility, forecast, weeklyRatesFrom, lateAdvice, studyDaysBetween, minutesPerWordPerDay } from "./planner.js";

/** Remembered / seen word counts per language (pack words + the learner's own words). */
export function counts(st, packs, now = new Date()) {
  const out = {};
  for (const l of LANGS) {
    const ids = [...packs[l].words.map((w) => w.id), ...Object.keys(st.custom).filter((id) => langOf(id) === l), ...Object.keys(st.known).filter((id) => langOf(id) === l)];
    const uniq = [...new Set(ids)];
    out[l] = { remembered: uniq.filter((id) => isRemembered(st, id, now)).length, seen: uniq.filter((id) => isSeen(st, id)).length };
  }
  return out;
}

/** Seconds per review: measured median after 3 study days, else the setting (default 12). */
export const secPerReview = (st) => measuredSecPerReview(st) || st.settings.secPerReview;

/** One snapshot per day of remembered counts, for the weekly-rate history. */
export function snapshot(st, c, now = new Date()) {
  st.snaps = st.snaps || [];
  const k = dayKey(now);
  const row = { date: k, counts: Object.fromEntries(LANGS.map((l) => [l, c[l].remembered])) };
  const last = st.snaps[st.snaps.length - 1];
  if (last && last.date === k) st.snaps[st.snaps.length - 1] = row; else st.snaps.push(row);
}

export function todayPlan(st, packs, now = new Date()) {
  // A language whose word pack is not imported yet takes no share of today's new words.
  const s = { ...st.settings, langs: Object.fromEntries(LANGS.map((l) => [l, { ...st.settings.langs[l], on: st.settings.langs[l].on && !packs[l].meta.missing }])) };
  const c = counts(st, packs, now);
  const remaining = Object.fromEntries(LANGS.map((l) => [l, Math.max(0, s.langs[l].target - c[l].remembered)]));
  const rates = planRates(s, remaining, now);
  const sec = secPerReview(st);
  const due = dueCards(st, now);
  const plan = planToday({ settings: s, date: now, dueCount: due.length, sec, rates });
  const done = (st.days[dayKey(now)] || {}).newWords || {};
  const left = Object.fromEntries(Object.keys(plan.perLang).map((l) => [l, Math.max(0, plan.perLang[l] - (done[l] || 0))]));
  return { counts: c, remaining, rates, sec, due, plan, newLeft: left, feas: feasibility(s, rates, sec) };
}

/** Forecast + late advice per language switched on. */
export function forecasts(st, p, now = new Date()) {
  const s = st.settings;
  const studyDays = s.minutes.filter((m) => m > 0).length || 1;
  // Achievable words a week before any history: the card minutes, handed out in priority order.
  let capacity = (p.feas.cardMinutes * 7) / minutesPerWordPerDay(p.sec);
  const achievable = {};
  for (const l of s.priority) {
    if (!(l in p.rates)) continue;
    achievable[l] = Math.min(p.rates[l] * studyDays, Math.max(0, capacity));
    capacity -= achievable[l];
  }
  const out = {};
  for (const l of Object.keys(p.rates)) {
    const snaps = (st.snaps || []).map((x) => ({ date: x.date, count: x.counts[l] || 0 }));
    const weekly = weeklyRatesFrom(snaps, now);
    const f = forecast({ remaining: p.remaining[l], weeklyRates: weekly, planWeekly: achievable[l], today: now, seed: 7 });
    const rate = weekly.length >= 3 ? weekly.reduce((a, b) => a + b, 0) / weekly.length : achievable[l];
    out[l] = { ...f, advice: lateAdvice({ lang: l, p80: f.p80, deadline: s.langs[l].deadline, graceDays: s.graceDays, remaining: p.remaining[l], weeklyRate: rate, settings: s }),
      studyDaysLeft: studyDaysBetween(s, now, new Date(s.langs[l].deadline)) };
  }
  return out;
}
