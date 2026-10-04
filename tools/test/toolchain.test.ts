import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { PixelGrid, TargetSpec } from '../src/types.js';
import { targetFromImage } from '../src/pf-01-target.js';
import { normalizeGrid } from '../src/pf-02-normalize.js';
import { alignToTarget } from '../src/pf-03-align.js';
import { evaluateCandidate, PF_TOOLCHAIN } from '../src/toolchain.js';
import { renderGrid } from '../src/pf-06-render.js';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** RGBA crudo NxN -> PNG via sharp, para alimentar pf-01-target en el test. */
async function rawToPng(n: number, rgba: number[]): Promise<Buffer> {
  return sharp(Buffer.from(rgba), { raw: { width: n, height: n, channels: 4 } })
    .png()
    .toBuffer();
}

function solidGrid(N: number, hex: string): PixelGrid {
  return { N, pixels: new Array<string | null>(N * N).fill(hex), palette: [hex] };
}

function solidTarget(N: number, hex: string): TargetSpec {
  return {
    N,
    cells: new Array<string | null>(N * N).fill(hex),
    palette: [hex],
    source: { width: N, height: N, alphaThreshold: 128 },
  };
}

describe('PF_TOOLCHAIN', () => {
  it('declara las 6 etapas en orden pf-01..pf-06, todas deterministas', () => {
    expect(PF_TOOLCHAIN.map((t) => t.id)).toEqual([
      'pf-01-target',
      'pf-02-normalize',
      'pf-03-align',
      'pf-04-compare',
      'pf-05-score',
      'pf-06-render',
    ]);
    expect(PF_TOOLCHAIN.every((t) => t.deterministic)).toBe(true);
  });
});

describe('pf-01-target (sharp, determinista)', () => {
  it('rasteriza 2x2 rojo opaco a celdas #ff0000', async () => {
    const rgba = [
      255, 0, 0, 255, 255, 0, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 255,
    ];
    const png = await rawToPng(2, rgba);
    const target = await targetFromImage(png, { N: 2 });
    expect(target.cells).toEqual(['#ff0000', '#ff0000', '#ff0000', '#ff0000']);
    expect(target.palette).toEqual(['#ff0000']);
  });

  it('alpha < umbral -> celda null (transparente)', async () => {
    const rgba = [
      0, 255, 0, 255, 0, 255, 0, 10, // segunda celda casi transparente
      0, 255, 0, 255, 0, 255, 0, 255,
    ];
    const png = await rawToPng(2, rgba);
    const target = await targetFromImage(png, { N: 2, alphaThreshold: 128 });
    expect(target.cells[1]).toBeNull();
    expect(target.cells[0]).toBe('#00ff00');
  });

  it('es determinista: misma imagen -> misma grilla', async () => {
    const rgba = Array.from({ length: 4 * 4 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));
    const png = await rawToPng(4, rgba);
    const a = await targetFromImage(png, { N: 4 });
    const b = await targetFromImage(png, { N: 4 });
    expect(a.cells).toEqual(b.cells);
  });

  it('N invalido lanza', async () => {
    const png = await rawToPng(1, [1, 2, 3, 255]);
    await expect(targetFromImage(png, { N: 0 })).rejects.toThrow(/N invalido/);
  });
});

describe('pf-02-normalize', () => {
  it('remuestrea por vecino-mas-cercano al N objetivo', () => {
    const grid: PixelGrid = {
      N: 2,
      pixels: ['#ff0000', '#00ff00', '#0000ff', '#ffffff'],
      palette: ['#ff0000'],
    };
    const n = normalizeGrid(grid, 4);
    expect(n.N).toBe(4);
    expect(n.cells).toHaveLength(16);
    // esquina superior-izquierda mapea a la celda (0,0) de la fuente
    expect(n.cells[0]).toBe('#ff0000');
    // esquina inferior-derecha mapea a (1,1) de la fuente
    expect(n.cells[15]).toBe('#ffffff');
  });

  it('canonicaliza celdas y paleta', () => {
    const grid: PixelGrid = { N: 1, pixels: ['#F00'], palette: ['#F00', 'nope'] };
    const n = normalizeGrid(grid, 1);
    expect(n.cells).toEqual(['#ff0000']);
    expect(n.palette).toEqual(['#ff0000']);
  });
});

describe('pf-03-align (registro entero acotado)', () => {
  it('recupera un desplazamiento de +1 en x', () => {
    // target: columna izquierda pintada; candidata: misma forma corrida 1 a la derecha
    const N = 3;
    const target = [
      '#ff0000', null, null,
      '#ff0000', null, null,
      '#ff0000', null, null,
    ];
    const candidate = [
      null, '#ff0000', null,
      null, '#ff0000', null,
      null, '#ff0000', null,
    ];
    const r = alignToTarget(candidate, target, N, 1);
    expect(r.dx).toBe(-1);
    expect(r.dy).toBe(0);
    expect(r.pct).toBe(100);
  });

  it('identidad gana el desempate cuando nada mejora', () => {
    const N = 2;
    const g = ['#ff0000', '#ff0000', '#ff0000', '#ff0000'];
    const r = alignToTarget(g, g.slice(), N, 1);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });
});

describe('evaluateCandidate (pf-02 -> pf-05)', () => {
  it('candidata perfecta -> agregado 10 y todas las facetas 10', () => {
    const target = solidTarget(2, '#ff0000');
    const evalu = evaluateCandidate(solidGrid(2, '#ff0000'), target, { maxShift: 0 });
    expect(evalu.score.aggregate).toBe(10);
    expect(evalu.comparison.cellMatchPct).toBe(100);
    for (const f of evalu.score.facets) expect(f.score).toBe(10);
  });

  it('color equivocado: silhouette 10 pero structure/palette 0 -> weakest structure', () => {
    const target = solidTarget(2, '#ff0000');
    const evalu = evaluateCandidate(solidGrid(2, '#0000ff'), target, { maxShift: 0 });
    expect(evalu.comparison.facets.silhouette.pct).toBe(100);
    expect(evalu.comparison.facets.structure.pct).toBe(0);
    expect(evalu.comparison.facets.palette.pct).toBe(0);
    expect(evalu.score.weakest).toBe('structure');
    // agregado = 0*0.5 + 10*0.3 + 0*0.2 = 3
    expect(evalu.score.aggregate).toBeCloseTo(3, 6);
  });
});

describe('pf-06-render (reuso de gridToPng + post-proceso)', () => {
  it('sin post-proceso devuelve el PNG crudo de gridToPng', async () => {
    const r = await renderGrid(solidGrid(4, '#ff0000'), { postProcess: false });
    expect(r.postProcessed).toBe(false);
    expect(r.png.subarray(0, 4)).toEqual(PNG_SIG);
  });

  it('con post-proceso aplica el pipeline y marca postProcessed', async () => {
    const r = await renderGrid(solidGrid(4, '#ff0000'), { postProcess: true });
    expect(r.postProcessed).toBe(true);
    expect(r.png.subarray(0, 4)).toEqual(PNG_SIG);
    expect(typeof r.hash).toBe('string');
  });
});
