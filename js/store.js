// Saved state in localStorage (prefixed, versioned key), export/import as JSON.
// The API key lives under its own key and is never part of the export.
import { DEFAULT_MODEL } from "./api.js";
export const STATE_KEY = "ahnn.state.v1";
export const API_KEY_KEY = "ahnn.apikey";
export const PACK_KEY = "ahnn.pack.";
export const LANGS = ["zh", "ja", "ko"];
export const LANG_VI = { zh: "Tiếng Trung", ja: "Tiếng Nhật", ko: "Tiếng Hàn" };
export const LANG_TAG = { zh: "zh-Hans", ja: "ja", ko: "ko" };

export function defaultSettings() {
  return {
    // Minutes per weekday, JS getDay() order: 0 = Sunday.
    minutes: [0, 60, 180, 60, 180, 60, 180],
    cardShare: 0.4,
    secPerReview: 12,
    retention: 0.9,
    langs: {
      zh: { on: true, deadline: "2027-06-01", target: 2345 },
      ja: { on: true, deadline: "2027-08-31", target: 3542 },
      ko: { on: true, deadline: "2027-11-30", target: 3000 },
    },
    graceDays: 30,
    priority: ["zh", "ja", "ko"],
    model: DEFAULT_MODEL,
    showHanviet: true,
    theme: "desk", // "desk" (study desk) or "lantern" (lantern garden)
    showWeakEdits: false,
  };
}

export function fresh(now = new Date()) {
  return { version: 1, created: now.toISOString(), settings: defaultSettings(),
    cards: {}, known: {}, custom: {}, notes: {}, log: [], days: {}, writings: [], forecasts: [], warnedWeek: "", news: {}, pasted: [] };
}

/** Fills fields added after a state was saved, so old saves keep loading. */
export function migrate(st) {
  const base = fresh(new Date(st.created || Date.now()));
  const out = { ...base, ...st };
  out.settings = { ...base.settings, ...(st.settings || {}) };
  out.settings.langs = { ...base.settings.langs, ...((st.settings || {}).langs || {}) };
  return out;
}

/** Store over any Storage-like object (localStorage in the app, a Map wrapper in tests). */
export function makeStore(storage) {
  return {
    available() {
      try { storage.setItem("ahnn.probe", "1"); storage.removeItem("ahnn.probe"); return true; } catch (e) { return false; }
    },
    load() {
      try { const raw = storage.getItem(STATE_KEY); return raw ? migrate(JSON.parse(raw)) : fresh(); } catch (e) { return fresh(); }
    },
    save(st) {
      try { storage.setItem(STATE_KEY, JSON.stringify(st)); return true; } catch (e) { return false; }
    },
    getPack(lang) { try { const raw = storage.getItem(PACK_KEY + lang); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } },
    setPack(lang, pack) { try { storage.setItem(PACK_KEY + lang, JSON.stringify(pack)); return true; } catch (e) { return false; } },
    clearPack(lang) { try { storage.removeItem(PACK_KEY + lang); return true; } catch (e) { return false; } },
    getKey() { try { return storage.getItem(API_KEY_KEY) || ""; } catch (e) { return ""; } },
    setKey(k) { try { storage.setItem(API_KEY_KEY, String(k || "").trim()); return true; } catch (e) { return false; } },
    clearKey() { try { storage.removeItem(API_KEY_KEY); return true; } catch (e) { return false; } },
  };
}

/** Export text: the whole learning state, never the key. */
export function exportJSON(st) {
  const copy = JSON.parse(JSON.stringify(st));
  delete copy.apiKey;
  return JSON.stringify({ app: "ahnn", exported: new Date().toISOString(), state: copy });
}

/** Parses an export; throws a Vietnamese message the UI can show. */
export function importJSON(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error("File không phải JSON hợp lệ."); }
  if (!obj || obj.app !== "ahnn" || !obj.state || !obj.state.cards) throw new Error("File này không phải bản sao lưu của app.");
  return migrate(obj.state);
}

/** Local calendar day "YYYY-MM-DD" (the learner's own time zone). */
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function dayRecord(st, key) {
  if (!st.days[key]) st.days[key] = { reviews: 0, newCards: 0, ms: 0, stamp: false, cleared: false };
  return st.days[key];
}
