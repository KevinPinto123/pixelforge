// palette.js — fuente de verdad: data/PALETTE-MASTER.json (32 colores, vendoreado
// desde videocoder-game/design/PALETTE-MASTER.json — packages/core no sale del árbol
// pixelforge/, así que trae su propia copia en vez de leer cross-repo).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hexToOklab } from './color.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASTER_PATH = path.join(__dirname, 'data', 'PALETTE-MASTER.json');

export function loadMasterPalette(masterPath = MASTER_PATH) {
  const json = JSON.parse(readFileSync(masterPath, 'utf8'));
  return json;
}

const _master = loadMasterPalette();

export const MASTER_HEXES = _master.colors.map((c) => c.hex.toLowerCase());

// Snap prioritario exacto (spec §2.2.5) — lookup ANTES del nearest, evita que
// #ffffff caiga por distancia en screen_bright en vez de ir a white.
export const SNAP_TABLE = {
  '#000000': '#1b1e2b',
  '#ffffff': '#e6e8f0',
  '#f6d32d': '#c9b458',
  '#ff7800': '#c95c4b',
  '#62a0ea': '#3584e4',
};

const _oklabCache = new Map(MASTER_HEXES.map((hex) => [hex, hexToOklab(hex)]));

export function oklabOf(hex) {
  const h = hex.toLowerCase();
  if (_oklabCache.has(h)) return _oklabCache.get(h);
  const v = hexToOklab(h);
  _oklabCache.set(h, v);
  return v;
}

export function subpaletteOf(_charId) {
  // No hay registro de subpaleta por personaje todavía en PALETTE-MASTER.json
  // (solo `ramps` por material). Placeholder explícito: sin charId registrado,
  // subpaleta = maestro completo (no filtra). Cablear cuando exista el registro
  // de personajes (charId -> hexes) en el editor/PixelForge.
  return MASTER_HEXES;
}
