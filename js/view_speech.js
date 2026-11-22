// Read-aloud controls for a reading text, and a small "Nghe" button for single words.
import { h } from "./ui.js";
import { LANG_VI, LANG_TAG } from "./store.js";
import { speechAvailable, speak, sentences, voiceFor } from "./speech.js";

let stopCurrent = () => {};

function voiceNote(lang) {
  if (!speechAvailable()) return "Trình duyệt này không có chức năng đọc to.";
  if (!voiceFor(lang)) return `Máy có thể chưa có giọng ${LANG_VI[lang].toLowerCase()}. Nếu không nghe thấy hoặc nghe giọng lạ, hãy cài giọng này trong phần cài đặt giọng nói của điện thoại.`;
  return "";
}

/** "Nghe" card: whole text, sentence by sentence, slow / normal speed, stop. */
export function speechCard(ctx, lang, text) {
  const st = ctx.st;
  const rate = () => st.settings.speechRate || "normal";
  const note = h("p", { class: "muted small", "aria-live": "polite", text: "" });
  const list = h("div", { class: "sent-list", hidden: true });
  const say = (texts, btn) => {
    stopCurrent();
    note.textContent = voiceNote(lang);
    document.querySelectorAll(".sent-btn.on").forEach((b) => b.classList.remove("on"));
    if (btn) btn.classList.add("on");
    stopCurrent = speak(texts, lang, rate(), (how) => {
      if (btn) btn.classList.remove("on");
      if (how === "error" || how === "unavailable") note.textContent = voiceNote(lang) || "Không đọc được câu này trên máy này.";
    });
  };
  sentences(text).forEach((s) => list.append(h("button", { class: "sent-btn", lang: LANG_TAG[lang], text: s, onclick: (e) => say(s, e.currentTarget) })));
  const speedBtn = h("button", { class: "btn tiny", text: rate() === "slow" ? "Tốc độ: chậm" : "Tốc độ: vừa", onclick: () => {
    st.settings.speechRate = rate() === "slow" ? "normal" : "slow"; ctx.save();
    speedBtn.textContent = rate() === "slow" ? "Tốc độ: chậm" : "Tốc độ: vừa";
  } });
  if (!speechAvailable()) return h("div", { class: "card" }, h("h2", { text: "Nghe" }), h("p", { class: "muted small", text: voiceNote(lang) }));
  return h("div", { class: "card" }, h("h2", { text: "Nghe" }),
    h("div", { class: "row" },
      h("button", { class: "btn primary", text: "Đọc cả bài", onclick: () => say(sentences(text)) }),
      h("button", { class: "btn", text: "Từng câu", onclick: () => { list.hidden = !list.hidden; } }),
      h("button", { class: "btn", text: "Dừng", onclick: () => { stopCurrent(); } }), speedBtn),
    list, note);
}

/** Small button that reads one word. */
export function sayWordButton(ctx, lang, word) {
  if (!speechAvailable()) return null;
  return h("button", { class: "btn tiny", text: "Nghe", "aria-label": `Nghe từ ${word}`, onclick: () => { stopCurrent(); stopCurrent = speak(word, lang, ctx.st.settings.speechRate || "normal"); } });
}
