// "Bộ kiểm góp ý": runs the feedback on the test set with the key in this browser, grades by machine,
// shows three numbers per language and offers the results as a file. Every run costs money: the estimate
// is shown and confirmed first.
import { h, pct, askInline } from "./ui.js";
import { LANG_VI, LANG_TAG } from "./store.js";
import { MODELS, DEFAULT_MODEL, ERROR_TEXT, costUsd } from "./api.js";
import { getFeedback } from "./feedback.js";
import { pickCases, estimateCents, gradeCase, summarize, THRESHOLDS } from "./evalset.js";

export function viewEval(ctx) {
  const { st, store } = ctx;
  const out = h("section", {}, h("button", { class: "btn ghost", onclick: () => ctx.go("settings"), text: "← Cài đặt" }),
    h("h1", { text: "Bộ kiểm góp ý AI" }),
    h("p", { class: "muted small", text: "Chạy góp ý trên câu mẫu có đáp án để đo AI bắt lỗi và báo nhầm ra sao. Mỗi lần chạy tốn tiền API." }));
  const box = h("div", { class: "card" }, h("p", { text: "Đang tải bộ câu…" }));
  out.append(box);
  fetch("data/eval.json").then((r) => (r.ok ? r.json() : Promise.reject())).then((set) => setup(ctx, box, set))
    .catch(() => box.replaceChildren(h("p", { text: "Không có bộ câu kiểm ở bản này." })));
  return out;
}

function setup(ctx, box, set) {
  const { st, store } = ctx;
  const langs = { zh: true, ja: true, ko: true };
  let per = 10, model = st.settings.model, running = false, stop = false, last = null;
  const est = h("p", { class: "big" });
  const status = h("p", { class: "small", "aria-live": "polite" });
  const table = h("div", {});
  const refresh = () => {
    const n = pickCases(set.cases, Object.keys(langs).filter((l) => langs[l]), per).length;
    est.textContent = `${n} ca × 3 lượt · ước khoảng ${(estimateCents(n, model) / 100).toFixed(2)} USD (${MODELS[model].name})`;
  };
  const runBtn = h("button", { class: "btn primary", text: "Chạy" });
  const stopBtn = h("button", { class: "btn", text: "Dừng", hidden: true, onclick: () => { stop = true; } });
  const dl = h("button", { class: "btn", text: "Tải kết quả", disabled: true, onclick: () => download(last) });
  const askSlot = h("div", {});
  const resultText = h("pre", { class: "result-json", "aria-label": "Kết quả dạng chữ" });
  runBtn.addEventListener("click", () => {
    if (running) return;
    const key = store.getKey();
    if (!key) { status.textContent = ERROR_TEXT.no_key; return; }
    const cases = pickCases(set.cases, Object.keys(langs).filter((l) => langs[l]), per);
    askInline(askSlot, `Chạy ${cases.length} ca, ước khoảng ${(estimateCents(cases.length, model) / 100).toFixed(2)} USD.`, "Chạy thật", () => run(key, cases));
  });
  async function run(key, cases) {
    running = true; stop = false; runBtn.disabled = true; stopBtn.hidden = false; dl.disabled = true;
    const rows = []; const usage = { input_tokens: 0, output_tokens: 0 };
    const started = new Date().toISOString();
    for (let i = 0; i < cases.length && !stop; i++) {
      const c = cases[i];
      status.textContent = `Ca ${i + 1}/${cases.length} (${c.id})…`;
      let r = null, err = null;
      try { r = await getFeedback({ key, model, lang: c.lang, sourceText: "", learnerText: c.text }); usage.input_tokens += r.usage.input_tokens; usage.output_tokens += r.usage.output_tokens; }
      catch (e) { err = e.kind || "error"; if (["bad_key", "spend_limit", "billing", "no_key"].includes(err)) stop = true; }
      rows.push({ case: c, result: r && { kept: r.kept, weak: r.weak, allCorrect: r.allCorrect, failedRuns: r.failed }, error: err, grade: gradeCase(c, r) });
    }
    const sum = summarize(rows.map((x) => x.grade));
    last = { started, finished: new Date().toISOString(), model, cases: rows.length, usage, costUsd: costUsd(model, usage), summary: sum, thresholds: THRESHOLDS, rows,
      source: set.source };
    status.textContent = `${stop ? "Đã dừng" : "Xong"}: ${rows.length} ca · chi thật khoảng ${last.costUsd.toFixed(2)} USD` +
      (rows.find((x) => x.error) ? ` · lỗi: ${ERROR_TEXT[rows.find((x) => x.error).error] || rows.find((x) => x.error).error}` : "");
    table.replaceChildren(renderSummary(sum));
    running = false; runBtn.disabled = false; stopBtn.hidden = true; dl.disabled = false;
    // Also shown as text, so it can be read off the page without downloading a file.
    resultText.textContent = JSON.stringify(last);
  }

  box.replaceChildren(
    h("h2", { text: "Chọn" }),
    h("div", { class: "row" }, Object.keys(langs).map((l) => h("label", { class: "check" },
      h("input", { type: "checkbox", checked: true, onchange: (e) => { langs[l] = e.target.checked; refresh(); } }), ` ${LANG_VI[l]}`))),
    h("label", {}, "Số ca mỗi thứ tiếng ", h("select", { onchange: (e) => { per = Number(e.target.value); refresh(); } },
      h("option", { value: "10", selected: true, text: "10 (chạy thử)" }), h("option", { value: "40", text: "40 (đủ bộ)" }))),
    h("label", {}, "Mô hình ", h("select", { onchange: (e) => { model = e.target.value; refresh(); } },
      Object.entries(MODELS).map(([id, m]) => h("option", { value: id, selected: id === model, text: m.name })))),
    est,
    h("p", { class: "muted small", text: `Ước theo giá đo thật: một lần góp ý 3 lượt với ${MODELS[DEFAULT_MODEL].name} khoảng 3,6 xu USD.` }),
    h("div", { class: "row" }, runBtn, stopBtn, dl), askSlot, status, table, resultText,
    h("p", { class: "muted small", text: `Ngưỡng đặt trước: báo nhầm ≤ ${pct(THRESHOLDS.falseAlarmMax)} trên câu đúng; bắt lỗi ≥ ${pct(THRESHOLDS.catchMin)} trên câu sai. Câu mẫu: Tatoeba (tatoeba.org), CC BY 2.0 FR; câu sai do app cài lỗi vào.` }));
  refresh();
}

function renderSummary(sum) {
  const rows = Object.entries(sum).map(([l, s]) => h("div", { class: "edit" },
    h("p", {}, h("b", { lang: LANG_TAG[l], text: LANG_VI[l] }), s.pass ? " · đạt ngưỡng" : " · chưa đạt ngưỡng"),
    h("p", { text: `Báo nhầm trên câu đúng: ${s.falseAlarm}/${s.correct}${s.falseAlarmRate !== null ? ` (${pct(s.falseAlarmRate)})` : ""}` }),
    h("p", { text: `Bắt đúng chỗ lỗi: ${s.caught}/${s.wrong}${s.catchRate !== null ? ` (${pct(s.catchRate)})` : ""}` }),
    h("p", { class: "muted small", text: `Sửa ra đúng câu gốc: ${s.exact}/${s.wrong}${s.failed ? ` · ${s.failed} ca lỗi khi gọi` : ""}` })));
  return h("div", {}, rows);
}

function download(data) {
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `bo-kiem-gop-y-${data.started.slice(0, 16).replace(/[:T]/g, "-")}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
