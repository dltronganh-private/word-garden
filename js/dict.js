// Built-in dictionary: data/dict/<lang>/<NNN>.json shards (only the shard needed is downloaded, then kept in memory).
// zh: CVDICT (Vietnamese); ja: JMdict common words (English, or the app's AI Vietnamese marked "ai"); ko: KRDict (Vietnamese).
// When a word is missing, the learner can ask the AI (a few cents, shown on the button).
import { callClaude, costUsd } from "./api.js";

export const SHARDS = 256;
const cache = new Map();
// Same rule as the build script: the first UTF-16 code unit, not the full code point.
export const shardOf = (word) => String(word.charCodeAt(0) % SHARDS).padStart(3, "0");

async function loadShard(lang, n, fetchJSON) {
  const key = `${lang}/${n}`;
  if (!cache.has(key)) cache.set(key, fetchJSON(`data/dict/${lang}/${n}.json`).catch(() => ({})));
  return cache.get(key);
}
const defaultFetch = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); };

/**
 * Looks a word up. For Japanese and Korean an inflected form may be missing, so shorter prefixes are tried
 * (longest first). Returns { head, senses: [{reading, gloss, extra}] } or null.
 */
export async function lookup(lang, word, fetchJSON = defaultFetch) {
  const w = String(word || "").trim();
  if (!w) return null;
  const prefixes = lang === "zh" ? [w] : Array.from({ length: Math.min(w.length, 8) }, (_, i) => w.slice(0, w.length - i));
  // Simple de-inflection: a stem plus a dictionary ending (Japanese verbs / adjectives, Korean -da), tried right after the stem itself.
  const ENDINGS = { zh: [], ja: ["る", "う", "い", "く", "す", "む", "つ"], ko: ["다"] };
  const tries = prefixes.flatMap((p) => [p, ...ENDINGS[lang].map((e) => p + e)]);
  for (const t of tries) {
    const shard = await loadShard(lang, shardOf(t), fetchJSON);
    const hit = shard[t];
    if (hit) return { head: t, senses: hit.map(([reading, gloss, extra]) => ({ reading: lang === "zh" ? pinyinMarks(reading) : reading, gloss, extra })) };
  }
  return null;
}

/** "yin2 hang2" -> "yín háng" (tone numbers to tone marks; v / u: -> ü). */
export function pinyinMarks(s) {
  const MARKS = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", "ü": "ǖǘǚǜ" };
  return String(s || "").split(" ").map((syl) => {
    const m = syl.match(/^([a-zA-Zü:]+?)([1-5])$/);
    if (!m) return syl.replace(/u:|v/g, "ü");
    let base = m[1].replace(/u:|v/g, "ü"); const tone = Number(m[2]);
    if (tone === 5) return base;
    const lower = base.toLowerCase();
    let i = lower.indexOf("a"); if (i < 0) i = lower.indexOf("e");
    if (i < 0) i = lower.indexOf("ou");
    if (i < 0) { for (let k = lower.length - 1; k >= 0; k--) if ("iouü".includes(lower[k])) { i = k; break; } }
    if (i < 0) return base;
    const ch = lower[i], mark = MARKS[ch][tone - 1];
    return base.slice(0, i) + (base[i] === ch ? mark : mark.toUpperCase()) + base.slice(i + 1);
  }).join(" ");
}

const NAME = { zh: "Mandarin Chinese", ja: "Japanese", ko: "Korean" };
export const ASK_SCHEMA = {
  type: "object", additionalProperties: false, required: ["reading", "meaningVi", "noteVi"],
  properties: { reading: { type: "string" }, meaningVi: { type: "string" }, noteVi: { type: "string" } },
};
/** About one US cent per question with the default model (short prompt, short answer) [estimate, not measured]. */
export const ASK_CENTS = 1;

/** Asks the AI for the meaning of a word that is not in the dictionary. Returns { reading, meaningVi, noteVi, costUsd }. */
export async function askAI({ key, model, lang, word, context, fetchImpl }) {
  const r = await callClaude({ key, model, effort: "low", maxTokens: 2000, schema: ASK_SCHEMA,
    system: `You explain one ${NAME[lang]} word to a Vietnamese learner. Give its reading (pinyin with tone marks / kana / hangul),
a short Vietnamese meaning (1-3 senses, at most 60 characters), and one short Vietnamese note on usage (or an empty string).
If the word does not exist or you are unsure, say so in noteVi instead of guessing.`,
    user: `<word>${word}</word>${context ? `\n<sentence>${context}</sentence>` : ""}` }, fetchImpl);
  return { ...r.json, costUsd: costUsd(model, r.usage) };
}
