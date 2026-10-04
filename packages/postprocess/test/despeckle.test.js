import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage, setPixel, pixelHex, isOpaque } from '../image.js';
import { despeckle } from '../ops/despeckle.js';
import { hexToRgb } from '../color.js';

// spec §9 test 3. No hay coords exactas de tavo_down/ic_dinero disponibles en el
// JSON crudo del asset (grid PixelForge sin visor); se reproduce el caso descrito
// literalmente en §4.2 con un fixture sintético: "eyes" 1px cuyo vecindario NO es
// uniforme (protegidos) vs. un speckle real de generador (vecindario uniforme,
// se borra), + una isla huérfana desconectada del componente principal.
function buildFixture() {
  const img = createImage(12, 12);
  const blue = hexToRgb('#3584e4');
  const skinLight = hexToRgb('#e0ac69');
  const ink = hexToRgb('#1b1e2b');
  const alert = hexToRgb('#c95c4b');

  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= 8; x++) setPixel(img, x, y, ...blue, 255);
  }
  // "ojos": 1px, aparecen 2 veces en toda la imagen, pero con vecindario roto
  // (no todos los 8 vecinos son iguales) -> no deben borrarse/recolorearse.
  setPixel(img, 3, 3, ...ink, 255);
  setPixel(img, 3, 2, ...skinLight, 255);
  setPixel(img, 6, 3, ...ink, 255);
  setPixel(img, 6, 2, ...skinLight, 255);
  // speckle real de generador: único, encapsulado 8/8 en el mismo color.
  setPixel(img, 5, 5, ...alert, 255);
  // isla huérfana, sin contacto con el componente principal.
  setPixel(img, 11, 11, ...hexToRgb('#c0bfbc'), 255);
  return img;
}

test('despeckle conservative preserves 1px detail with non-uniform neighborhood', () => {
  const img = buildFixture();
  const { image: out } = despeckle(img, { mode: 'conservative' });
  assert.equal(pixelHex(out, 3, 3), '#1b1e2b');
  assert.equal(pixelHex(out, 6, 3), '#1b1e2b');
});

test('despeckle conservative removes an encapsulated single-color speckle', () => {
  const img = buildFixture();
  const { image: out, report } = despeckle(img, { mode: 'conservative' });
  assert.equal(pixelHex(out, 5, 5), '#3584e4');
  assert.equal(report.recoloredPixels, 1);
});

test('despeckle removes an orphan island not touching the main component', () => {
  const img = buildFixture();
  const { image: out, report } = despeckle(img, { mode: 'conservative' });
  assert.equal(isOpaque(out, 11, 11), false);
  assert.equal(report.removedIslands, 1);
  assert.equal(report.removedPixels, 1);
});

test('despeckle off is a strict no-op', () => {
  const img = buildFixture();
  const { image: out, report } = despeckle(img, { mode: 'off' });
  assert.deepEqual(out.data, img.data);
  assert.equal(report.removedIslands, 0);
});
