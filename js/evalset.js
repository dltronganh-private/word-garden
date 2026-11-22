// Feedback test set: pick cases, grade results by machine (no need to read the language), sum up, estimate cost.
// Measured price: one feedback (3 runs) with the default model cost about 3.6 US cents on a one-sentence text.
import { MODELS, DEFAULT_MODEL } from "./api.js";
import { norm } from "./feedback.js";

export const MEASURED_CENTS = 3.6; // measured with DEFAULT_MODEL
export const THRESHOLDS = { falseAlarmMax: 0.1, catchMin: 0.7 };

/** Estimated US cents for `n` cases (3 runs each) with `model`, scaled from the price measured on the default model. */
export function estimateCents(n, model) {
  const o = MODELS[DEFAULT_MODEL], m = MODELS[model] || o;
  return n * MEASURED_CENTS * (m.outUsd / o.outUsd);
}

/** First `perLang` cases of each chosen language, errors and correct ones mixed in the set's proportion (25:15). */
export function pickCases(all, langs, perLang) {
  const out = [];
  for (const l of langs) {
    const e = all.filter((c) => c.lang === l && !c.ok), k = all.filter((c) => c.lang === l && c.ok);
    const nE = Math.round((perLang * e.length) / (e.length + k.length));
    out.push(...e.slice(0, nE), ...k.slice(0, perLang - nE));
  }
  return out;
}

const squash = (s, lang) => (lang === "ko" ? norm(s) : norm(s).replace(/\s+/g, ""));

/** Applies kept edits to the text (first occurrence each), for the exact-match check. */
export function applyEdits(text, edits) {
  let t = text;
  for (const e of edits) { const i = t.indexOf(e.original); if (i >= 0) t = t.slice(0, i) + e.corrected + t.slice(i + e.original.length); }
  return t;
}

/** Grades one case against a merged feedback result ({kept, allCorrect}). */
export function gradeCase(c, r) {
  if (!r) return { id: c.id, lang: c.lang, ok: c.ok, failed: true };
  const errors = r.kept.filter((e) => e.level === "error");
  if (c.ok) return { id: c.id, lang: c.lang, ok: true, falseAlarm: errors.length > 0, anyEdit: r.kept.length > 0 };
  const hits = r.kept.some((e) => {
    const i = c.text.indexOf(e.original);
    return i >= 0 && i < c.errAt + c.errLen && i + e.original.length > c.errAt;
  });
  return { id: c.id, lang: c.lang, ok: false, caught: hits, exact: squash(applyEdits(c.text, r.kept), c.lang) === squash(c.ref, c.lang) };
}

/** Three separate numbers per language: false alarms on correct sentences, catches and exact fixes on wrong ones. */
export function summarize(grades) {
  const by = {};
  for (const g of grades) {
    const s = (by[g.lang] = by[g.lang] || { correct: 0, falseAlarm: 0, wrong: 0, caught: 0, exact: 0, failed: 0 });
    if (g.failed) { s.failed++; continue; }
    if (g.ok) { s.correct++; if (g.falseAlarm) s.falseAlarm++; } else { s.wrong++; if (g.caught) s.caught++; if (g.exact) s.exact++; }
  }
  for (const s of Object.values(by)) {
    s.falseAlarmRate = s.correct ? s.falseAlarm / s.correct : null;
    s.catchRate = s.wrong ? s.caught / s.wrong : null;
    s.exactRate = s.wrong ? s.exact / s.wrong : null;
    s.pass = s.falseAlarmRate !== null && s.catchRate !== null && s.falseAlarmRate <= THRESHOLDS.falseAlarmMax && s.catchRate >= THRESHOLDS.catchMin;
  }
  return by;
}
