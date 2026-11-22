// Words -> two cards (recognise: word -> meaning; recall: meaning -> word), graded with ts-fsrs.
// The recall card opens only after the recognise card's first review and never on the same day.
import { dayKey, dayRecord } from "./store.js";

let scheduler = null;
/** Loads the bundled ts-fsrs (global FSRS from vendor/ts-fsrs-6.0.0.umd.js). */
export async function initScheduler(retention = 0.9) {
  if (!globalThis.FSRS) throw new Error("ts-fsrs not loaded");
  scheduler = await globalThis.FSRS.DefaultScheduler({ desiredRetention: retention });
  return scheduler;
}
export const getScheduler = () => scheduler;
export const GRADES = [1, 2, 3, 4]; // Again, Hard, Good, Easy (FSRS.Rating)

/** Saved cards hold ISO strings; ts-fsrs needs Date objects back. */
export function revive(c) {
  return { ...c, dueAt: new Date(c.dueAt), lastReviewAt: c.lastReviewAt ? new Date(c.lastReviewAt) : null };
}
const serial = (c) => JSON.parse(JSON.stringify(c));
export const cardId = (wordId, dir) => `${wordId}|${dir}`;
export const langOf = (wordId) => wordId.slice(0, 2);

export function addWord(st, wordId, now = new Date()) {
  const id = cardId(wordId, "recog");
  if (st.cards[id]) return false;
  st.cards[id] = { wordId, dir: "recog", fsrs: serial(scheduler.newCard({ now })), createdAt: now.toISOString() };
  return true;
}

/** Marks a word as already known: it leaves the new-word queue and counts as remembered. */
export function markKnown(st, wordId) { st.known[wordId] = true; delete st.cards[cardId(wordId, "recog")]; delete st.cards[cardId(wordId, "recall")]; }

function startOfNextDay(now) { const d = new Date(now); d.setHours(24, 0, 0, 0); return d; }

/** Grades a card, logs it (with answer time), and unlocks the recall card after the first recognise review. */
export function grade(st, id, g, now = new Date(), ms = 0) {
  const c = st.cards[id];
  const first = c.fsrs.reps === 0;
  const r = scheduler.review({ card: revive(c.fsrs), grade: g, now });
  c.fsrs = serial(r.card);
  st.log.push({ cardId: id, at: now.toISOString(), grade: g, ms: Math.max(0, Math.round(ms)) });
  const day = dayRecord(st, dayKey(now));
  day.reviews++; day.ms += Math.max(0, Math.round(ms)); if (first) day.newCards++;
  if (first && c.dir === "recog") {
    day.newWords = day.newWords || {};
    const l = langOf(c.wordId);
    day.newWords[l] = (day.newWords[l] || 0) + 1;
  }
  if (c.dir === "recog" && first) {
    const rid = cardId(c.wordId, "recall");
    if (!st.cards[rid]) {
      const nc = scheduler.newCard({ now: startOfNextDay(now) });
      st.cards[rid] = { wordId: c.wordId, dir: "recall", fsrs: serial(nc), createdAt: now.toISOString() };
    }
  }
  return c;
}

/**
 * Easy Days (as in Anki): after a review with an interval of 3+ days, move the due date by at most one day
 * to the neighbour day with the lightest load (cards due / study minutes). Never onto a rest day; ties keep
 * the original day. Total work stays the same: it only moves. Returns the shift in days (-1, 0, 1).
 */
export function applyEasyDays(st, id, minutesOf) {
  const c = st.cards[id];
  if (!c || (c.fsrs.scheduledDays || 0) < 3) return 0;
  const due = new Date(c.fsrs.dueAt);
  const keyOf = (d) => dayKey(d);
  const load = {};
  for (const [oid, o] of Object.entries(st.cards)) {
    if (oid === id || o.fsrs.reps === 0) continue;
    const k = keyOf(new Date(o.fsrs.dueAt)); load[k] = (load[k] || 0) + 1;
  }
  let best = 0, bestScore = Infinity;
  for (const shift of [0, -1, 1]) {
    const d = new Date(due); d.setDate(d.getDate() + shift);
    const mins = minutesOf(d);
    if (mins <= 0) continue;
    const score = ((load[keyOf(d)] || 0) + 1) / mins;
    if (score < bestScore - 1e-9) { best = shift; bestScore = score; }
  }
  if (best) { due.setDate(due.getDate() + best); c.fsrs.dueAt = due.toISOString(); }
  return best;
}

/** Interval preview for the four buttons (human text). */
export function previewLabels(st, id, now = new Date()) {
  const card = revive(st.cards[id].fsrs);
  return GRADES.map((g) => {
    const due = scheduler.review({ card, grade: g, now }).card.dueAt;
    return humanDelay(due - now);
  });
}
export function humanDelay(ms) {
  const m = ms / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))} phút`;
  if (m < 60 * 24) return `${Math.round(m / 60)} giờ`;
  const d = m / 1440;
  if (d < 31) return `${Math.round(d)} ngày`;
  if (d < 365) return `${Math.round(d / 30)} tháng`;
  return `${(d / 365).toFixed(1)} năm`;
}

/** Started cards due now, most overdue (relative to their interval) first. */
export function dueCards(st, now = new Date(), lang = null) {
  const t = now.getTime();
  return Object.entries(st.cards)
    .filter(([, c]) => c.fsrs.reps > 0 && new Date(c.fsrs.dueAt).getTime() <= t && (!lang || langOf(c.wordId) === lang))
    .map(([id, c]) => {
      const due = new Date(c.fsrs.dueAt).getTime();
      const span = Math.max(1 / 1440, c.fsrs.scheduledDays || 0) * 86400000;
      return { id, over: (t - due) / span };
    })
    .sort((a, b) => b.over - a.over)
    .map((x) => x.id);
}
/** Cards added but never reviewed, oldest first (new recall cards only once their unlock time came). */
export function newCards(st, now = new Date(), lang = null) {
  const t = now.getTime();
  return Object.entries(st.cards)
    .filter(([, c]) => c.fsrs.reps === 0 && new Date(c.fsrs.dueAt).getTime() <= t && (!lang || langOf(c.wordId) === lang))
    .sort((a, b) => (a[1].createdAt < b[1].createdAt ? -1 : 1))
    .map(([id]) => id);
}

/** Learning / relearning cards due later today (short steps such as "1 minute"): studied ahead at the end. */
export function learningLaterToday(st, now = new Date()) {
  const end = new Date(now); end.setHours(24, 0, 0, 0);
  return Object.entries(st.cards)
    .filter(([, c]) => c.fsrs.reps > 0 && (c.fsrs.state === 1 || c.fsrs.state === 3))
    .map(([id, c]) => [id, new Date(c.fsrs.dueAt).getTime()])
    .filter(([, t]) => t > now.getTime() && t < end.getTime())
    .sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/** Everything still to do today: due reviews, unlocked new cards, then learning steps later today. */
export function todayQueue(st, now = new Date()) {
  return [...dueCards(st, now), ...newCards(st, now), ...learningLaterToday(st, now)];
}

/** Probability of recall now (ts-fsrs forgetting curve). */
export function recall(c, now = new Date()) {
  if (!c.fsrs.lastReviewAt) return 0;
  const days = (now - new Date(c.fsrs.lastReviewAt)) / 86400000;
  const f = c.fsrs;
  return scheduler.model.forgettingCurve({ stability: f.stability, stabilityFast: f.stabilityFast, difficulty: f.difficulty }, days);
}

/** "Remembered" = marked known, or both cards in Review state with recall >= 0.9. */
export function isRemembered(st, wordId, now = new Date()) {
  if (st.known[wordId]) return true;
  const a = st.cards[cardId(wordId, "recog")], b = st.cards[cardId(wordId, "recall")];
  if (!a || !b) return false;
  return [a, b].every((c) => c.fsrs.state === 2 && recall(c, now) >= 0.9);
}
export const isSeen = (st, wordId) => !!(st.known[wordId] || st.cards[cardId(wordId, "recog")]);

/** Median answer time in seconds over the last `n` reviews, or null before 3 study days. */
export function measuredSecPerReview(st, n = 200) {
  const days = new Set(st.log.map((l) => l.at.slice(0, 10)));
  if (days.size < 3) return null;
  const xs = st.log.slice(-n).map((l) => l.ms).filter((x) => x > 0 && x < 120000).sort((a, b) => a - b);
  if (!xs.length) return null;
  return xs[Math.floor(xs.length / 2)] / 1000;
}
