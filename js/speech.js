// Read-aloud with the browser's own voices (Web Speech API, speechSynthesis): free, no key, works offline when the
// device has the voice. iOS starts speech only after a tap; Chrome lists voices only after "voiceschanged";
// a voice can speak even when it is missing from the list (seen on iOS), so a missing voice gives a gentle note, not an error.
export const SPEECH_TAG = { zh: "zh-CN", ja: "ja-JP", ko: "ko-KR" };
export const RATES = { slow: 0.7, normal: 1 };

export const speechAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

let voices = [];
function refreshVoices() { try { voices = window.speechSynthesis.getVoices() || []; } catch (e) { voices = []; } return voices; }
if (speechAvailable()) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
}

/** Best listed voice for the language (exact tag first, then any voice of the language), or null. */
export function voiceFor(lang, list = voices) {
  const tag = SPEECH_TAG[lang], base = tag.slice(0, 2);
  return list.find((v) => v.lang === tag || v.lang === tag.replace("-", "_"))
    || list.find((v) => (v.lang || "").toLowerCase().startsWith(base)) || null;
}

/** Splits a text into sentences, keeping the end punctuation with each sentence. */
export function sentences(text) {
  return (String(text).match(/[^。！？!?.\n]+[。！？!?.]*/g) || []).map((s) => s.trim()).filter((s) => s.replace(/[。！？!?.\s]/g, ""));
}

/** Speaks a list of texts in order. Returns a stop function. Interrupted / cancelled errors are normal when stopping. */
export function speak(texts, lang, rate = "normal", onDone = () => {}) {
  if (!speechAvailable()) { onDone("unavailable"); return () => {}; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = voiceFor(lang, refreshVoices());
  const list = Array.isArray(texts) ? texts : [texts];
  let stopped = false;
  list.forEach((t, i) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = SPEECH_TAG[lang];
    if (voice) u.voice = voice;
    u.rate = RATES[rate] || 1;
    if (i === list.length - 1) u.onend = () => { if (!stopped) onDone("done"); };
    u.onerror = (e) => { if (!stopped && e.error !== "interrupted" && e.error !== "canceled") onDone("error"); };
    synth.speak(u);
  });
  return () => { stopped = true; synth.cancel(); };
}
