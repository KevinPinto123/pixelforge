import type { Cell } from './types.js';

/**
 * Comparador determinista cellMatchPct (SPEC-PIXELFORGE-ORCHESTRATOR.md §5).
 *
 * Modo A = igualdad exacta de celda: dos celdas son iguales si AMBAS son
 * transparentes (null) o si tienen el MISMO color canonico ('#rrggbb'). No hay
 * tolerancia de color ni de paleta — es la metrica estructural mas estricta.
 * Modos B (tolerante a paleta) y C (perceptual OKLab) quedan reservados para
 * cuando el spec los especifique; hoy solo existe A.
 */
export type CellMatchMode = 'A';

/**
 * Parse estricto de un hex a '#rrggbb' minusculas, o null si es invalido.
 * Acepta '#rgb'/'rgb'/'#rrggbb'/'rrggbb'. Se usa donde un valor invalido debe
 * DESCARTARSE en vez de sustituirse (p.ej. la paleta declarada, no las celdas).
 */
export function canonicalHex(hex: string): string | null {
  const clean = hex.trim().replace(/^#/, '').toLowerCase();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return /^[0-9a-f]{6}$/.test(full) ? `#${full}` : null;
}

/**
 * Canonicaliza una CELDA a '#rrggbb' minusculas. null -> null (transparente).
 * Un valor no-null pero invalido cae a '#000000' (negro opaco) — el mismo
 * comportamiento que la rasterizacion de grid-codec (gridToImage: NaN -> negro
 * opaco), para que el comparador mida lo que realmente se renderizaria.
 */
export function normalizeHex(hex: Cell): Cell {
  if (hex == null) return null;
  return canonicalHex(hex) ?? '#000000';
}

export interface CellMatchResult {
  total: number;
  matches: number;
  /** 0..100. Con total 0 se define como 100 (dos vacios son identicos). */
  pct: number;
  /** true donde las celdas difieren, longitud `total`. */
  diff: boolean[];
}

/**
 * Porcentaje de celdas iguales entre dos grillas del mismo tamano (modo A).
 * Ambas listas deben tener la misma longitud (el llamador normaliza N antes,
 * ver pf-02-normalize / pf-03-align); si no, es un error de programacion y lanza.
 */
export function cellMatchPct(
  a: ReadonlyArray<Cell>,
  b: ReadonlyArray<Cell>,
  mode: CellMatchMode = 'A',
): CellMatchResult {
  if (mode !== 'A') {
    throw new Error(`cellMatchPct: modo "${mode}" no implementado (solo modo A)`);
  }
  if (a.length !== b.length) {
    throw new Error(`cellMatchPct: longitudes distintas ${a.length} vs ${b.length}`);
  }
  const total = a.length;
  const diff = new Array<boolean>(total);
  let matches = 0;
  for (let i = 0; i < total; i += 1) {
    const ca = normalizeHex(a[i] ?? null);
    const cb = normalizeHex(b[i] ?? null);
    const equal = ca === cb;
    diff[i] = !equal;
    if (equal) matches += 1;
  }
  return { total, matches, pct: total === 0 ? 100 : (matches / total) * 100, diff };
}
