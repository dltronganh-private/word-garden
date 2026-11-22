// Reading texts: tokens with tap-to-look-up, and how much of a text the learner already knows.
const PUNCT = /^[\s\p{P}\p{S}]+$/u;

/**
 * Splits a text's token string. Each token: { surface, lemma, kind, word?, gloss? }
 * kind: "punct" | "gloss" (explained by the text) | "pack" (a pack word) | "plain" (basic word, assumed known).
 */
export function parseText(text, pack) {
  return text.tokens.split("|").map((raw) => {
    const [surface, lemmaRaw] = raw.split("@");
    const lemma = lemmaRaw || surface;
    if (PUNCT.test(surface)) return { surface, lemma, kind: "punct" };
    if (text.gloss && text.gloss[lemma]) return { surface, lemma, kind: "gloss", gloss: text.gloss[lemma] };
    const w = pack.byHead.get(lemma);
    if (w) return { surface, lemma, kind: "pack", word: w };
    return { surface, lemma, kind: "plain" };
  });
}

/**
 * Share of word tokens the learner knows (basic words count as known; pack and glossary words count when
 * remembered / added). `knows(token)` decides for pack and gloss tokens.
 */
export function coverage(tokens, knows) {
  const words = tokens.filter((t) => t.kind !== "punct");
  if (!words.length) return 1;
  const known = words.filter((t) => t.kind === "plain" || knows(t)).length;
  return known / words.length;
}

/** Joins tokens back into display text (Korean keeps no extra spaces either: tokens carry their own). */
export function plainText(tokens) { return tokens.map((t) => t.surface).join(""); }
