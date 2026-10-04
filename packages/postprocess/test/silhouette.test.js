import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage, setPixel, flipH, iou } from '../image.js';
import { validate } from '../ops/validate.js';
import { hexToRgb } from '../color.js';

function asymSilhouette(w, h) {
  const img = createImage(w, h);
  const c = hexToRgb('#3584e4');
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < 3 + y % 4; x++) setPixel(img, x, y, ...c, 255); // forma no simetrica
  }
  return img;
}

// spec §9 test 6: espejo perfecto -> IoU 1.0; un pixel movido -> <1.0 y >0.95.
test('sil.flip: perfect mirror gives IoU 1.0', () => {
  const right = asymSilhouette(16, 16);
  const left = flipH(right);
  assert.equal(iou(left, flipH(right)), 1);
});

test('sil.flip: one shifted pixel gives IoU strictly between 0.95 and 1.0', () => {
  const right = asymSilhouette(16, 16);
  const left = flipH(right);
  // desplazar 1px la version "left" dibujada a mano: apagar un opaco y prender uno nuevo
  const c = hexToRgb('#3584e4');
  setPixel(left, 13, 13, 0, 0, 0, 0);
  setPixel(left, 13, 12, ...c, 255);
  const value = iou(left, flipH(right));
  assert.ok(value < 1 && value > 0.95, `esperaba (0.95,1), salio ${value}`);
});

test('validate.sil.flip check: perfect mirror passes, drawn "left" outlier fails', () => {
  const right = asymSilhouette(16, 16);
  const goodLeft = flipH(right);
  const passReport = validate({
    kind: 'directions',
    frames: [{ name: 'side_r', role: 'right', image: right }, { name: 'side_l', role: 'left', image: goodLeft }],
  });
  const flipCheck = passReport.checks.find((c) => c.id === 'sil.flip');
  assert.equal(flipCheck.level, 'pass');

  const badLeft = asymSilhouette(16, 16); // copia SIN espejar de right -> silueta distinta
  const failReport = validate({
    kind: 'directions',
    frames: [{ name: 'side_r', role: 'right', image: right }, { name: 'side_l', role: 'left', image: badLeft }],
  });
  const failCheck = failReport.checks.find((c) => c.id === 'sil.flip');
  assert.equal(failCheck.level, 'fail');
});
