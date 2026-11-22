// Writing feedback: one prompt per language, three parallel runs, keep the edits most runs agree on.
// Over-correction harms learners, so a lone edit from one run is hidden by default.
import { callClaude, ClaudeError } from "./api.js";

export const SCHEMA = {
  type: "object", additionalProperties: false, required: ["allCorrect", "edits", "praiseVi"],
  properties: {
    allCorrect: { type: "boolean" },
    praiseVi: { type: "string" },
    edits: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["original", "corrected", "level", "explanationVi", "confident"],
      properties: {
        original: { type: "string" }, corrected: { type: "string" },
        level: { type: "string", enum: ["error", "unnatural", "suggestion"] },
        explanationVi: { type: "string" }, confident: { type: "boolean" },
      } } },
  },
};

export const LEVEL_RANK = { suggestion: 0, unnatural: 1, error: 2 };
export const LEVEL_VI = { error: "Lỗi", unnatural: "Chưa tự nhiên", suggestion: "Gợi ý" };
const LANG = { zh: ["Mandarin Chinese (simplified characters)", "HSK 4-5"], ja: ["Japanese", "JLPT N4-N3"], ko: ["Korean", "TOPIK 1-2"] };

const ok = (praise) => JSON.stringify({ allCorrect: true, edits: [], praiseVi: praise });
const one = (o, c, level, why, confident = true) =>
  JSON.stringify({ allCorrect: false, edits: [{ original: o, corrected: c, level, explanationVi: why, confident }], praiseVi: "" });
const EXAMPLES = {
  zh: [
    ["我昨天去银行取钱了。", ok("Câu đúng và tự nhiên, dùng 了 rất chuẩn.")],
    ["我买了三书。", one("三书", "三本书", "error", "Thiếu lượng từ: số đếm + 本 + 书.")],
    ["我每天用公共汽车去学校。", one("用公共汽车", "坐公共汽车", "unnatural", "Đi xe buýt người Trung nói 坐, không nói 用.")],
    ["他差不多每天都来。", one("差不多", "几乎", "suggestion", "差不多 vẫn đúng; 几乎 trang trọng hơn một chút.", false)],
  ],
  ja: [
    ["昨日、友達と映画を見に行きました。", ok("Câu đúng, dùng ～に行く rất tự nhiên.")],
    ["駅に待っています。", one("駅に", "駅で", "error", "Nơi diễn ra hành động (đợi) dùng で, không dùng に.")],
    ["先生に本をあげました。", one("あげました", "差し上げました", "unnatural", "Tặng cho người trên nên dùng kính ngữ 差し上げる.")],
    ["雨が降ったら、試合は中止です。", one("降ったら", "降れば", "suggestion", "～たら vẫn đúng; ～ば nghe giống thông báo hơn.", false)],
  ],
  ko: [
    ["어제 친구와 같이 영화를 봤어요.", ok("Câu đúng, chia thì quá khứ 봤어요 chuẩn.")],
    ["저는 학교을 가요.", one("학교을", "학교에", "error", "Đi tới một nơi dùng trợ từ 에 (가다 + 에).")],
    ["선생님에게 물어봤어요.", one("선생님에게 물어봤어요", "선생님께 여쭤봤어요", "unnatural", "Hỏi người trên nên dùng kính ngữ 께 và 여쭤보다.")],
    ["주말에 많이 바빴어요.", one("많이", "아주", "suggestion", "많이 바빴어요 vẫn dùng được trong văn nói; 아주 trung tính hơn.", false)],
  ],
};

export function buildSystem(lang) {
  const [name, level] = LANG[lang];
  const ex = EXAMPLES[lang].map(([inp, out]) =>
    `  <example>\n    <learner_text>${inp}</learner_text>\n    <ideal_output>${out}</ideal_output>\n  </example>`).join("\n");
  return `You are a careful, friendly writing tutor for a Vietnamese adult learning ${name} (level about ${level}).
The learner writes 3-5 sentences in ${name} after reading a short text. Your feedback is shown in a learning app.

<goals>
- Find only real problems. Over-correction harms learning: if a sentence is already correct and natural, say so and leave it alone.
  Do not rewrite a correct sentence just to make it "better".
- Treat each change as one separate, minimal edit: the smallest span that must change, its replacement, and one short reason.
- Use exactly one of three levels for each edit:
  "error"      = grammatically wrong or wrong word for the meaning; a teacher would mark it.
  "unnatural"  = grammatical but a native speaker would not say it this way.
  "suggestion" = optional improvement; the original is acceptable.
- Mark "error" only when you are sure. If you are unsure whether something is wrong, use "suggestion" and set "confident" to false.
- Write explanations in Vietnamese, one short sentence, friendly and specific. Name the grammar point when there is one.
- Copy "original" exactly as it appears in the learner's text, character for character, so the app can find it.
- "praiseVi": one short, warm sentence in Vietnamese about something the learner did well. Empty string if nothing fits.
- Judge only the learner's text. The source text is context: the learner may retell it in their own words.
</goals>

<examples>
${ex}
</examples>`;
}

export function buildUser(sourceText, learnerText) {
  return `<source_text>\n${sourceText || "(none)"}\n</source_text>\n<learner_text>\n${learnerText}\n</learner_text>`;
}

export const norm = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Merges several runs (parsed JSON, or null for a failed run) by majority vote per edit.
 * Edits with the same `original` count as one vote each run; the most voted `corrected` wins;
 * level = most voted, ties go to the milder level. Returns { kept, weak, allCorrect, praiseVi, runs, threshold }.
 */
export function mergeRuns(runs) {
  const good = runs.filter((r) => r && Array.isArray(r.edits));
  const n = good.length;
  const threshold = n >= 2 ? Math.ceil((2 * n) / 3) : 1;
  const groups = new Map();
  good.forEach((r, ri) => {
    const seen = new Set();
    r.edits.forEach((e) => {
      const key = norm(e.original);
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...e, run: ri });
    });
  });
  const kept = [], weak = [];
  for (const [key, votes] of groups) {
    const tally = (f) => { const m = new Map(); votes.forEach((v) => m.set(f(v), (m.get(f(v)) || 0) + 1)); return m; };
    const corr = [...tally((v) => norm(v.corrected))].sort((a, b) => b[1] - a[1])[0][0];
    const lv = [...tally((v) => v.level)].sort((a, b) => b[1] - a[1] || LEVEL_RANK[a[0]] - LEVEL_RANK[b[0]])[0][0];
    const pick = votes.find((v) => norm(v.corrected) === corr) || votes[0];
    const item = { original: key, corrected: corr, level: lv, explanationVi: pick.explanationVi,
      confident: votes.every((v) => v.confident), votes: votes.length, of: n };
    (votes.length >= threshold ? kept : weak).push(item);
  }
  const sorter = (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.votes - a.votes;
  kept.sort(sorter); weak.sort(sorter);
  const yes = good.filter((r) => r.allCorrect).length;
  const praise = (good.find((r) => norm(r.praiseVi)) || {}).praiseVi || "";
  return { kept, weak, allCorrect: n > 0 && yes >= threshold && kept.length === 0, praiseVi: praise, runs: n, threshold };
}

/** Runs the feedback `times` times in parallel and merges. Throws the first error if every run failed. */
export async function getFeedback({ key, model, lang, sourceText, learnerText, times = 3, fetchImpl }) {
  const opts = { key, model, system: buildSystem(lang), user: buildUser(sourceText, learnerText), schema: SCHEMA, effort: "medium" };
  const settled = await Promise.allSettled(Array.from({ length: times }, () => callClaude(opts, fetchImpl)));
  const ok = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (ok.length === 0) throw settled[0].reason instanceof ClaudeError ? settled[0].reason : new ClaudeError("network", "failed");
  const usage = ok.reduce((u, r) => ({ input_tokens: u.input_tokens + (r.usage.input_tokens || 0),
    output_tokens: u.output_tokens + (r.usage.output_tokens || 0) }), { input_tokens: 0, output_tokens: 0 });
  return { ...mergeRuns(ok.map((r) => r.json)), usage, failed: times - ok.length };
}
