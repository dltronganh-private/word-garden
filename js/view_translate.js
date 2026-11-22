// "Dịch nghĩa tiếng Nhật": local tool page. Translates the N3 + N2 English meanings into Vietnamese in batches,
// continues after a stop, stops by itself if the projected cost runs clearly over the approved amount, and shows
// the result as text on the page (and as a file).
import { h, askInline } from "./ui.js";
import { DEFAULT_MODEL, MODELS, ERROR_TEXT } from "./api.js";
import { batches, mergeBatch, projectUsd, translateBatch, PROGRESS_KEY } from "./jatranslate.js";

export const APPROVED_USD = 4;
const HARD_STOP_USD = APPROVED_USD * 1.5;

function loadProgress() { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || null; } catch (e) { return null; } }
function saveProgress(p) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { /* keep going in memory */ } }

export function viewTranslate(ctx) {
  const out = h("section", {}, h("button", { class: "btn ghost", onclick: () => ctx.go("settings"), text: "← Cài đặt" }),
    h("h1", { text: "Dịch nghĩa tiếng Nhật (AI)" }),
    h("p", { class: "muted small", text: "Dịch nghĩa tiếng Anh của danh sách N3–N2 sang tiếng Việt, từng lô 100 từ. Tốn tiền API. Kết quả được gắn nhãn “AI dịch” trong app." }));
  const box = h("div", { class: "card" }, h("p", { text: "Đang tải danh sách…" }));
  out.append(box);
  fetch("data/ja_source.json").then((r) => (r.ok ? r.json() : Promise.reject())).then((src) => setup(ctx, box, src.words))
    .catch(() => box.replaceChildren(h("p", { text: "Không có danh sách từ ở bản này." })));
  return out;
}

function setup(ctx, box, words) {
  const model = DEFAULT_MODEL;
  const all = batches(words);
  let p = loadProgress() || { model, started: new Date().toISOString(), done: {}, batchesDone: 0, usage: { input_tokens: 0, output_tokens: 0 }, costUsd: 0 };
  let running = false, stop = false;
  const info = h("p", {}), status = h("p", { class: "small", "aria-live": "polite" }), askSlot = h("div", {});
  const resultText = h("pre", { class: "result-json", "aria-label": "Kết quả dạng chữ" });
  const show = () => {
    const left = all.length - p.batchesDone;
    const proj = projectUsd(p.costUsd, p.batchesDone, all.length);
    info.textContent = `${words.length} từ · ${all.length} lô · đã xong ${p.batchesDone} lô (${Object.keys(p.done).length} nghĩa) · đã chi ${p.costUsd.toFixed(2)} USD` +
      (proj !== null ? ` · ước cả bộ ${proj.toFixed(2)} USD` : ` · ước khoảng ${APPROVED_USD} USD (chưa đo)`) + (left ? "" : " · XONG");
    resultText.textContent = left ? "" : JSON.stringify({ model: p.model, started: p.started, finished: p.finished, batches: all.length, usage: p.usage, costUsd: p.costUsd, items: p.done });
  };
  const runBtn = h("button", { class: "btn primary", text: p.batchesDone ? "Chạy tiếp" : "Chạy" });
  const stopBtn = h("button", { class: "btn", text: "Dừng", hidden: true, onclick: () => { stop = true; } });
  runBtn.addEventListener("click", () => {
    if (running) return;
    const key = ctx.store.getKey();
    if (!key) { status.textContent = ERROR_TEXT.no_key; return; }
    askInline(askSlot, `Dịch ${all.length - p.batchesDone} lô bằng ${MODELS[model].name}, ước khoảng ${APPROVED_USD} USD cho cả bộ. Tự dừng nếu ước tính vượt ${HARD_STOP_USD} USD.`, "Chạy thật", () => run(key));
  });
  async function run(key) {
    running = true; stop = false; runBtn.disabled = true; stopBtn.hidden = false;
    for (let b = p.batchesDone; b < all.length && !stop; b++) {
      status.textContent = `Lô ${b + 1}/${all.length}…`;
      try {
        const r = await translateBatch({ key, model, batch: all[b] });
        mergeBatch(all[b], r.json, p.done);
        p.usage.input_tokens += r.usage.input_tokens || 0; p.usage.output_tokens += r.usage.output_tokens || 0;
        p.costUsd += r.cost; p.batchesDone = b + 1; saveProgress(p); show();
        const proj = projectUsd(p.costUsd, p.batchesDone, all.length);
        if (proj > HARD_STOP_USD) { status.textContent = `Dừng: ước cả bộ ${proj.toFixed(2)} USD, vượt mức đã duyệt.`; stop = true; }
      } catch (e) {
        status.textContent = `Lỗi ở lô ${b + 1}: ${ERROR_TEXT[e.kind] || e.message}. Bấm Chạy tiếp để thử lại.`; stop = true;
      }
    }
    if (p.batchesDone === all.length) { p.finished = new Date().toISOString(); saveProgress(p); status.textContent = "Xong."; }
    running = false; runBtn.disabled = false; runBtn.textContent = "Chạy tiếp"; stopBtn.hidden = true; show();
  }
  box.replaceChildren(info, h("div", { class: "row" }, runBtn, stopBtn), askSlot, status, resultText);
  show();
}
