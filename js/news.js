// "Tin mỗi ngày": once a day, one call with the server-side web search finds a few recent news items and learner
// videos; a second call (no tools, JSON schema) rewrites each item at the learner's level, already split into
// words for the reader. Links and quotes come only from the API's own search citations, never from model text.
// Full article text is never stored: only the rewritten summary, the link, the short cited snippet and the date.
import { callClaude, ClaudeError, costUsd } from "./api.js";

export const LEVEL = { zh: "HSK 4-5", ja: "JLPT N4-N3", ko: "TOPIK 1-2" };
const NAME = { zh: "Mandarin Chinese (simplified)", ja: "Japanese", ko: "Korean" };
export const SEARCH_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 6 };
export const FETCH_TOOL = { type: "web_fetch_20260209", name: "web_fetch", max_uses: 1 };

export function searchPrompt(langs, today) {
  const list = langs.map((l) => `- ${NAME[l]} (learner level about ${LEVEL[l]})`).join("\n");
  return `Today is ${today}. Find, for each language below:
${list}
1. One or two news articles published in the last two days, written in that language by a native news site. Prefer
   everyday topics (life, culture, science, sport, travel). Avoid graphic violence and disasters with victims.
2. One YouTube video in that language that suits a learner at that level (a lesson, a vlog with subtitles, slow news).
Search each language separately, at most two searches per language, and never skip a language.
For each find, write one plain sentence in English saying what it is, citing the page.`;
}

/** Unique sources from the search turn: citations on text blocks and the raw result lists. */
export function collectSources(contents) {
  const by = new Map();
  const add = (url, title, cited, pageAge) => {
    if (!safeUrl(url)) return;
    const s = by.get(url) || { url, title: title || url, cited: [], pageAge: pageAge || null };
    if (cited && !s.cited.includes(cited)) s.cited.push(cited);
    if (pageAge && !s.pageAge) s.pageAge = pageAge;
    by.set(url, s);
  };
  for (const blocks of contents) {
    for (const b of blocks || []) {
      if (b.type === "text" && Array.isArray(b.citations)) {
        b.citations.filter((c) => c.type === "web_search_result_location").forEach((c) => add(c.url, c.title, c.cited_text));
      }
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        b.content.filter((r) => r.type === "web_search_result").forEach((r) => add(r.url, r.title, null, r.page_age));
      }
    }
  }
  return [...by.values()];
}

export const safeUrl = (u) => typeof u === "string" && /^https:\/\/[^\s"<>]+$/.test(u);

/** YouTube video id from a watch / short / youtu.be link, or null. */
export function youtubeId(u) {
  if (!safeUrl(u)) return null;
  const m = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/);
  return m ? m[1] : null;
}

const str = { type: "string" };
export const STRUCT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["items", "videos"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["lang", "source", "titleVi", "tokens", "gloss"],
      properties: {
        lang: { type: "string", enum: ["zh", "ja", "ko"] }, source: { type: "integer" }, titleVi: str,
        tokens: { type: "array", items: { type: "object", additionalProperties: false, required: ["t", "lemma"], properties: { t: str, lemma: str } } },
        gloss: { type: "array", items: { type: "object", additionalProperties: false, required: ["lemma", "reading", "vi"], properties: { lemma: str, reading: str, vi: str } } },
      } } },
    videos: { type: "array", items: { type: "object", additionalProperties: false, required: ["lang", "source", "titleVi"],
      properties: { lang: { type: "string", enum: ["zh", "ja", "ko"] }, source: { type: "integer" }, titleVi: str } } },
  },
};

export const STRUCT_SYSTEM = `You prepare short graded reading texts for a Vietnamese adult learner.
For each news source chosen, write a NEW summary of 2-4 short sentences in the article's language at the learner's level
(given per language). Use your own words: do not copy sentences from the source. Keep facts that the source states.
Return the summary split into words as "tokens": each token has "t" (the text as written) and "lemma" (dictionary form if
"t" is inflected, else an empty string). Punctuation is its own token. For Korean, put each space as its own token " ".
In "gloss", explain words a learner at that level may not know: lemma, reading (pinyin with tone marks / kana / hangul), and
a short Vietnamese meaning. "titleVi" is a short Vietnamese title. "source" is the number of the source you used.
Pick only sources from the numbered list. For videos, pick only YouTube links from the list.`;

/** Turns one structured item into a reader text ({tokens: "a|b@c", gloss}); strips the separator characters. */
export function toReadingText(item, src, id, date) {
  const clean = (s) => String(s || "").replace(/[|@]/g, "");
  const tokens = item.tokens.map((t) => {
    const s = clean(t.t), l = clean(t.lemma);
    return l && l !== s ? `${s}@${l}` : s;
  }).filter((s) => s.length).join("|");
  const gloss = {};
  item.gloss.forEach((g) => { if (g.lemma) gloss[clean(g.lemma)] = [String(g.reading || ""), String(g.vi || "")]; });
  return { id, lang: item.lang, title: item.titleVi, tokens, gloss, date,
    source: src ? { url: src.url, title: src.title, cited: src.cited.slice(0, 2) } : null };
}

/** The search turn, continuing after pause_turn (at most 3 requests). Returns { contents, usage, text }. */
export async function searchTurn({ key, model, langs, today, fetchImpl }) {
  let messages = [{ role: "user", content: searchPrompt(langs, today) }];
  const contents = [], usage = { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 0 } };
  for (let i = 0; i < 3; i++) {
    const r = await callClaude({ key, model, messages, tools: [SEARCH_TOOL], effort: "low", maxTokens: 8000, raw: true,
      system: "You search the web for language learners and report only what you found, citing each page." }, fetchImpl);
    const d = r.data;
    addUsage(usage, d.usage);
    contents.push(d.content);
    if (d.stop_reason === "refusal") throw new ClaudeError("refusal", "refusal");
    if (d.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: d.content }];
  }
  const text = contents.flat().filter((b) => b.type === "text").map((b) => b.text).join("");
  return { contents, usage, text };
}

function addUsage(u, x) {
  if (!x) return;
  u.input_tokens += x.input_tokens || 0; u.output_tokens += x.output_tokens || 0;
  u.server_tool_use.web_search_requests += (x.server_tool_use && x.server_tool_use.web_search_requests) || 0;
}

/** Second call: choose and rewrite. Returns the structured JSON and its usage. */
export async function structureCall({ key, model, sources, note, langs, fetchImpl }) {
  const list = sources.map((s, i) => `[${i}] ${s.title} | ${s.url}${s.pageAge ? ` | ${s.pageAge}` : ""}\n    ${s.cited.join(" / ").slice(0, 300)}`).join("\n");
  const user = `<levels>${langs.map((l) => `${l}: ${LEVEL[l]}`).join("; ")}</levels>\n<sources>\n${list}\n</sources>\n<notes>\n${note}\n</notes>`;
  return callClaude({ key, model, system: STRUCT_SYSTEM, user, schema: STRUCT_SCHEMA, effort: "medium", maxTokens: 16000 }, fetchImpl);
}

/** Full daily run. Returns the day record to store: { at, items, videos, usage, costUsd }. */
export async function dailyNews({ key, model, langs, now = new Date(), fetchImpl }) {
  const today = now.toISOString().slice(0, 10);
  const s = await searchTurn({ key, model, langs, today, fetchImpl });
  const sources = collectSources(s.contents);
  if (!sources.length) throw new ClaudeError("no_results", "no sources");
  const r = await structureCall({ key, model, sources, note: s.text.slice(0, 4000), langs, fetchImpl });
  const usage = { ...s.usage, input_tokens: s.usage.input_tokens + (r.usage.input_tokens || 0), output_tokens: s.usage.output_tokens + (r.usage.output_tokens || 0) };
  const items = r.json.items.filter((it) => sources[it.source] && langs.includes(it.lang) && it.tokens.length)
    .map((it, i) => toReadingText(it, sources[it.source], `news-${today}-${i}`, today));
  const videos = r.json.videos.map((v) => ({ ...v, src: sources[v.source] })).filter((v) => v.src && youtubeId(v.src.url) && langs.includes(v.lang))
    .map((v) => ({ lang: v.lang, titleVi: v.titleVi, url: v.src.url, title: v.src.title, videoId: youtubeId(v.src.url) }));
  return { at: now.toISOString(), items, videos, usage, costUsd: costUsd(model, usage) };
}

/** Pasted text or link → one graded reading text. A link is read with the web fetch tool first. */
export async function fromPaste({ key, model, lang, text, url, now = new Date(), fetchImpl }) {
  const today = now.toISOString().slice(0, 10);
  let sources = [], note = "";
  const usage = { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 0 } };
  if (url) {
    if (!safeUrl(url)) throw new ClaudeError("bad_url", "bad url");
    const r = await callClaude({ key, model, tools: [FETCH_TOOL], effort: "low", maxTokens: 4000, raw: true,
      system: "You read one web page for a language learner and report its main points, citing it.",
      user: `Read ${url} and state its main points in 3 sentences in English.` }, fetchImpl);
    addUsage(usage, r.data.usage);
    note = (r.data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    sources = [{ url, title: url, cited: [], pageAge: null }];
  } else {
    note = `The learner pasted this ${NAME[lang]} text:\n${String(text).slice(0, 6000)}`;
    sources = [{ url: "", title: "Bài bạn dán", cited: [], pageAge: null }];
  }
  const r = await structureCall({ key, model, sources, note, langs: [lang], fetchImpl });
  addUsage(usage, r.usage);
  const it = r.json.items.find((x) => x.lang === lang && x.tokens.length);
  if (!it) throw new ClaudeError("bad_json", "no item");
  const src = url ? sources[0] : null;
  return { text: toReadingText(it, src, `paste-${now.getTime()}`, today), usage, costUsd: costUsd(model, usage) };
}
