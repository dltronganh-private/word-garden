// Attendance stamp: earned only when the day's due cards are cleared (real study, not opening the app).
// Rest days (0 planned minutes) never break the streak. The stamp art is hand-built SVG.
import { dayKey } from "./store.js";
import { addDays, minutesOn } from "./planner.js";

/** Call after each graded card: stamps the day once the due queue is empty and at least one card was done. */
export function checkStamp(st, dueLeft, now = new Date()) {
  const d = st.days[dayKey(now)];
  if (!d || d.stamp) return false;
  if (d.reviews > 0 && dueLeft === 0) { d.stamp = true; d.stampAt = now.toISOString(); return true; }
  return false;
}

/** Status of one day: "stamp" | "rest" | "missed" | "today" | "future" | "before" (before the app was first opened). */
export function dayStatus(st, settings, date, today = new Date()) {
  const k = dayKey(date), t = dayKey(today);
  const d = st.days[k];
  if (d && d.stamp) return "stamp";
  if (k > t) return "future";
  if (st.created && k < dayKey(new Date(st.created))) return "before";
  if (minutesOn(settings, date) === 0) return "rest";
  if (k === t) return "today";
  return "missed";
}

/** Stamped study days in a row, counting back from today; rest days are skipped, an unfinished today too. */
export function streak(st, settings, today = new Date()) {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const s = dayStatus(st, settings, addDays(today, -i), today);
    if (s === "stamp") n++;
    else if (s === "rest" || s === "today") continue;
    else break;
  }
  return n;
}

/** Monday-first week containing `date`. */
export function weekDays(date = new Date()) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(d, i - back));
}

const PAW = "M0 3.2c-1.9 0-3.4 1.2-3.4 2.6S-1.6 8 0 8s3.4-.8 3.4-2.2S1.9 3.2 0 3.2z" +
  "M-3.6-.4a1.3 1.6 0 1 0 0 3.2 1.3 1.6 0 1 0 0-3.2zM3.6-.4a1.3 1.6 0 1 0 0 3.2 1.3 1.6 0 1 0 0-3.2z" +
  "M-1.3-2.6a1.2 1.5 0 1 0 0 3 1.2 1.5 0 1 0 0-3zM1.3-2.6a1.2 1.5 0 1 0 0 3 1.2 1.5 0 1 0 0-3z";

/**
 * The stamp: a slightly tilted red seal with a cat face and the word "XONG".
 * `rot` varies per day so a row of stamps looks hand-pressed. Static markup, no user text inside.
 */
export function stampSVG(rot = -8, size = 120) {
  return `<svg class="stamp-svg" viewBox="-60 -60 120 120" width="${size}" height="${size}" role="img" aria-label="Con dấu: xong bài hôm nay">
  <g transform="rotate(${rot})" fill="none" stroke="var(--stamp)" stroke-linecap="round" stroke-linejoin="round">
    <circle r="54" stroke-width="5"/>
    <circle r="46" stroke-width="1.6" stroke-dasharray="3 3.5"/>
    <path d="M-24 -6 L-28 -30 L-10 -18 Q0 -22 10 -18 L28 -30 L24 -6 Q30 8 22 18 Q0 32 -22 18 Q-30 8 -24 -6Z" stroke-width="3.2"/>
    <path d="M-12 0 q3 -4 6 0 M6 0 q3 -4 6 0" stroke-width="3"/>
    <path d="M-3 9 q3 3 6 0 M0 6 v3" stroke-width="2.4"/>
    <path d="M-30 6 h-12 M-30 11 l-11 3 M30 6 h12 M30 11 l11 3" stroke-width="1.8"/>
    <circle cx="-16" cy="8" r="3" fill="var(--stamp)" stroke="none" opacity=".35"/>
    <circle cx="16" cy="8" r="3" fill="var(--stamp)" stroke="none" opacity=".35"/>
    <text y="42" text-anchor="middle" fill="var(--stamp)" stroke="none" font-size="13" font-weight="800" letter-spacing="3" font-family="system-ui, sans-serif">XONG</text>
  </g>
</svg>`;
}

/** Small paw mark for calendar cells. */
export function pawSVG(size = 26) {
  return `<svg viewBox="-6 -5 12 14" width="${size}" height="${size}" aria-hidden="true"><path d="${PAW}" fill="var(--stamp)"/></svg>`;
}
