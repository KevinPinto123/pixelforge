import { describe, expect, it } from 'vitest';
import {
  buildCharacterPrompt,
  parsePixelSpec,
  rasterizeFrame,
  type ClaudePixelSpec,
} from '../src/claude-adapter.js';

const SPEC_JSON = JSON.stringify({
  size: 4,
  palette: ['#ff0000', '#00ff00'],
  frames: [
    { name: 'south', rows: ['....', '.01.', '.10.', '....'] },
    { name: 'north', rows: ['....', '.11.', '.00.', '....'] },
  ],
});

describe('parsePixelSpec', () => {
  it('parsea JSON limpio', () => {
    const spec = parsePixelSpec(SPEC_JSON, 4);
    expect(spec.size).toBe(4);
    expect(spec.palette).toHaveLength(2);
    expect(spec.frames.map((f) => f.name)).toEqual(['south', 'north']);
  });

  it('tolera fences de markdown y texto alrededor', () => {
    const wrapped = 'Aqui esta tu sprite:\n```json\n' + SPEC_JSON + '\n```\nEspero que te guste.';
    const spec = parsePixelSpec(wrapped, 4);
    expect(spec.frames).toHaveLength(2);
  });

  it('normaliza filas cortas/largas al size', () => {
    const spec = parsePixelSpec(
      JSON.stringify({
        size: 4,
        palette: ['#ff0000'],
        frames: [{ name: 'south', rows: ['..', '.0.00', '....', '....'] }],
      }),
      4,
    );
    expect(spec.frames[0].rows.every((r) => r.length === 4)).toBe(true);
  });

  it('falla sin JSON o sin frames', () => {
    expect(() => parsePixelSpec('no hay json aca', 4)).toThrow();
    expect(() => parsePixelSpec('{"size":4,"palette":["#fff"],"frames":[]}', 4)).toThrow();
    expect(() =>
      parsePixelSpec('{"size":4,"palette":[],"frames":[{"name":"s","rows":[]}]}', 4),
    ).toThrow();
  });

  it('rechaza frame con numero de filas incorrecto', () => {
    expect(() =>
      parsePixelSpec(
        JSON.stringify({ size: 4, palette: ['#fff'], frames: [{ name: 's', rows: ['....'] }] }),
        4,
      ),
    ).toThrow(/rows/);
  });
});

describe('rasterizeFrame', () => {
  it('convierte indices de paleta a RGBA y "." a transparente', () => {
    const spec = parsePixelSpec(SPEC_JSON, 4) as ClaudePixelSpec;
    const img = rasterizeFrame(spec, spec.frames[0]);
    expect(img.width).toBe(4);
    expect(img.height).toBe(4);
    // (0,0) transparente
    expect(img.data[3]).toBe(0);
    // (1,1) = palette[0] = rojo opaco
    const o = (1 * 4 + 1) * 4;
    expect([img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]]).toEqual([
      255, 0, 0, 255,
    ]);
    // (2,1) = palette[1] = verde
    const o2 = (1 * 4 + 2) * 4;
    expect([img.data[o2], img.data[o2 + 1], img.data[o2 + 2], img.data[o2 + 3]]).toEqual([
      0, 255, 0, 255,
    ]);
  });

  it('ignora caracteres fuera de paleta sin romper', () => {
    const spec: ClaudePixelSpec = {
      size: 2,
      palette: ['#ffffff'],
      frames: [{ name: 's', rows: ['z0', '..'] }],
    };
    const img = rasterizeFrame(spec, spec.frames[0]);
    expect(img.data[3]).toBe(0); // 'z' fuera de rango -> transparente
    expect(img.data[7]).toBe(255); // '0' -> opaco
  });
});

describe('buildCharacterPrompt', () => {
  it('incluye size, direcciones y paleta', () => {
    const prompt = buildCharacterPrompt({
      prompt: 'campesino peruano con chullo',
      size: 32,
      directions: 4,
      paletteColors: ['#7c5cff', '#1b1e2b'],
    });
    expect(prompt).toContain('32x32');
    expect(prompt).toContain('south, north, east, west');
    expect(prompt).toContain('#7c5cff');
    expect(prompt).toContain('campesino peruano');
  });
});
