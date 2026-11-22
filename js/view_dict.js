// Dictionary UI: the "Tra từ" box on the reading tab, and lookups for any tapped word that is not in the word pack.
import { h } from "./ui.js";
import { LANGS, LANG_VI, LANG_TAG } from "./store.js";
import { lookup, askAI, ASK_CENTS } from "./dict.js";
import { addCustom } from "./words.js";
import { addWord, isSeen } from "./cards.js";
import { ERROR_TEXT } from "./api.js";
import { sayWordButton } from "./view_speech.js";

const SRC_NOTE = { zh: "Từ điển CVDICT (nghĩa phần lớn do máy dịch)", ja: "Từ điển JMdict", ko: "Từ điển KRDict" };

/** Fills `box` with the dictionary result for `word` (or an "ask AI" button when it is missing). */
export async function showLookup(ctx, box, lang, word, sentence = "") {
  const { st, store } = ctx;
  box.replaceChildren(h("p", { class: "muted small", text: "Đang tra…" }));
  const r = await lookup(lang, word);
  const items = [];
  if (r) {
    r.senses.forEach((s, i) => items.push(h("div", { class: "dict-sense" },
      i === 0 ? h("p", { class: "head small-head", lang: LANG_TAG[lang], text: r.head }) : null, i === 0 ? sayWordButton(ctx, lang, r.head) : null,
      h("p", { class: "reading", lang: LANG_TAG[lang], text: s.reading || "" }),
      h("p", { class: "meaning", text: s.gloss }),
      s.extra === "ai" ? h("p", { class: "small" }, h("span", { class: "tag", text: "AI dịch" })) : null,
      s.extra === "en" ? h("p", { class: "muted small", text: "Nghĩa tiếng Anh" }) : null,
      lang !== "ja" && s.extra ? h("p", { class: "muted small", lang: LANG_TAG[lang], text: lang === "zh" ? `Phồn thể: ${s.extra}` : `Gốc Hán: ${s.extra}` }) : null)));
    const best = r.senses[0];
    const id = `${lang}:${r.head}`;
    const added = isSeen(st, id);
    items.push(h("button", { class: "btn" + (added ? "" : " primary"), disabled: added, text: added ? "Đã có trong thẻ" : "Thêm vào thẻ", onclick: (e) => {
      addCustom(st, lang, r.head, best.reading, best.gloss); addWord(st, id, new Date()); ctx.save();
      e.target.disabled = true; e.target.textContent = "Đã có trong thẻ";
    } }));
    items.push(h("p", { class: "muted small", text: SRC_NOTE[lang] }));
  } else {
    items.push(h("p", { text: `Không có “${word}” trong từ điển của app.` }));
  }
  const cached = (st.aiDict || {})[`${lang}:${word}`];
  if (cached) items.push(aiResult(cached));
  else items.push(askButton(ctx, box, lang, word, sentence, items));
  if (box.classList.contains("pop")) items.push(h("button", { class: "btn ghost", text: "Đóng", onclick: () => { box.hidden = true; } }));
  box.replaceChildren(...items.filter(Boolean));
}

function aiResult(a) {
  return h("div", { class: "dict-ai" }, h("p", {}, h("span", { class: "tag", text: "AI giải thích" }), " ", h("b", { text: a.reading || "" })),
    h("p", { class: "meaning", text: a.meaningVi }), a.noteVi ? h("p", { class: "small", text: a.noteVi }) : null,
    h("p", { class: "ai-note", text: "Do AI tạo ra, có thể sai. Hãy tự kiểm lại." }));
}

function askButton(ctx, box, lang, word, sentence) {
  const { st, store } = ctx;
  const msg = h("p", { class: "small", "aria-live": "polite" });
  const btn = h("button", { class: "btn", text: `Hỏi AI nghĩa từ này (khoảng ${ASK_CENTS} xu USD)` });
  btn.addEventListener("click", async () => {
    btn.disabled = true; msg.textContent = "AI đang trả lời…";
    try {
      const a = await askAI({ key: store.getKey(), model: st.settings.model, lang, word, context: sentence });
      st.aiDict = st.aiDict || {}; st.aiDict[`${lang}:${word}`] = { reading: a.reading, meaningVi: a.meaningVi, noteVi: a.noteVi, at: new Date().toISOString() };
      ctx.save(); btn.replaceWith(aiResult(a)); msg.textContent = `Chi khoảng ${(a.costUsd * 100).toFixed(2)} xu USD.`;
    } catch (e) { msg.textContent = ERROR_TEXT[e.kind] || ERROR_TEXT.bad_request; btn.disabled = false; }
  });
  return h("div", {}, btn, msg);
}

/** "Tra từ" card for the reading tab. */
export function dictCard(ctx) {
  let lang = LANGS.find((l) => ctx.st.settings.langs[l].on) || "zh";
  const sel = h("select", { "aria-label": "Thứ tiếng", onchange: (e) => { lang = e.target.value; input.lang = LANG_TAG[lang]; } },
    LANGS.map((l) => h("option", { value: l, selected: l === lang, text: LANG_VI[l] })));
  const input = h("input", { type: "text", lang: LANG_TAG[lang], placeholder: "Gõ hoặc dán một từ", "aria-label": "Từ cần tra", enterkeyhint: "search" });
  const out = h("div", { "aria-live": "polite" });
  const go = () => { if (input.value.trim()) showLookup(ctx, out, lang, input.value.trim()); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  return h("div", { class: "card" }, h("h2", { text: "Tra từ" }), sel, h("div", { class: "row" }, input, h("button", { class: "btn primary", text: "Tra", onclick: go })), out);
}
