import { PALETTE_MASTER } from './palette-master.js';

/**
 * Modelo SpriteDocument del editor (spec §8, Fase 1 tarea 9): layers x frames =
 * cels. Un cel es un array plano de w*h con hex '#rrggbb' o null (transparente)
 * — mismo lenguaje de pixeles que el pipeline Godot (pixelforge_atlas.gd) y que
 * el esquema legacy {N, pixels, palette}, lo que hace el export trivial y sin
 * perdida. Alpha parcial no existe a nivel de pixel (pixel-art puro); la
 * opacidad vive por capa y se resuelve al componer.
 */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
}

export interface Frame {
  id: string;
  durationMs: number;
}

export interface AnimTag {
  name: string;
  from: number; // indice de frame inclusive
  to: number;
}

export type Cel = (string | null)[];

export interface SpriteDoc {
  name: string;
  width: number;
  height: number;
  /** layers[0] = fondo; el panel las muestra invertidas (top primero). */
  layers: Layer[];
  frames: Frame[];
  /** key `${layerId}:${frameId}` — matriz dispersa de cels. */
  cels: Record<string, Cel>;
  palette: string[];
  tags: AnimTag[];
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export const celKey = (layerId: string, frameId: string): string => `${layerId}:${frameId}`;

export function emptyCel(doc: Pick<SpriteDoc, 'width' | 'height'>): Cel {
  return new Array<string | null>(doc.width * doc.height).fill(null);
}

export function getCel(doc: SpriteDoc, layerId: string, frameId: string): Cel {
  const key = celKey(layerId, frameId);
  let cel = doc.cels[key];
  if (!cel) {
    cel = emptyCel(doc);
    doc.cels[key] = cel;
  }
  return cel;
}

export const DOC_SIZES = [8, 16, 24, 32, 48, 64, 96, 128] as const;

export function createDoc(name: string, width: number, height: number): SpriteDoc {
  const layer: Layer = { id: newId('ly'), name: 'fondo', visible: true, locked: false, opacity: 1 };
  const frame: Frame = { id: newId('fr'), durationMs: 220 };
  const doc: SpriteDoc = {
    name,
    width,
    height,
    layers: [layer],
    frames: [frame],
    cels: {},
    palette: PALETTE_MASTER.map((c) => c.hex),
    tags: [],
  };
  doc.cels[celKey(layer.id, frame.id)] = emptyCel(doc);
  return doc;
}

export function cloneDoc(doc: SpriteDoc): SpriteDoc {
  return {
    ...doc,
    layers: doc.layers.map((l) => ({ ...l })),
    frames: doc.frames.map((f) => ({ ...f })),
    cels: Object.fromEntries(Object.entries(doc.cels).map(([k, v]) => [k, [...v]])),
    palette: [...doc.palette],
    tags: doc.tags.map((t) => ({ ...t })),
  };
}

// ─── operaciones de capa ────────────────────────────────────────────────────

export function addLayer(doc: SpriteDoc, name?: string): Layer {
  const layer: Layer = {
    id: newId('ly'),
    name: name ?? `capa ${doc.layers.length + 1}`,
    visible: true,
    locked: false,
    opacity: 1,
  };
  doc.layers.push(layer);
  for (const frame of doc.frames) doc.cels[celKey(layer.id, frame.id)] = emptyCel(doc);
  return layer;
}

export function duplicateLayer(doc: SpriteDoc, layerId: string): Layer | null {
  const idx = doc.layers.findIndex((l) => l.id === layerId);
  const src = doc.layers[idx];
  if (idx < 0 || !src) return null;
  const copy: Layer = { ...src, id: newId('ly'), name: `${src.name} copia` };
  doc.layers.splice(idx + 1, 0, copy);
  for (const frame of doc.frames) {
    doc.cels[celKey(copy.id, frame.id)] = [...getCel(doc, src.id, frame.id)];
  }
  return copy;
}

export function removeLayer(doc: SpriteDoc, layerId: string): void {
  if (doc.layers.length <= 1) return;
  doc.layers = doc.layers.filter((l) => l.id !== layerId);
  for (const key of Object.keys(doc.cels)) {
    if (key.startsWith(`${layerId}:`)) delete doc.cels[key];
  }
}

export function moveLayer(doc: SpriteDoc, layerId: string, delta: 1 | -1): void {
  const idx = doc.layers.findIndex((l) => l.id === layerId);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= doc.layers.length) return;
  const [layer] = doc.layers.splice(idx, 1);
  if (!layer) return;
  doc.layers.splice(target, 0, layer);
}

// ─── operaciones de frame ───────────────────────────────────────────────────

export function addFrame(doc: SpriteDoc, afterIndex?: number): Frame {
  const frame: Frame = { id: newId('fr'), durationMs: 220 };
  const at = afterIndex === undefined ? doc.frames.length : afterIndex + 1;
  doc.frames.splice(at, 0, frame);
  for (const layer of doc.layers) doc.cels[celKey(layer.id, frame.id)] = emptyCel(doc);
  return frame;
}

export function duplicateFrame(doc: SpriteDoc, frameIndex: number): Frame | null {
  const src = doc.frames[frameIndex];
  if (!src) return null;
  const copy: Frame = { id: newId('fr'), durationMs: src.durationMs };
  doc.frames.splice(frameIndex + 1, 0, copy);
  for (const layer of doc.layers) {
    doc.cels[celKey(layer.id, copy.id)] = [...getCel(doc, layer.id, src.id)];
  }
  return copy;
}

export function removeFrame(doc: SpriteDoc, frameIndex: number): void {
  if (doc.frames.length <= 1) return;
  const [frame] = doc.frames.splice(frameIndex, 1);
  if (!frame) return;
  for (const key of Object.keys(doc.cels)) {
    if (key.endsWith(`:${frame.id}`)) delete doc.cels[key];
  }
  doc.tags = doc.tags
    .map((t) => ({
      ...t,
      from: Math.min(t.from, doc.frames.length - 1),
      to: Math.min(t.to, doc.frames.length - 1),
    }))
    .filter((t) => t.from <= t.to);
}

// ─── herramientas de dibujo (ops puras sobre cel) ───────────────────────────

export function plotPixel(
  doc: SpriteDoc,
  cel: Cel,
  x: number,
  y: number,
  color: string | null,
  brushSize: number,
  mirrorH: boolean,
  mirrorV: boolean,
): void {
  const half = Math.floor(brushSize / 2);
  for (let dy = 0; dy < brushSize; dy += 1) {
    for (let dx = 0; dx < brushSize; dx += 1) {
      const px = x - half + dx;
      const py = y - half + dy;
      setPx(doc, cel, px, py, color);
      if (mirrorH) setPx(doc, cel, doc.width - 1 - px, py, color);
      if (mirrorV) setPx(doc, cel, px, doc.height - 1 - py, color);
      if (mirrorH && mirrorV) setPx(doc, cel, doc.width - 1 - px, doc.height - 1 - py, color);
    }
  }
}

function setPx(doc: SpriteDoc, cel: Cel, x: number, y: number, color: string | null): void {
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
  cel[y * doc.width + x] = color;
}

/** Bresenham entre dos puntos, con el mismo pincel/espejos que plotPixel. */
export function plotLine(
  doc: SpriteDoc,
  cel: Cel,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string | null,
  brushSize: number,
  mirrorH: boolean,
  mirrorV: boolean,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plotPixel(doc, cel, x, y, color, brushSize, mirrorH, mirrorV);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export function plotRect(
  doc: SpriteDoc,
  cel: Cel,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string | null,
  brushSize: number,
  mirrorH: boolean,
  mirrorV: boolean,
): void {
  plotLine(doc, cel, x0, y0, x1, y0, color, brushSize, mirrorH, mirrorV);
  plotLine(doc, cel, x1, y0, x1, y1, color, brushSize, mirrorH, mirrorV);
  plotLine(doc, cel, x1, y1, x0, y1, color, brushSize, mirrorH, mirrorV);
  plotLine(doc, cel, x0, y1, x0, y0, color, brushSize, mirrorH, mirrorV);
}

/** Relleno contiguo (flood fill 4-conexo). */
export function floodFill(doc: SpriteDoc, cel: Cel, x: number, y: number, color: string | null): void {
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
  const target = cel[y * doc.width + x];
  if (target === color) return;
  const stack: number[] = [y * doc.width + x];
  while (stack.length > 0) {
    const i = stack.pop() as number;
    if (cel[i] !== target) continue;
    cel[i] = color;
    const cx = i % doc.width;
    const cy = Math.floor(i / doc.width);
    if (cx > 0) stack.push(i - 1);
    if (cx < doc.width - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - doc.width);
    if (cy < doc.height - 1) stack.push(i + doc.width);
  }
}

// ─── composicion ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const v = parseInt(clean.length >= 6 ? clean.slice(0, 6) : clean, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export interface CompositeOptions {
  /** Si esta seteado, compone SOLO esa capa (modo solo: ver como se anima cada capa). */
  soloLayerId?: string | null;
}

/** Compone un frame (capas visibles, opacity por capa) a RGBA para ImageData. */
export function compositeFrame(
  doc: SpriteDoc,
  frameIndex: number,
  opts: CompositeOptions = {},
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(doc.width * doc.height * 4);
  const frame = doc.frames[frameIndex];
  if (!frame) return out;
  for (const layer of doc.layers) {
    if (opts.soloLayerId ? layer.id !== opts.soloLayerId : !layer.visible) continue;
    const cel = doc.cels[celKey(layer.id, frame.id)];
    if (!cel) continue;
    const alpha = Math.round(layer.opacity * 255);
    if (alpha === 0) continue;
    for (let i = 0; i < cel.length; i += 1) {
      const hex = cel[i];
      if (!hex) continue;
      const [r, g, b] = hexToRgb(hex);
      const o = i * 4;
      const srcA = alpha / 255;
      const dstA = (out[o + 3] ?? 0) / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA === 0) continue;
      out[o] = Math.round((r * srcA + (out[o] ?? 0) * dstA * (1 - srcA)) / outA);
      out[o + 1] = Math.round((g * srcA + (out[o + 1] ?? 0) * dstA * (1 - srcA)) / outA);
      out[o + 2] = Math.round((b * srcA + (out[o + 2] ?? 0) * dstA * (1 - srcA)) / outA);
      out[o + 3] = Math.round(outA * 255);
    }
  }
  return out;
}

/** Aplana un frame a hex-o-null (para export legacy: sin alpha parcial, umbral 50%). */
export function flattenFrame(doc: SpriteDoc, frameIndex: number): (string | null)[] {
  const rgba = compositeFrame(doc, frameIndex);
  const out: (string | null)[] = new Array(doc.width * doc.height).fill(null);
  for (let i = 0; i < out.length; i += 1) {
    const o = i * 4;
    if ((rgba[o + 3] ?? 0) > 127) {
      out[i] =
        '#' +
        [rgba[o], rgba[o + 1], rgba[o + 2]]
          .map((v) => (v ?? 0).toString(16).padStart(2, '0'))
          .join('');
    }
  }
  return out;
}

// ─── serializacion .pfx (JSON) ──────────────────────────────────────────────

interface PfxFileV2 {
  pfx: 2;
  name: string;
  width: number;
  height: number;
  layers: Layer[];
  frames: Frame[];
  cels: Record<string, Cel>;
  palette: string[];
  tags: AnimTag[];
}

/** Esquema legacy del prototipo/pipeline Godot: {N|W/H, pixels, palette} + metadata en clave 'pixelforge'. */
interface LegacyFile {
  N?: number;
  W?: number;
  H?: number;
  pixels: (string | null)[];
  palette: string[];
  pixelforge?: Partial<PfxFileV2>;
}

export interface GodotExportMetadata {
  nativeSize: { width: number; height: number };
  exportScale: number;
}

export function serializeDoc(doc: SpriteDoc): string {
  const file: PfxFileV2 = {
    pfx: 2,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    layers: doc.layers,
    frames: doc.frames,
    cels: doc.cels,
    palette: doc.palette,
    tags: doc.tags,
  };
  return JSON.stringify(file);
}

export function deserializeDoc(json: string, fallbackName: string): SpriteDoc {
  const raw = JSON.parse(json) as Partial<PfxFileV2> & LegacyFile;

  if (raw.pfx === 2 && Array.isArray(raw.layers) && Array.isArray(raw.frames)) {
    return {
      name: raw.name ?? fallbackName,
      width: raw.width as number,
      height: raw.height as number,
      layers: raw.layers,
      frames: raw.frames,
      cels: raw.cels ?? {},
      palette: raw.palette ?? PALETTE_MASTER.map((c) => c.hex),
      tags: raw.tags ?? [],
    };
  }

  // Legacy {N|W/H, pixels, palette}: 1 capa, 1 frame.
  const width = raw.W ?? raw.N;
  const height = raw.H ?? raw.N;
  if (!width || !height || !Array.isArray(raw.pixels)) {
    throw new Error('Formato no reconocido: ni .pfx v2 ni legacy {N,pixels,palette}');
  }
  const doc = createDoc(fallbackName, width, height);
  const cel = getCel(doc, doc.layers[0]!.id, doc.frames[0]!.id);
  for (let i = 0; i < Math.min(cel.length, raw.pixels.length); i += 1) cel[i] = raw.pixels[i] ?? null;
  if (Array.isArray(raw.palette) && raw.palette.length > 0) doc.palette = raw.palette;
  return doc;
}

/**
 * Export legacy por frame, compatible con videocoder-game/godot/tools/
 * pixelforge_atlas.gd (lee N/pixels/palette e ignora claves extra; sprites
 * no cuadrados usan W/H, soportado por la extension del script en este mismo
 * encargo). Convencion de nombre del pipeline: `<char>_<anim>_<n>.json`.
 */
export function exportLegacyFrames(
  doc: SpriteDoc,
  tag?: AnimTag,
  exportScale = 1,
): Array<{ name: string; text: string }> {
  if (!Number.isInteger(exportScale) || exportScale < 1 || exportScale > 8) {
    throw new Error('La escala de export debe ser un entero entre 1 y 8');
  }
  const from = tag?.from ?? 0;
  const to = tag?.to ?? doc.frames.length - 1;
  const animName = tag?.name ?? 'idle';
  const files: Array<{ name: string; text: string }> = [];
  for (let i = from; i <= to && i < doc.frames.length; i += 1) {
    const frame = doc.frames[i];
    if (!frame) continue;
    const pixels = flattenFrame(doc, i);
    const body: LegacyFile = {
      ...(doc.width === doc.height ? { N: doc.width } : {}),
      W: doc.width,
      H: doc.height,
      pixels,
      palette: doc.palette,
      pixelforge: {
        name: doc.name,
        frames: [frame],
        tags: doc.tags,
        nativeSize: { width: doc.width, height: doc.height },
        exportScale,
      } as Partial<PfxFileV2> & GodotExportMetadata,
    };
    files.push({
      name: `${sanitizeName(doc.name)}_${sanitizeName(animName)}_${i - from}.json`,
      text: JSON.stringify(body),
    });
  }
  return files;
}

export function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'sprite';
}
