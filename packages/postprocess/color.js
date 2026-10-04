// color.js — hex/rgb/OKLab utilities. Cero dependencias externas (spec §1: kernels de
// pixel en TS/JS puro sobre Uint8ClampedArray).

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r, g, b) {
  const c = (n) => n.toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Bjorn Ottosson OKLab (https://bottosson.github.io/posts/oklab/), linear sRGB in.
function linearToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function rgbToOklab(r, g, b) {
  return linearToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
}

export function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToOklab(r, g, b);
}

export function oklabDeltaE(c1, c2) {
  return Math.sqrt((c1.L - c2.L) ** 2 + (c1.a - c2.a) ** 2 + (c1.b - c2.b) ** 2);
}

// Fallback ponderado RGB (spec §2.2.2): (2*dR^2 + 4*dG^2 + 3*dB^2)
export function rgbWeightedDelta([r1, g1, b1], [r2, g2, b2]) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

export function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
