// Tiny DOM helpers. Text always goes in as text nodes (never parsed as HTML).
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
/** Inserts the app's own static SVG markup (never user or AI text). */
export function svg(markup) { const t = document.createElement("template"); t.innerHTML = markup.trim(); return t.content.firstChild; }
export const fmtDate = (d) => d ? d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" }) : "—";
export const pct = (x) => `${Math.round(x * 100)} %`;
export const WEEKDAY_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/**
 * Asks for a confirmation inside the page (no native dialog: embedded browsers suppress them).
 * Fills `slot` with the question and two buttons; `onYes` runs after the yes button.
 */
export function askInline(slot, text, yesText, onYes) {
  const clear = () => slot.replaceChildren();
  slot.replaceChildren(h("div", { class: "ask", role: "alert" }, h("p", { text }),
    h("div", { class: "row" },
      h("button", { class: "btn primary", text: yesText, onclick: () => { clear(); onYes(); } }),
      h("button", { class: "btn", text: "Thôi", onclick: clear }))));
}
