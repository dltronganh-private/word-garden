// "Đọc": graded texts, tap a word for its meaning and add it to the cards; then retell in 3-5 sentences
// and get AI feedback (three runs, majority vote). AI text is always shown as plain text.
import { h, pct } from "./ui.js";
import { LANGS, LANG_TAG, LANG_VI } from "./store.js";
import { parseText, coverage, plainText } from "./reader.js";
import { addWord, isRemembered, isSeen } from "./cards.js";
import { addCustom, hanvietFor, aiMeaningRow } from "./words.js";
import { getFeedback, LEVEL_VI } from "./feedback.js";
import { ERROR_TEXT, costUsd } from "./api.js";
import { newsSection, pasteSection, findText, sourceLine } from "./view_news.js";

const knowsFn = (st, lang) => (t) => {
  const id = t.kind === "pack" ? t.word.id : `${lang}:${t.lemma}`;
  return isRemembered(st, id) || !!st.known[id];
};

export function viewRead(ctx) {
  const t = ctx.arg ? findText(ctx, ctx.arg) : null;
  return t ? readText(ctx, t) : textList(ctx);
}

function textList(ctx) {
  const out = h("section", {}, h("h1", { text: "Đọc" }),
    h("p", { class: "muted", text: "Bài ngắn theo vốn từ. Bấm vào từ có gạch chân để xem nghĩa và thêm vào thẻ." }),
    newsSection(ctx), pasteSection(ctx), h("h2", { text: "Bài có sẵn" }));
  for (const l of LANGS) {
    if (!ctx.st.settings.langs[l].on) continue;
    out.append(h("h2", {}, h("span", { class: "lang-dot " + l }), LANG_VI[l]));
    if (ctx.packs[l].meta.missing) out.append(h("p", { class: "note", text: "Chưa nhập gói từ nên chỉ một số từ có nghĩa khi bấm. Nhập gói trong Cài đặt." }));
    ctx.texts.filter((t) => t.lang === l).forEach((t) => {
      const cov = coverage(parseText(t, ctx.packs[l]), knowsFn(ctx.st, l));
      out.append(h("button", { class: "card row-btn", onclick: () => ctx.go("read", t.id) },
        h("span", { text: t.title }), h("span", { class: "muted small", text: `biết ${pct(cov)}` })));
    });
  }
  out.append(h("p", { class: "muted small", text: "Bài do app soạn, chưa có người bản xứ kiểm. Thấy câu lạ thì đánh dấu lại." }));
  return out;
}

function readText(ctx, text) {
  const { st } = ctx;
  const lang = text.lang;
  const tokens = parseText(text, ctx.packs[lang]);
  const out = h("section", { class: "reader" });
  out.append(h("button", { class: "btn ghost", onclick: () => ctx.go("read"), text: "← Danh sách bài" }),
    h("h1", { text: text.title }), sourceLine(text) || "",
    h("p", { class: "muted small", text: `Bạn biết khoảng ${pct(coverage(tokens, knowsFn(st, lang)))} số từ trong bài (cần khoảng 95 % để đọc thoải mái).` }));

  const pop = h("div", { class: "card pop", hidden: true, "aria-live": "polite" });
  const body = h("p", { class: "text", lang: LANG_TAG[lang] });
  tokens.forEach((t) => {
    if (t.kind === "pack" || t.kind === "gloss") {
      body.append(h("button", { class: "tok " + t.kind, onclick: () => showWord(ctx, pop, lang, t) , text: t.surface }));
    } else body.append(document.createTextNode(t.surface));
  });
  out.append(h("div", { class: "card" }, body), pop);
  out.append(writeBox(ctx, text, plainText(tokens)));
  return out;
}

function showWord(ctx, pop, lang, t) {
  const { st } = ctx;
  let id, head, reading, meaning, extra = null;
  if (t.kind === "pack") {
    const w = t.word; id = w.id; head = w.head; reading = w.reading; meaning = w.meaningVi || w.meaningEn;
    const hv = hanvietFor(w, st); if (hv) extra = `Hán Việt: ${hv.text}${hv.note ? ` (${hv.note})` : ""}`;
  } else { id = `${lang}:${t.lemma}`; head = t.lemma; [reading, meaning] = t.gloss; }
  const added = isSeen(st, id);
  pop.hidden = false;
  pop.replaceChildren(...[
    h("p", { class: "head small-head", lang: LANG_TAG[lang], text: head }),
    h("p", { class: "reading", lang: LANG_TAG[lang], text: reading || "" }),
    h("p", { class: "meaning", text: meaning || "" }),
    t.kind === "pack" ? aiMeaningRow(t.word, st, ctx.save, h) : null,
    extra ? h("p", { class: "muted small", text: extra }) : null,
    h("button", { class: "btn" + (added ? "" : " primary"), disabled: added, text: added ? "Đã có trong thẻ" : "Thêm vào thẻ", onclick: () => {
      const wid = t.kind === "pack" ? id : addCustom(st, lang, head, reading, meaning);
      addWord(st, wid, new Date()); ctx.save(); showWord(ctx, pop, lang, t);
    } }),
    h("button", { class: "btn ghost", text: "Đóng", onclick: () => { pop.hidden = true; } })].filter(Boolean));
}

function writeBox(ctx, text, sourceText) {
  const { st, store } = ctx;
  const box = h("div", { class: "card" }, h("h2", { text: "Viết lại bằng lời của bạn" }),
    h("p", { class: "muted small", text: `Gấp bài lại, viết 3–5 câu ${LANG_VI[text.lang].toLowerCase()} kể lại điều bạn nhớ.` }));
  const area = h("textarea", { rows: "5", lang: LANG_TAG[text.lang], "aria-label": "Bài viết của bạn" });
  const result = h("div", { class: "feedback", "aria-live": "polite" });
  const btn = h("button", { class: "btn primary", text: "Nhờ AI góp ý" });
  btn.addEventListener("click", async () => {
    const learnerText = area.value.trim();
    if (!learnerText) { area.focus(); return; }
    btn.disabled = true; result.replaceChildren(h("p", { class: "muted", text: "AI đang đọc bài (3 lượt để chắc hơn)…" }));
    try {
      const r = await getFeedback({ key: store.getKey(), model: st.settings.model, lang: text.lang, sourceText, learnerText });
      const rec = { at: new Date().toISOString(), textId: text.id, lang: text.lang, text: learnerText, kept: r.kept, weak: r.weak, allCorrect: r.allCorrect, usage: r.usage, model: st.settings.model, flags: [] };
      st.writings.push(rec); ctx.save();
      result.replaceChildren(renderFeedback(ctx, rec, r));
    } catch (e) {
      result.replaceChildren(h("p", { class: "card warn", text: ERROR_TEXT[e.kind] || ERROR_TEXT.bad_request }));
    } finally { btn.disabled = false; }
  });
  box.append(area, btn, h("p", { class: "ai-note", text: "Góp ý do AI tạo ra, có thể sai. Hãy tự kiểm lại trước khi tin." }), result);
  return box;
}

function renderFeedback(ctx, rec, r) {
  const wrap = h("div", {});
  if (r.praiseVi) wrap.append(h("p", { class: "praise", text: r.praiseVi }));
  if (r.allCorrect) wrap.append(h("p", { class: "ok", text: "Bài đã đúng. Không có gì phải sửa." }));
  const list = [...r.kept, ...(ctx.st.settings.showWeakEdits ? r.weak : [])];
  list.forEach((e, i) => {
    const weak = i >= r.kept.length;
    const flag = h("button", { class: "btn tiny ghost", text: "Góp ý này có vẻ sai", onclick: () => {
      rec.flags.push({ original: e.original, corrected: e.corrected }); ctx.save(); flag.disabled = true; flag.textContent = "Đã ghi lại";
    } });
    wrap.append(h("div", { class: `edit lv-${e.level}${weak ? " weak" : ""}` },
      h("span", { class: "chip", text: weak ? "Gợi ý không chắc" : LEVEL_VI[e.level] }),
      h("p", { lang: LANG_TAG[rec.lang] }, h("s", { text: e.original }), " → ", h("b", { text: e.corrected })),
      h("p", { text: e.explanationVi }),
      h("p", { class: "muted small", text: `${e.votes}/${e.of} lượt AI đồng ý${e.confident ? "" : " · AI không chắc"}` }),
      flag));
  });
  if (!list.length && !r.allCorrect) wrap.append(h("p", { class: "muted", text: "Các lượt AI không thống nhất được chỗ nào cần sửa." }));
  const cents = costUsd(rec.model, r.usage) * 100;
  wrap.append(h("p", { class: "muted small", text: `${r.runs} lượt chạy${r.failed ? `, ${r.failed} lượt lỗi` : ""} · khoảng ${cents.toFixed(2)} xu USD` }));
  return wrap;
}
