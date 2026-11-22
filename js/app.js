// App shell: loads state, packs and texts, then shows one view at a time with a bottom tab bar.
import { makeStore } from "./store.js";
import { initScheduler } from "./cards.js";
import { loadPacks } from "./words.js";
import { counts, snapshot } from "./progress.js";
import { h, svg } from "./ui.js";
import { lanternDecoSVG } from "./sprout.js";
import { viewToday } from "./view_today.js";
import { viewReview } from "./view_review.js";
import { viewRead } from "./view_read.js";
import { viewWeek } from "./view_week.js";
import { viewSettings, viewSources } from "./view_settings.js";
import { viewEval } from "./view_eval.js";
import { viewTranslate } from "./view_translate.js";

const VIEWS = { today: viewToday, review: viewReview, read: viewRead, week: viewWeek, settings: viewSettings, sources: viewSources, eval: viewEval, translate: viewTranslate };
const TABS = [["today", "Hôm nay"], ["review", "Ôn thẻ"], ["read", "Đọc"], ["week", "Lịch"], ["settings", "Cài đặt"]];

const getJSON = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); };

async function main() {
  const root = document.getElementById("app");
  const store = makeStore(window.localStorage);
  const st = store.load();
  const ctx = { st, store, packs: null, texts: [], view: "today", arg: null, warn: [] };
  if (!store.available()) ctx.warn.push("Trình duyệt đang chặn lưu dữ liệu (chế độ ẩn danh?). Tiến độ sẽ mất khi đóng trang.");
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* only a request */ }

  try {
    await initScheduler(st.settings.retention);
    ctx.packs = await loadPacks(getJSON, store);
    ctx.texts = (await getJSON("data/texts.json")).texts;
  } catch (e) {
    root.replaceChildren(h("p", { class: "card warn", text: "Không tải được dữ liệu của app. Tải lại trang thử xem." }));
    return;
  }

  ctx.save = () => { if (!store.save(st)) ctx.warn.push("Không lưu được tiến độ (bộ nhớ trình duyệt đầy hoặc bị chặn)."); };
  ctx.go = (view, arg = null) => { ctx.view = view; ctx.arg = arg; render(); window.scrollTo(0, 0); };

  snapshot(st, counts(st, ctx.packs));
  ctx.save();

  function render() {
    const body = h("main", { class: "view" });
    if (ctx.warn.length) body.append(h("p", { class: "card warn", role: "alert", text: ctx.warn[ctx.warn.length - 1] }));
    body.append(VIEWS[ctx.view](ctx));
    const nav = h("nav", { class: "tabs", "aria-label": "Mục chính" },
      TABS.map(([id, label]) => h("button", {
        class: "tab" + (ctx.view === id || (id === "settings" && (ctx.view === "sources" || ctx.view === "eval" || ctx.view === "translate")) ? " on" : ""),
        "aria-current": ctx.view === id ? "page" : null, onclick: () => ctx.go(id), text: label })));
    // The theme lives on <html> so the stylesheet can switch everything at once; the lantern theme adds drifting decorations.
    const theme = st.settings.theme === "lantern" ? "lantern" : "desk";
    document.documentElement.dataset.theme = theme;
    if (theme === "lantern") root.replaceChildren(svg(lanternDecoSVG()), body, nav); else root.replaceChildren(body, nav);
  }
  ctx.render = render;
  render();
}
main();
