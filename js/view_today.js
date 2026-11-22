// "Hôm nay": stamp, streak, today's plan, early warning when the goal does not fit the week.
import { h, svg, fmtDate, WEEKDAY_VI } from "./ui.js";
import { LANG_VI, dayKey } from "./store.js";
import { todayPlan, forecasts } from "./progress.js";
import { minutesOn } from "./planner.js";
import { stampSVG, streak } from "./stamp.js";
import { newCards } from "./cards.js";

export function viewToday(ctx) {
  const { st } = ctx;
  const now = new Date();
  const p = todayPlan(st, ctx.packs, now);
  const day = st.days[dayKey(now)] || { reviews: 0 };
  const mins = minutesOn(st.settings, now);
  const newTotal = Object.values(p.newLeft).reduce((a, b) => a + b, 0);
  const unlocked = newCards(st, now).filter((id) => id.endsWith("|recall")).length;
  const out = h("section", {});

  out.append(h("header", { class: "hello" },
    h("h1", { text: `${WEEKDAY_VI[now.getDay()]}, ${fmtDate(now)}` }),
    h("p", { class: "muted", text: mins ? `Hôm nay có ${mins} phút học, khoảng ${Math.round(p.plan.cardMinutes)} phút cho thẻ.` : "Hôm nay là ngày nghỉ. Nghỉ cũng không mất chuỗi." })));

  const stampBox = h("div", { class: "card stamp-box" });
  if (day.stamp) {
    stampBox.append(svg(stampSVG(-8, 132)), h("p", { class: "big", text: "Xong bài hôm nay rồi!" }));
  } else {
    stampBox.append(h("div", { class: "stamp-empty", "aria-hidden": "true" }),
      h("p", { text: "Ôn xong các thẻ đến hạn để nhận con dấu hôm nay." }));
  }
  const s = streak(st, st.settings, now);
  stampBox.append(h("p", { class: "muted", text: s ? `Chuỗi: ${s} buổi học liền.` : "Chưa có chuỗi. Bắt đầu từ hôm nay nhé." }));
  out.append(stampBox);
  if (st.settings.langs.zh.on && ctx.packs.zh.meta.missing) out.append(h("div", { class: "card warn-soft" },
    h("p", { text: "Chưa có gói từ tiếng Trung. Tiếng Nhật và tiếng Hàn vẫn học bình thường." }),
    h("button", { class: "btn", onclick: () => ctx.go("settings"), text: "Nhập gói tiếng Trung" })));

  const todo = h("div", { class: "card" },
    h("h2", { text: "Việc hôm nay" }),
    h("p", {}, h("b", { text: String(p.due.length + unlocked) }), " thẻ cần ôn",
      p.due.length ? ` (khoảng ${Math.max(1, Math.round(p.plan.reviewMinutes))} phút)` : ""),
    h("p", {}, h("b", { text: String(newTotal) }), " từ mới: ",
      Object.entries(p.newLeft).map(([l, n]) => `${LANG_VI[l].replace("Tiếng ", "")} ${n}`).join(" · ")));
  if (p.plan.blocked === "overdue") todo.append(h("p", { class: "note", text: "Thẻ cần ôn đã chiếm hết thời gian cho thẻ, nên hôm nay không thêm từ mới. Thẻ còn lại để mai, không dồn." }));
  todo.append(h("button", { class: "btn primary", onclick: () => ctx.go("review"), text: p.due.length + unlocked + newTotal ? "Bắt đầu ôn" : "Ôn thêm (không bắt buộc)" }));
  out.append(todo);

  if (!p.feas.fits) {
    out.append(h("div", { class: "card warn-soft" },
      h("h2", { text: "Mục tiêu chưa vừa lịch" }),
      h("p", { text: `Để kịp mọi hạn, mỗi ngày cần khoảng ${Math.round(p.feas.needMinutes)} phút cho thẻ, mà lịch đang dành ${Math.round(p.feas.cardMinutes)} phút (trong ${Math.round(p.feas.allMinutes)} phút học trung bình mỗi ngày).` }),
      h("p", { text: "App sẽ ưu tiên tiếng Trung, rồi tiếng Nhật, rồi tiếng Hàn. Xem màn Lịch để thấy ngày xong dự kiến và các cách gỡ." }),
      h("p", { class: "muted", text: "Đây là ước tính thô ban đầu; sau 2–3 tuần app tính lại bằng tốc độ thật của bạn." })));
  }
  const late = Object.values(forecasts(st, p, now)).map((f) => f.advice).filter(Boolean);
  if (late.length) out.append(h("p", { class: "note link", onclick: () => ctx.go("week"), text: `Có ${late.length} thứ tiếng dự kiến trễ hạn. Bấm để xem đề xuất.` }));

  const c = p.counts;
  out.append(h("div", { class: "card" }, h("h2", { text: "Tiến độ" }),
    Object.keys(c).map((l) => h("p", {}, h("span", { class: "lang-dot " + l }), `${LANG_VI[l]}: nhớ ${c[l].remembered}, đã gặp ${c[l].seen} / mục tiêu ${st.settings.langs[l].target}`))));
  return out;
}
