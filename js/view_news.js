// Reading-tab sections: "Tin mỗi ngày" (daily news + videos, fetched at most once a day) and "Dán bài / dán link".
// Every web item shows its source link and the short cited snippet (search results must carry their citation).
import { h } from "./ui.js";
import { LANGS, LANG_VI, dayKey } from "./store.js";
import { dailyNews, fromPaste, safeUrl } from "./news.js";
import { ERROR_TEXT } from "./api.js";

const KEEP_DAYS = 30, KEEP_PASTED = 30;

/** Built-in texts, today's and earlier news, and pasted texts, by id. */
export function findText(ctx, id) {
  const st = ctx.st;
  return ctx.texts.find((t) => t.id === id)
    || Object.values(st.news || {}).flatMap((d) => d.items).find((t) => t.id === id)
    || (st.pasted || []).find((t) => t.id === id) || null;
}

/** "Nguồn" line under a web text: link + cited snippet. */
export function sourceLine(text) {
  if (!text.source) return text.id.startsWith("paste-") ? h("p", { class: "muted small", text: "Bài viết lại từ đoạn bạn dán (không lưu bản gốc)." }) : null;
  const s = text.source;
  return h("div", { class: "src-line" },
    h("p", { class: "small" }, "Nguồn: ", safeUrl(s.url) ? h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer", text: s.title }) : s.title),
    ...(s.cited || []).map((c) => h("p", { class: "muted small" }, "Trích: “", c, "”")),
    h("p", { class: "muted small", text: "Bài trên là tóm tắt do AI viết lại cho dễ đọc, có thể sai; đọc bản gốc ở link nguồn." }));
}

function prune(st) {
  const keys = Object.keys(st.news).sort();
  while (keys.length > KEEP_DAYS) delete st.news[keys.shift()];
  if (st.pasted.length > KEEP_PASTED) st.pasted.splice(0, st.pasted.length - KEEP_PASTED);
}

export function newsSection(ctx) {
  const { st, store } = ctx;
  st.news = st.news || {}; st.pasted = st.pasted || [];
  const today = dayKey(new Date());
  const day = st.news[today];
  const langs = LANGS.filter((l) => st.settings.langs[l].on);
  const box = h("div", { class: "card" }, h("h2", { text: "Tin mỗi ngày" }));
  const msg = h("p", { class: "small", "aria-live": "polite" });
  if (!day) {
    const btn = h("button", { class: "btn primary", text: "Lấy tin hôm nay" });
    btn.addEventListener("click", async () => {
      btn.disabled = true; msg.textContent = "AI đang tìm tin và viết lại cho vừa trình độ (khoảng một phút)…";
      try {
        st.news[today] = await dailyNews({ key: store.getKey(), model: st.settings.model, langs });
        prune(st); ctx.save(); ctx.render();
      } catch (e) { msg.textContent = ERROR_TEXT[e.kind] || ERROR_TEXT.bad_request; btn.disabled = false; }
    });
    box.append(h("p", { class: "muted small", text: "Mỗi ngày lấy một lần: vài tin mới và video hợp trình độ cho từng thứ tiếng. Có tốn tiền API (tìm web + AI viết lại)." }), btn, msg);
    return box;
  }
  if (!day.items.length && !day.videos.length) box.append(h("p", { text: "Hôm nay AI không tìm được tin phù hợp." }));
  for (const l of langs) {
    const items = day.items.filter((t) => t.lang === l), vids = day.videos.filter((v) => v.lang === l);
    if (!items.length && !vids.length) continue;
    box.append(h("p", { class: "small" }, h("span", { class: "lang-dot " + l }), h("b", { text: LANG_VI[l] })));
    items.forEach((t) => box.append(h("button", { class: "row-btn news-btn", onclick: () => ctx.go("read", t.id) },
      h("span", { text: t.title }), h("span", { class: "muted small", text: "đọc ›" }))));
    vids.forEach((v) => box.append(h("div", { class: "video" },
      h("p", { class: "small", text: `Video: ${v.titleVi}` }),
      h("iframe", { src: `https://www.youtube-nocookie.com/embed/${v.videoId}`, title: v.title, loading: "lazy",
        allow: "encrypted-media; picture-in-picture", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin" }),
      h("p", { class: "muted small" }, "Nguồn: ", h("a", { href: v.url, target: "_blank", rel: "noopener noreferrer", text: v.title })))));
  }
  box.append(h("p", { class: "muted small", text: `Lấy lúc ${new Date(day.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · khoảng ${(day.costUsd * 100).toFixed(1)} xu USD · mai lấy tin mới.` }));
  return box;
}

export function pasteSection(ctx) {
  const { st, store } = ctx;
  st.pasted = st.pasted || [];
  let lang = LANGS.find((l) => st.settings.langs[l].on) || "zh";
  const sel = h("select", { "aria-label": "Thứ tiếng", onchange: (e) => { lang = e.target.value; } },
    LANGS.map((l) => h("option", { value: l, selected: l === lang, text: LANG_VI[l] })));
  const url = h("input", { type: "text", inputmode: "url", placeholder: "Dán link bài (https://…)", "aria-label": "Link bài" });
  const area = h("textarea", { rows: "3", placeholder: "…hoặc dán đoạn văn vào đây", "aria-label": "Đoạn văn" });
  const msg = h("p", { class: "small", "aria-live": "polite" });
  const btn = h("button", { class: "btn", text: "Tạo bài đọc" });
  btn.addEventListener("click", async () => {
    const u = url.value.trim(), t = area.value.trim();
    if (!u && !t) { area.focus(); return; }
    if (u && !safeUrl(u)) { msg.textContent = "Link phải bắt đầu bằng https://"; return; }
    btn.disabled = true; msg.textContent = "AI đang viết lại bài cho vừa trình độ…";
    try {
      const r = await fromPaste({ key: store.getKey(), model: st.settings.model, lang, url: u || null, text: u ? null : t });
      st.pasted.push(r.text); prune(st); ctx.save(); ctx.go("read", r.text.id);
    } catch (e) { msg.textContent = ERROR_TEXT[e.kind] || ERROR_TEXT.bad_request; btn.disabled = false; }
  });
  const recent = st.pasted.slice(-5).reverse().map((t) => h("button", { class: "row-btn news-btn", onclick: () => ctx.go("read", t.id) },
    h("span", { text: t.title }), h("span", { class: "muted small", text: LANG_VI[t.lang].replace("Tiếng ", "") })));
  return h("div", { class: "card" }, h("h2", { text: "Dán bài / dán link" }),
    h("p", { class: "muted small", text: "AI viết lại bài thành đoạn ngắn vừa sức để bấm từ, thêm thẻ, viết lại. App không lưu bản gốc." }),
    sel, url, area, h("div", { class: "row" }, btn), msg, recent);
}
