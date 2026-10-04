// ops/validate.js — spec §7. No muta píxeles. Corre sobre un set de frames ya
// post-procesados (pasos 1-6) y produce ConsistencyReport (pass|warn|fail).
import { boundingBox, opaqueCount, getPixel, isOpaque, connectedComponents, resizeNearest, alignedIoU, flipH, iou } from '../image.js';
import { rgbToHex } from '../color.js';
import { MASTER_HEXES, subpaletteOf } from '../palette.js';

// Thresholds NO hardcodeados en la lógica de decisión — viven acá, calibrables
// contra el golden set (spec §7.5: "si no da pass, el threshold está mal, no Tavo").
export const DEFAULT_THRESHOLDS = {
  // areaWarnMax: absoluto, animación (spec literal, misma pose/direccion).
  // areaWarnMaxDirsFraction: entre direcciones la oclusion es legitima (de espaldas
  // no se ve piel/cara, spec §7.2 nota de pal.proportion) -> limite relativo al
  // conteo opaco del frame en vez de px fijos; calibrado contra el golden set Tavo
  // (skin_light ~15% del sprite solo-de-frente/lateral, ausente de espaldas).
  pal: { areaWarnMax: 3, areaWarnMaxDirsFraction: 0.15, proportionTolerance: 0.4 },
  size: {
    bboxAnimWarn: 2, bboxAnimFail: 4,
    bboxDirsWarn: 3, bboxDirsFail: 4,
    baselineFail: 2, // >2 fail, ==2 warn (salvo allowBaselineBounce)
    headFail: 2,     // >2 fail, ==2 warn
    pixelcountAnimWarn: 0.15, pixelcountAnimFail: 0.3,
    pixelcountDirsWarn: 0.3, pixelcountDirsFail: 0.45,
    canonSizes: [[16, 16], [20, 20], [24, 24], [32, 32]],
  },
  sil: {
    animPass: 0.8, animFail: 0.7, animPassMicroIdle: 0.9,
    dirsDownUpPass: 0.85, dirsSideVsDownPass: 0.55, warnBand: 0.15,
    flipPass: 0.95, flipWarn: 0.9,
    legiblePass: 0.6,
  },
};

function histogram(img) {
  const h = new Map();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!isOpaque(img, x, y)) continue;
      const [r, g, b] = getPixel(img, x, y);
      const hex = rgbToHex(r, g, b);
      h.set(hex, (h.get(hex) || 0) + 1);
    }
  }
  return h;
}

function check(id, level, metric, threshold, details) {
  return { id, level, metric, threshold, details };
}

export function validate(input, thresholds = DEFAULT_THRESHOLDS) {
  const { frames, kind, charId } = input;
  const T = thresholds;
  const enriched = frames.map((f) => ({
    ...f,
    bbox: boundingBox(f.image),
    pixelCount: opaqueCount(f.image),
    histogram: histogram(f.image),
    components: connectedComponents(f.image, 8),
  }));

  const checks = [];
  checks.push(checkPalMaster(enriched));
  checks.push(checkPalIdentity(enriched, kind, T.pal));
  checks.push(checkPalProportion(enriched, kind, T.pal));
  checks.push(checkPalSubpalette(enriched, charId, T.pal));
  checks.push(checkSizeCanvas(enriched));
  checks.push(checkSizeCanon(enriched, input, T.size));
  checks.push(checkSizeBbox(enriched, kind, T.size));
  checks.push(checkSizeBaseline(enriched, input, T.size));
  checks.push(checkSizePixelcount(enriched, kind, T.size));
  checks.push(checkSilAnim(enriched, kind, input, T.sil));
  checks.push(checkSilDirs(enriched, kind, T.sil));
  checks.push(checkSilFlip(enriched, T.sil));
  checks.push(checkSilHead(enriched, T.size));
  checks.push(checkSilIslands(enriched, input));
  checks.push(checkSilLegible(enriched, T.sil));

  const verdict = checks.some((c) => c.level === 'fail') ? 'fail'
    : checks.some((c) => c.level === 'warn') ? 'warn' : 'pass';

  return { verdict, checks };
}

// --- PALETA -----------------------------------------------------------------

function checkPalMaster(frames) {
  const masterSet = new Set(MASTER_HEXES);
  const offenders = [];
  for (const f of frames) {
    for (const hex of f.histogram.keys()) {
      if (!masterSet.has(hex.toLowerCase())) offenders.push({ frame: f.name, hex });
    }
  }
  return check('pal.master', offenders.length ? 'fail' : 'pass', offenders.length, 0, { offenders });
}

function checkPalIdentity(frames, kind, cfg) {
  const allHexes = new Set();
  for (const f of frames) for (const hex of f.histogram.keys()) allHexes.add(hex);
  let worst = 'pass';
  const details = [];
  for (const hex of allHexes) {
    const present = frames.filter((f) => f.histogram.has(hex));
    const absent = frames.filter((f) => !f.histogram.has(hex));
    if (present.length === 0 || absent.length === 0) continue; // en todos o en ninguno: ok
    const maxArea = Math.max(...present.map((f) => f.histogram.get(hex)));
    let level;
    if (kind === 'directions') {
      const frame = present.find((f) => f.histogram.get(hex) === maxArea);
      const fraction = maxArea / Math.max(1, frame.pixelCount);
      level = fraction > cfg.areaWarnMaxDirsFraction ? 'fail' : 'warn';
    } else {
      level = maxArea > cfg.areaWarnMax ? 'fail' : 'warn';
    }
    if (level === 'fail') worst = 'fail';
    else if (worst !== 'fail') worst = 'warn';
    details.push({ hex, presentIn: present.map((f) => f.name), absentIn: absent.map((f) => f.name), maxArea, level });
  }
  return check('pal.identity', worst, details.length, cfg.areaWarnMax, { details });
}

function checkPalProportion(frames, kind, cfg) {
  if (kind !== 'animation') {
    return check('pal.proportion', 'pass', null, cfg.proportionTolerance, { note: 'no aplica entre directions' });
  }
  const allHexes = new Set();
  for (const f of frames) for (const hex of f.histogram.keys()) allHexes.add(hex);
  let worst = 'pass';
  const details = [];
  for (const hex of allHexes) {
    const fractions = frames.map((f) => (f.histogram.get(hex) || 0) / Math.max(1, f.pixelCount));
    const maxF = Math.max(...fractions);
    const minF = Math.min(...fractions);
    const rel = maxF === 0 ? 0 : (maxF - minF) / maxF;
    if (rel > cfg.proportionTolerance) {
      worst = worst === 'fail' ? 'fail' : 'warn';
      details.push({ hex, rel });
    }
  }
  return check('pal.proportion', worst, details.length, cfg.proportionTolerance, { details });
}

function checkPalSubpalette(frames, charId, cfg) {
  if (!charId) return check('pal.subpalette', 'pass', null, cfg.areaWarnMax, { note: 'sin charId, no aplica' });
  const sub = new Set(subpaletteOf(charId));
  let worst = 'pass';
  const details = [];
  for (const f of frames) {
    for (const [hex, area] of f.histogram) {
      if (!sub.has(hex.toLowerCase())) {
        const level = area > cfg.areaWarnMax ? 'fail' : 'warn';
        worst = level === 'fail' ? 'fail' : (worst !== 'fail' ? 'warn' : worst);
        details.push({ frame: f.name, hex, area, level });
      }
    }
  }
  return check('pal.subpalette', worst, details.length, cfg.areaWarnMax, { details });
}

// --- SIZE ---------------------------------------------------------------------

function checkSizeCanvas(frames) {
  const sizes = new Set(frames.map((f) => `${f.image.width}x${f.image.height}`));
  return check('size.canvas', sizes.size > 1 ? 'fail' : 'pass', sizes.size, 1, { sizes: [...sizes] });
}

function checkSizeCanon(frames, input, cfg) {
  if (input.allowNonCanonSize) return check('size.canon', 'pass', null, null, { note: 'override declarado' });
  const bad = frames.filter((f) => !cfg.canonSizes.some(([w, h]) => w === f.image.width && h === f.image.height));
  return check('size.canon', bad.length ? 'fail' : 'pass', bad.length, 0, { offenders: bad.map((f) => f.name) });
}

function checkSizeBbox(frames, kind, cfg) {
  const withBbox = frames.filter((f) => f.bbox);
  if (withBbox.length < 2) return check('size.bbox', 'pass', 0, 0, { note: 'insuficientes frames' });
  const ws = withBbox.map((f) => f.bbox.w);
  const hs = withBbox.map((f) => f.bbox.h);
  const dW = Math.max(...ws) - Math.min(...ws);
  const dH = Math.max(...hs) - Math.min(...hs);
  const delta = Math.max(dW, dH);
  const warn = kind === 'animation' ? cfg.bboxAnimWarn : cfg.bboxDirsWarn;
  const fail = kind === 'animation' ? cfg.bboxAnimFail : cfg.bboxDirsFail;
  const level = delta > fail ? 'fail' : delta > warn ? 'warn' : 'pass';
  return check('size.bbox', level, delta, fail, { dW, dH });
}

function checkSizeBaseline(frames, input, cfg) {
  const withBbox = frames.filter((f) => f.bbox);
  if (withBbox.length < 2) return check('size.baseline', 'pass', 0, cfg.baselineFail, { note: 'insuficientes frames' });
  const baselines = withBbox.map((f) => f.bbox.maxY);
  const delta = Math.max(...baselines) - Math.min(...baselines);
  let level;
  if (delta > cfg.baselineFail) level = 'fail';
  else if (delta === cfg.baselineFail) level = input.allowBaselineBounce ? 'pass' : 'warn';
  else level = 'pass';
  return check('size.baseline', level, delta, cfg.baselineFail, { baselines: withBbox.map((f) => [f.name, f.bbox.maxY]) });
}

function checkSizePixelcount(frames, kind, cfg) {
  const counts = frames.map((f) => f.pixelCount);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const rel = max === 0 ? 0 : (max - min) / max;
  const warn = kind === 'animation' ? cfg.pixelcountAnimWarn : cfg.pixelcountDirsWarn;
  const fail = kind === 'animation' ? cfg.pixelcountAnimFail : cfg.pixelcountDirsFail;
  const level = rel > fail ? 'fail' : rel > warn ? 'warn' : 'pass';
  return check('size.pixelcount', level, rel, fail, { counts: frames.map((f) => [f.name, f.pixelCount]) });
}

// --- SILUETA --------------------------------------------------------------------

function checkSilAnim(frames, kind, input, cfg) {
  if (kind !== 'animation' || frames.length < 2) {
    return check('sil.anim', 'pass', null, cfg.animPass, { note: 'no aplica' });
  }
  const microIdlePairs = new Set((input.microIdlePairs || []).map(([a, b]) => `${a}|${b}`));
  let worst = 'pass';
  const details = [];
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    const value = alignedIoU(a.image, b.image);
    const isMicroIdle = microIdlePairs.has(`${a.name}|${b.name}`) || microIdlePairs.has(`${b.name}|${a.name}`);
    const pass = isMicroIdle ? cfg.animPassMicroIdle : cfg.animPass;
    const level = value < cfg.animFail ? 'fail' : value < pass ? 'warn' : 'pass';
    if (level === 'fail') worst = 'fail'; else if (level === 'warn' && worst !== 'fail') worst = 'warn';
    details.push({ pair: [a.name, b.name], iou: value, threshold: pass, level });
  }
  return check('sil.anim', worst, null, cfg.animPass, { details });
}

function byRole(frames, role) {
  return frames.find((f) => f.role === role);
}

function checkSilDirs(frames, kind, cfg) {
  if (kind !== 'directions') return check('sil.dirs', 'pass', null, cfg.dirsDownUpPass, { note: 'no aplica' });
  const down = byRole(frames, 'down');
  const up = byRole(frames, 'up');
  const side = byRole(frames, 'side');
  const details = [];
  let worst = 'pass';
  if (down && up) {
    const value = alignedIoU(down.image, up.image);
    const level = value < cfg.dirsDownUpPass - cfg.warnBand ? 'fail' : value < cfg.dirsDownUpPass ? 'warn' : 'pass';
    if (level === 'fail') worst = 'fail'; else if (level === 'warn' && worst !== 'fail') worst = 'warn';
    details.push({ pair: ['down', 'up'], iou: value, threshold: cfg.dirsDownUpPass, level });
  }
  if (side && down) {
    const value = alignedIoU(side.image, down.image);
    const level = value < cfg.dirsSideVsDownPass - cfg.warnBand ? 'fail' : value < cfg.dirsSideVsDownPass ? 'warn' : 'pass';
    if (level === 'fail') worst = 'fail'; else if (level === 'warn' && worst !== 'fail') worst = 'warn';
    details.push({ pair: ['side', 'down'], iou: value, threshold: cfg.dirsSideVsDownPass, level });
  }
  if (!details.length) return check('sil.dirs', 'pass', null, cfg.dirsDownUpPass, { note: 'sin roles down/up/side declarados' });
  return check('sil.dirs', worst, null, cfg.dirsDownUpPass, { details });
}

function checkSilFlip(frames, cfg) {
  const left = byRole(frames, 'left');
  const right = byRole(frames, 'right') || byRole(frames, 'side');
  if (!left || !right) return check('sil.flip', 'pass', null, cfg.flipPass, { note: 'sin frame left declarado' });
  const value = iou(left.image, flipH(right.image));
  const level = value < cfg.flipWarn ? 'fail' : value < cfg.flipPass ? 'warn' : 'pass';
  return check('sil.flip', level, value, cfg.flipPass, { pair: [left.name, right.name] });
}

function checkSilHead(frames, cfg) {
  const withBbox = frames.filter((f) => f.bbox);
  if (withBbox.length < 2) return check('sil.head', 'pass', 0, cfg.headFail, { note: 'insuficientes frames' });
  const tops = withBbox.map((f) => f.bbox.minY);
  const delta = Math.max(...tops) - Math.min(...tops);
  const level = delta > cfg.headFail ? 'fail' : delta === cfg.headFail ? 'warn' : 'pass';
  return check('sil.head', level, delta, cfg.headFail, { tops: withBbox.map((f) => [f.name, f.bbox.minY]) });
}

function checkSilIslands(frames, input) {
  if (input.allowDetached) return check('sil.islands', 'pass', null, 1, { note: 'allowDetached' });
  const offenders = frames.filter((f) => f.components.length > 1);
  return check('sil.islands', offenders.length ? 'fail' : 'pass', offenders.length, 1, {
    offenders: offenders.map((f) => ({ frame: f.name, components: f.components.length })),
  });
}

function checkSilLegible(frames, cfg) {
  let minIou = 1;
  const details = [];
  for (const f of frames) {
    const targetH = 16;
    if (f.image.height <= targetH) { details.push({ frame: f.name, iou: 1 }); continue; }
    const scale = targetH / f.image.height;
    const w = Math.max(1, Math.round(f.image.width * scale));
    const down = resizeNearest(f.image, w, targetH);
    const up = resizeNearest(down, f.image.width, f.image.height);
    const value = iou(f.image, up);
    if (value < minIou) minIou = value;
    details.push({ frame: f.name, iou: value });
  }
  const level = minIou < cfg.legiblePass ? 'warn' : 'pass'; // sin tier fail (heurística)
  return check('sil.legible', level, minIou, cfg.legiblePass, { details });
}
