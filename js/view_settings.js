// "Cài đặt": API key (stays in this browser), model, weekly minutes, deadlines, backup, and the sources screen.
import { h, WEEKDAY_VI } from "./ui.js";
import { LANGS, LANG_VI, exportJSON, importJSON } from "./store.js";
import { MODELS } from "./api.js";
import { validatePack, indexPack } from "./words.js";

export function viewSettings(ctx) {
  const { st, store } = ctx;
  const s = st.settings;
  const out = h("section", { class: "settings" }, h("h1", { text: "Cài đặt" }));

  // API key: typed by the learner, kept only in this browser, never exported.
  const has = !!store.getKey();
  const keyIn = h("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: has ? "Đã có khoá (ẩn)" : "Dán khoá API vào đây", "aria-label": "Khoá API" });
  out.append(h("div", { class: "card" }, h("h2", { text: "Khoá API cho góp ý AI" }),
    h("p", { class: "muted small", text: "Khoá chỉ nằm trong trình duyệt này. Không gửi khoá cho ai qua tin nhắn. Thẻ, đọc, lịch vẫn dùng được khi không có khoá." }),
    keyIn,
    h("div", { class: "row" },
      h("button", { class: "btn primary", text: "Lưu khoá", onclick: () => { if (keyIn.value.trim()) { store.setKey(keyIn.value); keyIn.value = ""; ctx.render(); } } }),
      h("button", { class: "btn", text: "Xoá khoá", disabled: !has, onclick: () => { store.clearKey(); ctx.render(); } })),
    h("p", { class: "small", text: has ? "Trạng thái: đã có khoá." : "Trạng thái: chưa có khoá." }),
    h("label", {}, "Mô hình góp ý ",
      h("select", { onchange: (e) => { s.model = e.target.value; ctx.save(); } },
        Object.entries(MODELS).map(([id, m]) => h("option", { value: id, selected: s.model === id, text: m.name })))),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: s.showWeakEdits, onchange: (e) => { s.showWeakEdits = e.target.checked; ctx.save(); } }),
      " Hiện cả gợi ý chỉ 1 lượt AI đưa ra (mờ, không chắc)")));

  const mins = h("div", { class: "mins" });
  [1, 2, 3, 4, 5, 6, 0].forEach((d) => mins.append(h("label", {}, WEEKDAY_VI[d],
    h("input", { type: "number", min: "0", max: "600", step: "10", value: String(s.minutes[d]), inputmode: "numeric",
      onchange: (e) => { s.minutes[d] = Math.max(0, Math.min(600, Number(e.target.value) || 0)); ctx.save(); } }))));
  out.append(h("div", { class: "card" }, h("h2", { text: "Thời gian học mỗi ngày (phút)" }), mins,
    h("label", {}, "Phần cho thẻ ôn (%) ", h("input", { type: "number", min: "10", max: "90", step: "5", value: String(Math.round(s.cardShare * 100)),
      onchange: (e) => { s.cardShare = Math.max(0.1, Math.min(0.9, (Number(e.target.value) || 40) / 100)); ctx.save(); } }))));

  const langs = h("div", { class: "card" }, h("h2", { text: "Mục tiêu từng thứ tiếng" }));
  LANGS.forEach((l) => {
    const c = s.langs[l];
    langs.append(h("fieldset", {}, h("legend", {}, h("span", { class: "lang-dot " + l }), LANG_VI[l]),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: c.on, onchange: (e) => { c.on = e.target.checked; ctx.save(); } }), " Đang học"),
      h("label", {}, "Hạn ", h("input", { type: "date", value: c.deadline, onchange: (e) => { if (e.target.value) { c.deadline = e.target.value; ctx.save(); } } })),
      h("label", {}, "Số từ mục tiêu ", h("input", { type: "number", min: "0", step: "50", value: String(c.target), onchange: (e) => { c.target = Math.max(0, Number(e.target.value) || 0); ctx.save(); } }))));
  });
  langs.append(h("label", { class: "check" }, h("input", { type: "checkbox", checked: s.showHanviet, onchange: (e) => { s.showHanviet = e.target.checked; ctx.save(); } }),
    " Hiện âm Hán Việt lấy từ Wiktionary (chữ nhiều âm có thể sai; bấm Sửa trên thẻ để ghi âm đúng)"));
  out.append(langs);

  out.append(packCard(ctx));

  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const next = importJSON(await f.text());
      if (!window.confirm("Thay toàn bộ tiến độ hiện tại bằng bản sao lưu này?")) return;
      Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, next); ctx.save(); ctx.go("today");
    } catch (err) { window.alert(err.message); }
  } });
  out.append(h("div", { class: "card" }, h("h2", { text: "Sao lưu" }),
    h("p", { class: "muted small", text: "Một số trình duyệt (Safari) có thể xoá dữ liệu nếu lâu không mở trang. Nên tải bản sao lưu mỗi tuần. File không chứa khoá API." }),
    h("div", { class: "row" },
      h("button", { class: "btn", text: "Tải bản sao lưu", onclick: () => {
        const blob = new Blob([exportJSON(st)], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob), download: `hoc-ngoai-ngu-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }),
      h("button", { class: "btn", text: "Nhập bản sao lưu", onclick: () => file.click() })), file));

  out.append(h("button", { class: "card row-btn", onclick: () => ctx.go("sources") }, h("span", { text: "Nguồn dữ liệu và giấy phép" }), h("span", { text: "›" })));
  // The test set is a tool for whoever runs the app locally, not for the public page.
  if (["localhost", "127.0.0.1"].includes(location.hostname)) out.append(h("button", { class: "card row-btn", onclick: () => ctx.go("eval") }, h("span", { text: "Bộ kiểm góp ý AI (người làm app)" }), h("span", { text: "›" })));
  return out;
}

/** Chinese word pack: imported once from a file (not shipped with the page), kept in this browser. */
function packCard(ctx) {
  const { store } = ctx;
  const p = ctx.packs.zh;
  const has = !p.meta.missing && p.words.length > 0;
  const msg = h("p", { class: "small", "aria-live": "polite" });
  const input = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const pack = validatePack(await f.text(), "zh");
      if (!store.setPack("zh", pack)) throw new Error("Trình duyệt không cho lưu gói (bộ nhớ đầy hoặc bị chặn).");
      ctx.packs.zh = indexPack(pack);
      ctx.render();
    } catch (err) { msg.textContent = err.message; }
  } });
  return h("div", { class: "card" }, h("h2", {}, h("span", { class: "lang-dot zh" }), "Gói từ tiếng Trung"),
    h("p", { class: "small", text: has ? `Đã có gói: ${p.words.length} từ. Gói nằm trong trình duyệt này.` : "Chưa có gói. Gói tiếng Trung được gửi riêng dưới dạng một file; nhập một lần là xong." }),
    h("div", { class: "row" },
      h("button", { class: "btn" + (has ? "" : " primary"), text: has ? "Nhập lại gói" : "Nhập gói tiếng Trung", onclick: () => input.click() }),
      has ? h("button", { class: "btn", text: "Xoá gói", onclick: () => {
        if (!window.confirm("Xoá gói từ tiếng Trung khỏi trình duyệt? Thẻ đã học vẫn giữ.")) return;
        store.clearPack("zh"); ctx.packs.zh = indexPack({ lang: "zh", meta: { missing: true }, words: [] }); ctx.render();
      } }) : null),
    msg, input);
}

const SOURCES = [
  ["Từ vựng HSK (danh sách, pinyin, nghĩa tiếng Anh)", "drkameleon/complete-hsk-vocabulary", "MIT", "https://github.com/drkameleon/complete-hsk-vocabulary"],
  ["Nghĩa tiếng Anh của từ tiếng Trung", "CC-CEDICT (MDBG)", "CC BY-SA 4.0", "https://cc-cedict.org/wiki/"],
  ["Nghĩa tiếng Việt của từ tiếng Trung", "CVDICT (ph0ngp), phần lớn dịch máy từ CC-CEDICT", "CC BY-SA 4.0", "https://github.com/ph0ngp/CVDICT"],
  ["Danh sách cấp HSK gốc", "© CTI / 教育部中外语言交流合作中心 (chinesetest.cn)", "bản quyền của chủ sở hữu", "https://www.chinesetest.cn/"],
  ["Từ vựng JLPT N3–N2 và nghĩa tiếng Anh", "Jonathan Waller, JLPT Resources (qua stephenmk/yomitan-jlpt-vocab)", "CC BY", "https://github.com/stephenmk/yomitan-jlpt-vocab"],
  ["Nghĩa tiếng Việt của một số từ tiếng Nhật", "Wiktionary tiếng Việt (vi.wiktionary.org), qua bản trích của kaikki.org", "CC BY-SA 4.0", "https://vi.wiktionary.org/wiki/Wiktionary:Gi%E1%BA%A5y_ph%C3%A9p"],
  ["Từ điển tiếng Nhật (mã JMdict của từ)", "JMdict, Electronic Dictionary Research and Development Group", "CC BY-SA 4.0", "https://www.edrdg.org/edrdg/licence.html"],
  ["Từ vựng tiếng Hàn, nghĩa tiếng Việt, chữ Hán gốc", "국립국어원 한국어기초사전 (krdict.korean.go.kr), bản tải trọn bộ 19/11/2026", "CC BY-SA 2.0 KR", "https://krdict.korean.go.kr/kor/kboardPolicy/copyRightTermsInfo"],
  ["Âm Hán Việt (theo chữ và theo từ)", "Wiktionary tiếng Anh, mục tiếng Việt, qua bản trích Wiktextract của kaikki.org (Tatu Ylonen)", "CC BY-SA 4.0", "https://en.wiktionary.org/wiki/Wiktionary:Copyrights"],
  ["Bảng chữ biến thể (chữ Nhật mới ↔ chữ cũ)", "Unicode Unihan Database 18.0", "Unicode License v3", "https://www.unicode.org/license.txt"],
  ["Thuật toán ôn thẻ", "ts-fsrs 6.0.0, Open Spaced Repetition", "MIT", "https://github.com/open-spaced-repetition/ts-fsrs"],
  ["Bài đọc ngắn và ví dụ góp ý", "soạn riêng cho app, chưa có người bản xứ kiểm", "—", null],
  ["Góp ý bài viết", "Claude (Anthropic), gọi bằng khoá API của người dùng", "nội dung AI tạo ra, cần tự kiểm lại", "https://www.anthropic.com/legal/commercial-terms"],
];

export function viewSources(ctx) {
  const out = h("section", {}, h("button", { class: "btn ghost", onclick: () => ctx.go("settings"), text: "← Cài đặt" }),
    h("h1", { text: "Nguồn dữ liệu" }),
    h("p", { class: "muted small", text: "App dùng lại dữ liệu mở của các tác giả dưới đây. Dữ liệu chia sẻ lại theo đúng giấy phép gốc (CC BY-SA: phải ghi tác giả và giữ cùng giấy phép)." }));
  SOURCES.forEach(([what, who, lic, url]) => out.append(h("div", { class: "card src" },
    h("p", {}, h("b", { text: what })), h("p", { text: who }),
    h("p", { class: "small" }, "Giấy phép: ", url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: lic }) : lic))));
  return out;
}
