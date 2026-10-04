import { describe, expect, it } from 'vitest';
import { cellMatchPct, normalizeHex } from '../src/cell-match.js';

describe('normalizeHex (modo A canonicalizacion)', () => {
  it('null -> null (transparente)', () => {
    expect(normalizeHex(null)).toBeNull();
  });
  it('expande #rgb y baja a minusculas', () => {
    expect(normalizeHex('#FFF')).toBe('#ffffff');
    expect(normalizeHex('#Ab0')).toBe('#aabb00');
  });
  it('acepta sin # y ya de 6', () => {
    expect(normalizeHex('FF0000')).toBe('#ff0000');
    expect(normalizeHex('#00ff00')).toBe('#00ff00');
  });
  it('hex invalido -> negro opaco (espejo de gridToImage NaN->negro)', () => {
    expect(normalizeHex('garbage')).toBe('#000000');
    expect(normalizeHex('#12345')).toBe('#000000');
  });
});

describe('cellMatchPct (modo A)', () => {
  it('grillas identicas -> 100%, diff todo false', () => {
    const a = ['#ff0000', null, '#00ff00', '#0000ff'];
    const r = cellMatchPct(a, a.slice());
    expect(r.pct).toBe(100);
    expect(r.matches).toBe(4);
    expect(r.diff).toEqual([false, false, false, false]);
  });

  it('cuenta null<->null como igual y color exacto como igual', () => {
    const a = [null, '#ffffff', '#000000', '#123456'];
    const b = [null, '#FFF', '#000', '#123456'];
    expect(cellMatchPct(a, b).pct).toBe(100);
  });

  it('una celda distinta -> 75% y marca esa celda en diff', () => {
    const a = ['#ff0000', '#ff0000', '#ff0000', '#ff0000'];
    const b = ['#ff0000', '#00ff00', '#ff0000', '#ff0000'];
    const r = cellMatchPct(a, b);
    expect(r.pct).toBe(75);
    expect(r.diff).toEqual([false, true, false, false]);
  });

  it('null vs color cuenta como distinto', () => {
    expect(cellMatchPct([null], ['#000000']).pct).toBe(0);
  });

  it('longitud total 0 -> 100 por definicion', () => {
    expect(cellMatchPct([], []).pct).toBe(100);
  });

  it('longitudes distintas lanzan', () => {
    expect(() => cellMatchPct(['#000000'], [])).toThrow(/longitudes distintas/);
  });

  it('modo != A lanza', () => {
    // @ts-expect-error probando modo no soportado a proposito
    expect(() => cellMatchPct([], [], 'B')).toThrow(/solo modo A/);
  });
});
