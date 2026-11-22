// The only place that talks to the AI API (Anthropic Messages API). Raw fetch: the page loads no external code.
// The key comes from the caller (typed by the user, kept in this browser) and is never logged.
export const API_URL = "https://api.anthropic.com/v1/messages";
export const API_VERSION = "2026-10-21";
export const DEFAULT_MODEL = "claude-opus-5-5";
export const MODELS = {
  "claude-opus-5-5": { name: "Opus 5.5", inUsd: 4, outUsd: 20, fallback: true },
  "claude-sonnet-5-5": { name: "Sonnet 5.5", inUsd: 2, outUsd: 10, fallback: true },
  "claude-haiku-5-5": { name: "Haiku 5.5", inUsd: 0.1, outUsd: 0.5, fallback: false },
};

export class ClaudeError extends Error {
  constructor(kind, message, status) { super(message); this.kind = kind; this.status = status; }
}

/** Builds the request body. Sampling parameters are not sent: this API version rejects them. */
export function buildBody({ model, system, user, schema, effort = "medium", maxTokens = 16000 }) {
  const body = {
    model, max_tokens: maxTokens, system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: { type: "json_schema", schema } },
  };
  // Server-side fallback when a safety classifier declines (supported on Opus 5.5 / Sonnet 5.5).
  if (MODELS[model] && MODELS[model].fallback) body.fallbacks = "default";
  return body;
}

export function buildHeaders(key, model) {
  const h = {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": API_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (MODELS[model] && MODELS[model].fallback) h["anthropic-beta"] = "server-side-fallback-2026-07-01";
  return h;
}

/** Maps an HTTP error to a kind the UI can explain in plain words. */
export function classifyError(status, payload) {
  const err = (payload && payload.error) || {};
  const msg = err.message || "";
  if (status === 401) return "bad_key";
  if (status === 403) return "forbidden";
  if (status === 400 && /reached your specified API usage limits/i.test(msg)) return "spend_limit";
  if (status === 429 && err.details && err.details.error_code === "enforced_spend_limit_reached") return "spend_limit";
  if (status === 429) return "rate_limit";
  if (status === 402) return "billing";
  if (status === 529 || status >= 500) return "overloaded";
  return "bad_request";
}

/** Reads the JSON answer out of a response. Throws ClaudeError for refusals and cut-off output. */
export function parseResponse(data) {
  if (data.stop_reason === "refusal") throw new ClaudeError("refusal", "refusal");
  if (data.stop_reason === "max_tokens") throw new ClaudeError("truncated", "max_tokens");
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  try { return JSON.parse(text); } catch (e) { throw new ClaudeError("bad_json", "invalid JSON"); }
}

/** One call. `fetchImpl` is injectable for tests. Returns { json, usage, model }. */
export async function callClaude(opts, fetchImpl = fetch) {
  if (!opts.key) throw new ClaudeError("no_key", "no key");
  let res;
  try {
    res = await fetchImpl(API_URL, {
      method: "POST", headers: buildHeaders(opts.key, opts.model), body: JSON.stringify(buildBody(opts)),
    });
  } catch (e) {
    // A CORS block or no network both end here (the browser hides which one).
    throw new ClaudeError("network", "network");
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new ClaudeError(classifyError(res.status, data), (data && data.error && data.error.message) || "error", res.status);
  return { json: parseResponse(data), usage: data.usage || {}, model: data.model };
}

/** Cost in USD of one usage record (thinking is billed as output). */
export function costUsd(model, usage) {
  const m = MODELS[model] || MODELS["claude-opus-5-5"];
  return ((usage.input_tokens || 0) * m.inUsd + (usage.output_tokens || 0) * m.outUsd) / 1e6;
}

export const ERROR_TEXT = {
  no_key: "Chưa có khoá API. Vào Cài đặt để dán khoá.",
  bad_key: "Khoá API không đúng hoặc đã bị xoá. Kiểm lại khoá trong Cài đặt.",
  forbidden: "Khoá này không có quyền gọi mô hình. Kiểm lại workspace của khoá.",
  spend_limit: "Đã chạm hạn chi tiêu tháng này. Góp ý AI tạm dừng; thẻ, đọc và lịch vẫn dùng bình thường.",
  rate_limit: "Gọi nhiều quá trong một lúc. Đợi một phút rồi thử lại.",
  billing: "Tài khoản API hết tín dụng.",
  overloaded: "Máy chủ AI đang bận. Thử lại sau ít phút.",
  network: "Không kết nối được tới máy chủ AI (mất mạng hoặc bị chặn).",
  refusal: "AI từ chối trả lời bài này.",
  truncated: "Câu trả lời bị cắt giữa chừng. Thử lại với bài ngắn hơn.",
  bad_json: "Câu trả lời không đúng khuôn. Thử lại.",
  bad_request: "Yêu cầu bị từ chối. Thử lại; nếu lặp lại thì báo cho người làm app.",
};
