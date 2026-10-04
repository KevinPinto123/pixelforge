import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage, setPixel, getPixel } from '../image.js';
import { quantize } from '../ops/quantize.js';
import { hexToRgb, rgbToHex } from '../color.js';

// spec §9 test 2: snap exacto de pixelforge_base -> pixelforge_dropped (§2.2.5)
test('quantize snaps the 5 pixelforge_base colors to the exact §2.2.5 table', () => {
  const inputs = ['#000000', '#ffffff', '#f6d32d', '#ff7800', '#62a0ea'];
  const expected = ['#1b1e2b', '#e6e8f0', '#c9b458', '#c95c4b', '#3584e4'];
  const img = createImage(inputs.length, 1);
  inputs.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    setPixel(img, i, 0, r, g, b, 255);
  });

  const { image: out, report } = quantize(img);

  inputs.forEach((_, i) => {
    const [r, g, b] = getPixel(out, i, 0);
    assert.equal(rgbToHex(r, g, b), expected[i]);
  });
  assert.equal(report.remapped.length, 5);
});

test('quantize leaves master colors untouched (no remap, deltaE 0)', () => {
  const img = createImage(1, 1);
  setPixel(img, 0, 0, ...hexToRgb('#3584e4'), 255);
  const { image: out, report } = quantize(img);
  const [r, g, b] = getPixel(out, 0, 0);
  assert.equal(rgbToHex(r, g, b), '#3584e4');
  assert.equal(report.maxDeltaE, 0);
  assert.equal(report.remapped.length, 0);
});

test('quantize nearest-color snaps an off-palette skin tone into the master skin ramp', () => {
  const img = createImage(1, 1);
  setPixel(img, 0, 0, ...hexToRgb('#e8b088'), 255); // tono viejo de PixelForge, no está en el maestro
  const { image: out, report } = quantize(img);
  const [r, g, b] = getPixel(out, 0, 0);
  const hex = rgbToHex(r, g, b);
  assert.ok(['#7a5230', '#986a44', '#c98d54', '#e0ac69'].includes(hex), `esperaba rampa de piel, salio ${hex}`);
  assert.ok(report.maxDeltaE >= 0);
});
