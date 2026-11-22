// Vietnamese meanings for the Japanese word list, by AI, in batches. Results are labelled "AI dịch" in the app.
// Progress is kept in the browser so a stopped run continues where it left off.
import { callClaude, costUsd } from "./api.js";

export const BATCH = 100;
export const PROGRESS_KEY = "ahnn.tr.ja";
export const TR_SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["i", "vi"],
    properties: { i: { type: "integer" }, vi: { type: "string" } } } } },
};
export const TR_SYSTEM = `You write short Vietnamese dictionary glosses for Japanese words, for a Vietnamese learner.
Each input line is: number, the word (kanji or kana), its reading, and its English meaning.
For every line return {"i": number, "vi": gloss}. The gloss: 1-3 common senses in natural Vietnamese, separated by "; ",
at most 60 characters, no explanation, no romanization, no Japanese. Base the senses on the English meaning and the word itself.
Return one item for every input line, in any order.`;

export function batches(words, size = BATCH) {
  const out = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
}

export function buildUser(batch) {
  return batch.map((w, i) => `${i}\t${w.kanji || w.kana}\t${w.kana}\t${w.en}`).join("\n");
}

/** Maps the model's answer back to word ids; ignores numbers out of range and empty glosses. */
export function mergeBatch(batch, json, done) {
  let n = 0;
  for (const it of json.items || []) {
    const w = batch[it.i];
    const vi = String(it.vi || "").trim().slice(0, 80);
    if (w && vi && !done[w.id]) { done[w.id] = vi; n++; }
  }
  return n;
}

/** Projected total USD after some batches, from the cost so far. */
export function projectUsd(spentUsd, batchesDone, batchesTotal) {
  return batchesDone ? (spentUsd / batchesDone) * batchesTotal : null;
}

/** Runs one batch. */
export async function translateBatch({ key, model, batch, fetchImpl }) {
  const r = await callClaude({ key, model, system: TR_SYSTEM, user: buildUser(batch), schema: TR_SCHEMA, effort: "low", maxTokens: 16000 }, fetchImpl);
  return { json: r.json, usage: r.usage, cost: costUsd(model, r.usage) };
}
