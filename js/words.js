// Word packs (data/<lang>.json) plus the learner's own words added from reading.
import { LANGS } from "./store.js";

/** Loads every pack; `fetchJSON` is injectable for tests. Returns { zh: {meta, words, byId, byHead}, ... }. */
// The Chinese pack is not shipped with the page (the HSK level lists are not openly licensed): the learner
// imports it once from a file and it is kept in this browser.
export const IMPORTED = ["zh"];

export async function loadPacks(fetchJSON, store) {
  const out = {};
  for (const l of LANGS) {
    if (IMPORTED.includes(l)) {
      const p = store.getPack(l);
      out[l] = indexPack(p || { lang: l, meta: { missing: true }, words: [] });
    } else out[l] = indexPack(await fetchJSON(`data/${l}.json`));
  }
  return out;
}

/** Checks an imported pack file; returns the pack or throws a Vietnamese message. */
export function validatePack(text, lang) {
  let p;
  try { p = JSON.parse(text); } catch (e) { throw new Error("File không phải JSON hợp lệ."); }
  if (!p || p.lang !== lang || !Array.isArray(p.words) || !p.words.length) throw new Error("File này không phải gói từ đúng thứ tiếng.");
  const bad = p.words.find((w) => !w || typeof w.id !== "string" || !w.id.startsWith(`${lang}:`) || !w.head || !(w.meaningVi || w.meaningEn));
  if (bad) throw new Error("Gói từ có mục bị thiếu thông tin.");
  return { lang: p.lang, meta: p.meta || {}, words: p.words };
}
export function indexPack(pack) {
  const byId = new Map(), byHead = new Map();
  pack.words.forEach((w) => { byId.set(w.id, w); if (!byHead.has(w.head)) byHead.set(w.head, w); });
  return { ...pack, byId, byHead };
}

/** A word by id: pack word, or a custom word the learner added (st.custom). */
export function wordById(packs, st, id) {
  const l = id.slice(0, 2);
  return (packs[l] && packs[l].byId.get(id)) || st.custom[id] || null;
}

/** Adds a reading-glossary word as the learner's own word. Returns its id. */
export function addCustom(st, lang, head, reading, meaningVi) {
  const id = `${lang}:${head}`;
  if (!st.custom[id]) st.custom[id] = { id, head, reading, meaningVi, meaningEn: null, hanviet: null, hanvietStatus: "none", custom: true };
  return id;
}

/** Next pack words not yet started or known, in pack order. */
export function nextNewWords(packs, st, lang, n) {
  const out = [];
  for (const w of packs[lang].words) {
    if (out.length >= n) break;
    if (!st.known[w.id] && !st.cards[`${w.id}|recog`]) out.push(w.id);
  }
  return out;
}

/** How sure a Wiktionary reading is: whole word listed, character by character, or a character with several readings. */
export const HV_NOTE = { word: "", char: "theo từng chữ", "char-head": "theo từng chữ, chưa chắc", "char-multi": "chữ nhiều âm, có thể sai" };

/** Hán Việt to show: the learner's own note first, then the reading from the word pack (labelled by how sure it is). */
export function hanvietFor(word, st) {
  const note = st.notes[word.id];
  if (note && note.hanviet) return { text: note.hanviet, mine: true };
  if (st.settings.showHanviet && word.hanviet) return { text: word.hanviet, mine: false, note: word.hanvietStatus in HV_NOTE ? HV_NOTE[word.hanvietStatus] : "chưa kiểm" };
  return null;
}
