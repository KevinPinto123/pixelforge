// ops/quantize.js — spec §2. Cuantiza a EXACTAMENTE los hex de la paleta maestra
// (o subpaleta declarada). Cero color intermedio.
import { cloneImage, getPixel, setPixel, isOpaque } from '../image.js';
import { hexToRgb, rgbToHex, oklabDeltaE, rgbWeightedDelta } from '../color.js';
import { MASTER_HEXES, SNAP_TABLE, oklabOf, subpaletteOf } from '../palette.js';

const DELTA_E_REVIEW_THRESHOLD = 0.14;

function nearestHex(hex, targets, colorSpace) {
  const rgb = hexToRgb(hex);
  const oklab = oklabOf(hex);
  let best = null;
  let bestDist = Infinity;
  let bestL = Infinity;
  for (const t of targets) {
    const tOklab = oklabOf(t);
    const dist = colorSpace === 'rgb' ? rgbWeightedDelta(rgb, hexToRgb(t)) : oklabDeltaE(oklab, tOklab);
    if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) <= 1e-9 && tOklab.L < bestL)) {
      best = t;
      bestDist = dist;
      bestL = tOklab.L;
    }
  }
  return { hex: best, deltaE: oklabDeltaE(oklab, oklabOf(best)) };
}

export function quantize(img, config = {}) {
  const cfg = { palette: 'master', colorSpace: 'oklab', dither: 'none', ...config };
  let targets;
  if (Array.isArray(cfg.palette)) targets = cfg.palette.map((h) => h.toLowerCase());
  else if (cfg.subpaletteOf) targets = subpaletteOf(cfg.subpaletteOf);
  else targets = MASTER_HEXES;

  const out = cloneImage(img);
  const inputColors = new Set();
  const remapCounts = new Map(); // "from>to" -> count
  let maxDeltaE = 0;
  let pixelsOverDeltaE = 0;
  const memo = new Map(); // hex -> {hex, deltaE}

  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      if (!isOpaque(out, x, y)) continue;
      const [r, g, b] = getPixel(out, x, y);
      const fromHex = rgbToHex(r, g, b);
      inputColors.add(fromHex);

      let toHex;
      if (SNAP_TABLE[fromHex]) {
        toHex = SNAP_TABLE[fromHex]; // lookup exacto, no cuenta contra maxDeltaE
      } else {
        if (!memo.has(fromHex)) memo.set(fromHex, nearestHex(fromHex, targets, cfg.colorSpace));
        const { hex, deltaE } = memo.get(fromHex);
        toHex = hex;
        if (deltaE > maxDeltaE) maxDeltaE = deltaE;
        if (deltaE > DELTA_E_REVIEW_THRESHOLD) pixelsOverDeltaE++;
      }

      if (toHex !== fromHex) {
        const key = `${fromHex}>${toHex}`;
        remapCounts.set(key, (remapCounts.get(key) || 0) + 1);
      }
      const [tr, tg, tb] = hexToRgb(toHex);
      setPixel(out, x, y, tr, tg, tb, 255);
    }
  }

  if (cfg.maxColors) mergeToMaxColors(out, cfg.maxColors, remapCounts);

  const outputColors = new Set();
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      if (isOpaque(out, x, y)) {
        const [r, g, b] = getPixel(out, x, y);
        outputColors.add(rgbToHex(r, g, b));
      }
    }
  }

  const remapped = [...remapCounts.entries()].map(([key, count]) => {
    const [from, to] = key.split('>');
    return { from, to, count };
  });

  return {
    image: out,
    report: {
      inputColorCount: inputColors.size,
      outputColorCount: outputColors.size,
      remapped,
      maxDeltaE,
      pixelsOverDeltaE,
    },
    needsReview: maxDeltaE > DELTA_E_REVIEW_THRESHOLD,
  };
}

// maxColors: limita nº final de colores. Simplificación documentada del median-cut
// del spec §2.2.4: en vez de elegir representantes ANTES de cuantizar, fusiona por
// frecuencia DESPUÉS de cuantizar (los candidatos ya están snapeados al maestro,
// así que la fusión nunca inventa color — cumple la regla, solo cambia el orden).
function mergeToMaxColors(img, maxColors, remapCounts) {
  const freq = new Map();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!isOpaque(img, x, y)) continue;
      const [r, g, b] = getPixel(img, x, y);
      const hex = rgbToHex(r, g, b);
      freq.set(hex, (freq.get(hex) || 0) + 1);
    }
  }
  while (freq.size > maxColors) {
    let leastHex = null, leastCount = Infinity;
    for (const [hex, count] of freq) {
      if (count < leastCount) { leastCount = count; leastHex = hex; }
    }
    const remaining = [...freq.keys()].filter((h) => h !== leastHex);
    const { hex: mergeTarget } = nearestHex(leastHex, remaining, 'oklab');
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (!isOpaque(img, x, y)) continue;
        const [r, g, b] = getPixel(img, x, y);
        if (rgbToHex(r, g, b) === leastHex) {
          const [tr, tg, tb] = hexToRgb(mergeTarget);
          setPixel(img, x, y, tr, tg, tb, 255);
        }
      }
    }
    const key = `${leastHex}>${mergeTarget}`;
    remapCounts.set(key, (remapCounts.get(key) || 0) + leastCount);
    freq.delete(leastHex);
    freq.set(mergeTarget, (freq.get(mergeTarget) || 0) + leastCount);
  }
}
