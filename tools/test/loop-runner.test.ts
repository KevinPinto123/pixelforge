import { describe, expect, it } from 'vitest';
import type { GenerateContext, PixelGrid, TargetSpec } from '../src/index.js';
import { runLoop } from '../src/index.js';

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
/** Grilla NxN con las primeras `redCount` celdas rojas (resto azul). */
function partialGrid(N: number, redCount: number): PixelGrid {
  const pixels = Array.from({ length: N * N }, (_, i) => (i < redCount ? '#ff0000' : '#0000ff'));
  return { N, pixels, palette: ['#ff0000', '#0000ff'] };
}

describe('runLoop — criterios de parada', () => {
  it('target-score: candidata perfecta para en 1 pasada y renderiza la ganadora', async () => {
    const target = solidTarget(2, '#ff0000');
    const res = await runLoop(target, async () => solidGrid(2, '#ff0000'), { maxShift: 0 });
    expect(res.stopReason).toBe('target-score');
    expect(res.passes).toHaveLength(1);
    expect(res.best.score).toBe(10);
    expect(res.render?.postProcessed).toBe(true);
  });

  it('stalled: generador constante pobre para tras 1 + maxNoImprovement pasadas', async () => {
    const target = solidTarget(2, '#ff0000');
    const seen: Array<string | undefined> = [];
    const res = await runLoop(
      target,
      async (ctx: GenerateContext) => {
        seen.push(ctx.focusFacet);
        return solidGrid(2, '#0000ff'); // siempre igual -> no mejora nunca
      },
      { maxShift: 0, postProcessWinner: false },
    );
    expect(res.stopReason).toBe('stalled');
    // 1 pasada que fija el best + 5 sin mejora = 6
    expect(res.passes).toHaveLength(6);
    expect(res.best.score).toBeCloseTo(3, 6);
    // re-cola: desde la 2a pasada el contexto trae la faceta debil
    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toBe('structure');
  });

  it('max-passes: mejora monotona sub-umbral agota las 7 pasadas', async () => {
    const target = solidTarget(4, '#ff0000'); // 16 celdas
    const res = await runLoop(
      target,
      async (ctx: GenerateContext) => partialGrid(4, ctx.pass), // 1,2,3.. rojas -> siempre mejora, < 9
      { maxShift: 0, postProcessWinner: false },
    );
    expect(res.stopReason).toBe('max-passes');
    expect(res.passes).toHaveLength(7);
    // pass 7 -> 7/16 celdas correctas, muy por debajo de 9
    expect(res.best.score).toBeLessThan(9);
    expect(res.best.pass).toBe(7);
  });

  it('hard-kill: el reloj de pared cruza hardKillMs a mitad de loop', async () => {
    const target = solidTarget(2, '#ff0000');
    const MIN = 60 * 1000;
    let clock = 0;
    const now = () => clock;
    const res = await runLoop(
      target,
      async () => {
        clock += 20 * MIN; // cada generacion consume 20 min de pared
        return solidGrid(2, '#0000ff'); // score ~3, nunca alcanza target
      },
      { maxShift: 0, postProcessWinner: false, hardKillMs: 45 * MIN, now },
    );
    expect(res.stopReason).toBe('hard-kill');
    expect(res.passes).toHaveLength(3); // 0->20->40 ok, tras la 3a (60min) mata
  });
});

describe('runLoop — re-cola enfocada', () => {
  it('la pista de re-cola apunta a la faceta mas debil de la mejor', async () => {
    const target = solidTarget(2, '#ff0000');
    const contexts: GenerateContext[] = [];
    await runLoop(
      target,
      async (ctx) => {
        contexts.push(ctx);
        return solidGrid(2, '#0000ff'); // structure/palette 0, silhouette 10 -> weakest structure
      },
      { maxShift: 0, postProcessWinner: false, maxNoImprovement: 2 },
    );
    // primera sin foco, siguientes con foco 'structure' y pistas legibles
    expect(contexts[0]?.focusFacet).toBeUndefined();
    expect(contexts[1]?.focusFacet).toBe('structure');
    expect(contexts[1]?.hints.some((h) => h.includes('structure'))).toBe(true);
  });
});
