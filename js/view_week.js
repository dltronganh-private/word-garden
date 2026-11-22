// "Lịch": this week's stamps, minutes per day, finish-date forecast per language, and what to do if late.
import { h, svg, fmtDate, WEEKDAY_VI, pct } from "./ui.js";
import { LANG_VI } from "./store.js";
import { todayPlan, forecasts } from "./progress.js";
import { minutesOn, addDays } from "./planner.js";
import { weekDays, dayStatus, pawSVG, streak } from "./stamp.js";

const STATUS_VI = { stamp: "đã xong", rest: "nghỉ", missed: "bỏ lỡ", today: "hôm nay", future: "", before: "" };

export function viewWeek(ctx) {
  const { st } = ctx;
  const now = new Date();
  const out = h("section", {}, h("h1", { text: "Lịch tuần" }));
  const grid = h("div", { class: "week" });
  weekDays(now).forEach((d) => {
    const s = dayStatus(st, st.settings, d, now);
    grid.append(h("div", { class: `day ${s}` },
      h("span", { class: "dname", text: WEEKDAY_VI[d.getDay()] }),
      h("span", { class: "dnum", text: String(d.getDate()) }),
      s === "stamp" ? svg(pawSVG(26)) : h("span", { class: "dot", "aria-hidden": "true" }),
      h("span", { class: "dmin", text: minutesOn(st.settings, d) ? `${minutesOn(st.settings, d)}′` : "nghỉ" }),
      h("span", { class: "sr", text: STATUS_VI[s] })));
  });
  out.append(h("div", { class: "card" }, grid, h("p", { class: "muted small", text: `Chuỗi hiện tại: ${streak(st, st.settings, now)} buổi. Ngày nghỉ không làm mất chuỗi.` })));

  const p = todayPlan(st, ctx.packs, now);
  const fc = forecasts(st, p, now);
  for (const [l, f] of Object.entries(fc)) {
    const cfg = st.settings.langs[l];
    const card = h("div", { class: "card" }, h("h2", {}, h("span", { class: "lang-dot " + l }), LANG_VI[l]),
      h("p", { text: `Hạn: ${fmtDate(new Date(cfg.deadline))} (được trễ ${st.settings.graceDays} ngày). Còn ${p.remaining[l]} từ.` }),
      h("p", {}, "Ngày xong dự kiến: ", h("b", { text: f.p50 ? fmtDate(f.p50) : "chưa có (lịch hiện tại không còn phút nào cho thứ tiếng này)" }),
        f.p80 ? ` · chắc 80 %: ${fmtDate(f.p80)}` : ""),
      h("p", { class: "muted small", text: f.initial ? "Ước tính ban đầu (chưa đủ 3 tuần dữ liệu), dựa trên thời gian bạn đặt cho thẻ." : "Tính từ tốc độ thật các tuần đã qua (100 lần mô phỏng)." }));
    if (f.advice) {
      const a = f.advice;
      card.append(h("div", { class: "warn-soft inner" },
        h("p", { text: `Dự kiến trễ quá ${fmtDate(a.limit)}.` }),
        a.canCut ? h("p", { text: `Cách 1: bớt khoảng ${a.cutWords} từ ${LANG_VI[l].toLowerCase()} khỏi mục tiêu.` }) : null,
        h("p", { text: `Cách ${a.canCut ? 2 : 1}: thêm khoảng ${a.extraMinutesPerWeek} phút học mỗi tuần.` }),
        a.canCut ? h("button", { class: "btn", text: `Đồng ý bớt ${a.cutWords} từ`, onclick: () => {
          cfg.target = Math.max(0, cfg.target - a.cutWords); ctx.save(); ctx.render();
        } }) : h("p", { class: "muted small", text: "App không tự bớt thứ tiếng ưu tiên số một." })));
    }
    out.append(card);
  }
  const last = addDays(now, -27);
  const recent = Object.entries(st.days).filter(([k]) => new Date(k) >= last);
  const reviews = recent.reduce((s, [, d]) => s + d.reviews, 0);
  const good = st.log.filter((x) => new Date(x.at) >= last && x.grade >= 3).length;
  const total = st.log.filter((x) => new Date(x.at) >= last).length;
  out.append(h("div", { class: "card" }, h("h2", { text: "4 tuần gần đây" }),
    h("p", { text: `${recent.filter(([, d]) => d.stamp).length} ngày có dấu · ${reviews} lượt ôn · nhớ khi ôn ${total ? pct(good / total) : "—"}` })));
  return out;
}
