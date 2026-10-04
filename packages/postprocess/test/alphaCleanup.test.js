import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage, setPixel, getPixel } from '../image.js';
import { alphaCleanup } from '../ops/alphaCleanup.js';
import { hexToRgb } from '../color.js';

// spec §9 test 5: fixture de halo semitransparente (tipo rembg) -> 0 px con
// 0<a<255 y 0 halos grises tras el binarizado+defringe.
test('alpha_cleanup binarizes alpha and defringes a rembg-style gray halo', () => {
  const img = createImage(5, 5);
  const blue = hexToRgb('#3584e4');
  const halo = [210, 210, 210]; // gris claro, premultiplicado contra fondo blanco

  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) setPixel(img, x, y, ...blue, 255);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const isRing = x === 0 || x === 4 || y === 0 || y === 4;
      if (isRing) setPixel(img, x, y, ...halo, 180); // >= threshold 128: queda opaco
    }
  }

  const { image: out, report } = alphaCleanup(img, { threshold: 128, defringe: true });

  let semiTransparent = 0;
  let grayHaloRemaining = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const [r, g, b, a] = getPixel(out, x, y);
      if (a > 0 && a < 255) semiTransparent++;
      if (a === 255 && r === halo[0] && g === halo[1] && b === halo[2]) grayHaloRemaining++;
    }
  }
  assert.equal(semiTransparent, 0);
  assert.equal(grayHaloRemaining, 0);
  assert.ok(report.defringedPixels > 0);
});

test('alpha_cleanup drops sub-threshold alpha to fully transparent rgba(0,0,0,0)', () => {
  const img = createImage(1, 1);
  setPixel(img, 0, 0, 200, 100, 50, 60); // alpha < 128
  const { image: out } = alphaCleanup(img);
  assert.deepEqual(getPixel(out, 0, 0), [0, 0, 0, 0]);
});
