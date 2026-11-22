// "Ôn thẻ": due cards first (most overdue first), then today's new words. Four grade buttons as in Anki.
import { h, svg } from "./ui.js";
import { LANG_TAG, LANG_VI } from "./store.js";
import { addWord, grade, newCards, todayQueue, previewLabels, markKnown, langOf, applyEasyDays } from "./cards.js";
import { minutesOn } from "./planner.js";
import { nextNewWords, wordById, hanvietFor, aiMeaningRow } from "./words.js";
import { todayPlan } from "./progress.js";
import { checkStamp, stampSVG } from "./stamp.js";

const GRADE_VI = ["Quên", "Khó", "Nhớ", "Dễ"];

/** Adds today's new words (minus words already added and not yet studied), then returns the queue. */
function buildQueue(ctx, now) {
  const { st, packs } = ctx;
  const p = todayPlan(st, packs, now);
  const waiting = newCards(st, now).filter((id) => id.endsWith("|recog"));
  for (const [l, n] of Object.entries(p.newLeft)) {
    const pending = waiting.filter((id) => langOf(id) === l).length;
    nextNewWords(packs, st, l, Math.max(0, n - pending)).forEach((id) => addWord(st, id, now));
  }
  ctx.save();
  return todayQueue(st, now);
}

export function viewReview(ctx) {
  const { st } = ctx;
  const now = new Date();
  if (!ctx.session || ctx.session.day !== now.toDateString()) ctx.session = { day: now.toDateString(), done: 0 };
  const queue = buildQueue(ctx, now);
  const out = h("section", { class: "review" });
  if (!queue.length) {
    out.append(h("div", { class: "card stamp-box" },
      ctx.session.done ? svg(stampSVG(-6, 120)) : null,
      h("h2", { text: ctx.session.done ? "Hết thẻ cho hôm nay!" : "Chưa có thẻ nào đến hạn." }),
      h("p", { class: "muted", text: "Thẻ mới mỗi ngày được tính theo lịch, không dồn sang hôm sau." }),
      h("button", { class: "btn", onclick: () => ctx.go("today"), text: "Về Hôm nay" })));
    return out;
  }
  const id = queue[0];
  const card = st.cards[id];
  const word = wordById(ctx.packs, st, card.wordId);
  const lang = langOf(card.wordId);
  const started = performance.now();
  const meaning = word.meaningVi || word.meaningEn || "";
  const isNew = card.fsrs.reps === 0;

  out.append(h("p", { class: "muted small" }, h("span", { class: "lang-dot " + lang }),
    `${LANG_VI[lang]} · ${card.dir === "recog" ? "nhận ra" : "nhớ ra"}${isNew ? " · thẻ mới" : ""} · còn ${queue.length} thẻ`));

  const face = h("div", { class: "card flash" });
  if (card.dir === "recog") face.append(h("p", { class: "head", lang: LANG_TAG[lang], text: word.head }));
  else face.append(h("p", { class: "meaning-q", text: meaning }), h("p", { class: "muted small", text: "Nhớ ra từ này, viết ra giấy rồi bấm xem." }));
  out.append(face);

  const back = h("div", { class: "back", hidden: true });
  if (card.dir === "recall") back.append(h("p", { class: "head", lang: LANG_TAG[lang], text: word.head }));
  back.append(h("p", { class: "reading", lang: LANG_TAG[lang], text: word.reading || "" }));
  if (card.dir === "recog") back.append(h("p", { class: "meaning", text: meaning }));
  if (word.meaningVi && word.meaningEn) back.append(h("p", { class: "muted small", text: `Anh: ${word.meaningEn}` }));
  if (!word.meaningVi && word.meaningEn) back.append(h("p", { class: "muted small", text: "Chưa có nghĩa tiếng Việt cho gói này; đang hiện nghĩa tiếng Anh." }));
  if (lang === "zh" && word.trad && word.trad !== word.head) back.append(h("p", { class: "muted small", lang: "zh-Hant", text: `Phồn thể: ${word.trad}` }));
  const aiRow = aiMeaningRow(word, st, ctx.save, h); if (aiRow) back.append(aiRow);
  back.append(hanvietRow(ctx, word));
  face.append(back);

  const reveal = h("button", { class: "btn primary wide", text: "Hiện đáp án" });
  const grades = h("div", { class: "grades", hidden: true });
  const labels = previewLabels(st, id, now);
  [1, 2, 3, 4].forEach((g, i) => grades.append(h("button", { class: `btn grade g${g}`, onclick: () => {
    grade(st, id, g, new Date(), performance.now() - started);
    applyEasyDays(st, id, (d) => minutesOn(st.settings, d));
    ctx.session.done++;
    const stamped = checkStamp(st, todayQueue(st, new Date()).length, new Date());
    ctx.save();
    if (stamped) ctx.warn.length = 0;
    ctx.render();
  } }, h("span", { text: GRADE_VI[i] }), h("small", { text: labels[i] }))));
  const show = () => { back.hidden = false; grades.hidden = false; reveal.hidden = true; ctx.revealedId = id; };
  reveal.addEventListener("click", show);
  if (ctx.revealedId === id) show();
  out.append(reveal, grades);
  if (isNew && card.dir === "recog") out.append(h("button", { class: "btn ghost", onclick: () => { markKnown(st, card.wordId); ctx.save(); ctx.render(); }, text: "Mình biết từ này rồi (bỏ qua)" }));
  return out;
}

/** Hán Việt line: the learner's own reading, or the machine guess (off by default), with an edit field. */
function hanvietRow(ctx, word) {
  if (!/[㐀-鿿]/.test((word.trad || "") + word.head + (word.origin || ""))) return h("span", {});
  const hv = hanvietFor(word, ctx.st);
  const row = h("div", { class: "hv" });
  const label = h("span", {}, "Hán Việt: ", h("b", { text: hv ? hv.text : "chưa có" }),
    hv && hv.note ? h("span", { class: "tag", text: hv.note }) : null);
  const input = h("input", { type: "text", value: hv ? hv.text : "", placeholder: "ví dụ: ngân hàng", "aria-label": "Âm Hán Việt", hidden: true });
  const edit = h("button", { class: "btn tiny", text: "Sửa", onclick: () => {
    if (input.hidden) { input.hidden = false; edit.textContent = "Lưu"; input.focus(); return; }
    ctx.st.notes[word.id] = { ...(ctx.st.notes[word.id] || {}), hanviet: input.value.trim() };
    ctx.save(); ctx.render();
  } });
  row.append(label, input, edit);
  return row;
}
