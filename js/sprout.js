// "Bé Mầm", Word Garden's own garden sprite: a round seed with a face that grows with the words remembered.
// Hand-written SVG. Layering: thick outline behind, thin inner lines, one shadow layer clipped to the body.
export const SPROUT_STAGES = [
  { min: 0, name: "Hạt giống" },
  { min: 20, name: "Nảy mầm" },
  { min: 100, name: "Lá non" },
  { min: 300, name: "Nở hoa" },
];

/** Stage 1-4 from the total number of remembered words. */
export function sproutStage(remembered) {
  let s = 1;
  SPROUT_STAGES.forEach((st, i) => { if (remembered >= st.min) s = i + 1; });
  return s;
}
export const sproutName = (stage) => SPROUT_STAGES[stage - 1].name;

const INK = "#2f3a2a", LEAF = "#6fae4f", LEAF_DARK = "#4f8a3a", BODY = "#a8d37a", BLUSH = "#f4a6a0", FLOWER = "#f28c28", GLOW = "#ffd166";
const BODY_PATH = "M0 -8 C16 -8 24 6 22 18 C20 30 10 34 0 34 C-10 34 -20 30 -22 18 C-24 6 -16 -8 0 -8 Z";

function leaf(d, fill = LEAF, vein = null) {
  return `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
    (vein ? `<path d="${vein}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>` : "");
}

/** The sprite at `stage` (1-4), drawn in a -50..50 box. `id` keeps clipPath ids unique on a page. */
export function sproutSVG(stage = 1, size = 96, id = "m") {
  const parts = [];
  // Behind the body: stems and leaves that grow from the top of the head.
  if (stage === 1) {
    parts.push(`<path d="M0 -8 C-1 -14 1 -18 3 -21" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`);
    parts.push(leaf("M3 -21 C9 -27 17 -25 18 -19 C12 -15 6 -16 3 -21 Z", LEAF, "M4 -20 L15 -20"));
  }
  if (stage === 2) {
    parts.push(`<path d="M0 -8 L0 -16" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`);
    parts.push(leaf("M0 -16 C-6 -28 -20 -28 -22 -20 C-14 -12 -6 -12 0 -16 Z", LEAF, "M-2 -17 L-17 -21"));
    parts.push(leaf("M0 -16 C6 -28 20 -28 22 -20 C14 -12 6 -12 0 -16 Z", LEAF, "M2 -17 L17 -21"));
  }
  if (stage === 4) {
    parts.push(`<path d="M8 -18 C14 -26 12 -34 8 -38" fill="none" stroke="${LEAF_DARK}" stroke-width="2.4" stroke-linecap="round"/>`);
  }
  // Body: thick outline behind, fill, one clipped shadow layer, then the face.
  parts.push(`<path d="${BODY_PATH}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`);
  parts.push(`<path d="${BODY_PATH}" fill="${BODY}"/>`);
  parts.push(`<clipPath id="sp-${id}"><path d="${BODY_PATH}"/></clipPath>`);
  parts.push(`<ellipse cx="9" cy="26" rx="20" ry="14" fill="#000" opacity=".12" clip-path="url(#sp-${id})"/>`);
  parts.push(`<ellipse cx="-9" cy="2" rx="5" ry="3" fill="#fff" opacity=".45" clip-path="url(#sp-${id})"/>`);
  parts.push(`<ellipse cx="-8" cy="13" rx="2.4" ry="3" fill="${INK}"/><ellipse cx="8" cy="13" rx="2.4" ry="3" fill="${INK}"/>`);
  parts.push(`<circle cx="-7.2" cy="12" r=".9" fill="#fff"/><circle cx="8.8" cy="12" r=".9" fill="#fff"/>`);
  parts.push(`<path d="M-4 20 C-2 23 2 23 4 20" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`);
  parts.push(`<circle cx="-14" cy="19" r="3.2" fill="${BLUSH}" opacity=".75"/><circle cx="14" cy="19" r="3.2" fill="${BLUSH}" opacity=".75"/>`);
  if (stage >= 3) {
    // Little arms, then the big leaf worn as a hat.
    parts.push(`<path d="M-21 18 C-27 16 -29 11 -27 8 M21 18 C27 16 29 11 27 8" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`);
    parts.push(leaf("M-20 -2 C-14 -22 12 -28 26 -14 C14 -4 -6 2 -20 -2 Z", LEAF, "M-16 -3 C-4 -10 10 -14 22 -14"));
  }
  if (stage === 4) {
    // A small orange flower like a lantern, and a few sparks of light.
    parts.push(`<circle cx="8" cy="-41" r="8" fill="${GLOW}" opacity=".35"/>`);
    [[0, -6], [5.7, -1.9], [3.5, 4.9], [-3.5, 4.9], [-5.7, -1.9]].forEach(([x, y]) =>
      parts.push(`<circle cx="${8 + x}" cy="${-41 + y}" r="3.6" fill="${FLOWER}" stroke="${INK}" stroke-width="1.2"/>`));
    parts.push(`<circle cx="8" cy="-41" r="2.6" fill="${GLOW}"/>`);
    [[-24, -30], [28, -34], [-30, -6]].forEach(([x, y]) =>
      parts.push(`<path d="M${x} ${y - 4} L${x + 1} ${y - 1} L${x + 4} ${y} L${x + 1} ${y + 1} L${x} ${y + 4} L${x - 1} ${y + 1} L${x - 4} ${y} L${x - 1} ${y - 1} Z" fill="${GLOW}"/>`));
  }
  return `<svg class="sprout-svg" viewBox="-50 -50 100 100" width="${size}" height="${size}" role="img" aria-label="Bé Mầm: ${sproutName(stage)}">${parts.join("")}</svg>`;
}

/** Lantern-theme stamp: a warm red ring with Bé Mầm inside and the word XONG. */
export function sproutStampSVG(stage, rot = -6, size = 132, id = "st") {
  const inner = sproutSVG(stage, 66, id).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg class="stamp-svg" viewBox="-60 -60 120 120" width="${size}" height="${size}" role="img" aria-label="Con dấu: xong bài hôm nay">
  <g transform="rotate(${rot})"><circle r="54" fill="none" stroke="var(--stamp)" stroke-width="5"/>
  <circle r="46" fill="none" stroke="var(--stamp)" stroke-width="1.6" stroke-dasharray="3 3.5"/>
  <g transform="translate(0 -3) scale(.6)">${inner}</g>
  <text y="42" text-anchor="middle" fill="var(--stamp)" font-size="13" font-weight="800" letter-spacing="3" font-family="system-ui, sans-serif">XONG</text></g></svg>`;
}

/** Floating decorations for the lantern theme: three paper lanterns and two leaves (aria-hidden, no text). */
export function lanternDecoSVG() {
  const lantern = (cls) => `<svg class="deco-lantern ${cls}" viewBox="-20 -30 40 64" aria-hidden="true">
    <circle cy="2" r="19" fill="#ffd166" opacity=".28"/>
    <path d="M0 -30 L0 -22" stroke="#3a2a1a" stroke-width="1.5"/>
    <rect x="-7" y="-22" width="14" height="4" rx="1.5" fill="#3a2a1a"/>
    <path d="M-7 -18 C-16 -12 -16 14 -7 20 L7 20 C16 14 16 -12 7 -18 Z" fill="#e4572e" stroke="#7a2a16" stroke-width="1.4"/>
    <path d="M-3 -18 C-7 -8 -7 10 -3 20 M3 -18 C7 -8 7 10 3 20" fill="none" stroke="#f28c28" stroke-width="1.4"/>
    <ellipse cx="0" cy="2" rx="5" ry="9" fill="#ffd166" opacity=".55"/>
    <rect x="-6" y="20" width="12" height="3.5" rx="1.5" fill="#3a2a1a"/>
    <path d="M0 23.5 L0 31" stroke="#f28c28" stroke-width="2" stroke-linecap="round"/></svg>`;
  const leafEl = (cls) => `<svg class="deco-leaf ${cls}" viewBox="-10 -10 20 20" aria-hidden="true">
    <path d="M-8 6 C-8 -4 0 -9 8 -8 C8 0 2 7 -8 6 Z" fill="#6fae4f" stroke="#2f3a2a" stroke-width="1"/>
    <path d="M-6 4 L5 -6" stroke="#2f3a2a" stroke-width=".8" opacity=".6"/></svg>`;
  // Positions and sizes live in the stylesheet (the page policy blocks inline style attributes).
  return `<div class="deco" aria-hidden="true">${lantern("l1")}${lantern("l2")}${lantern("l3")}${leafEl("f1")}${leafEl("f2")}</div>`;
}
