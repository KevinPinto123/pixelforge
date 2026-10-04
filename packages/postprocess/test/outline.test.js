import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage, setPixel, pixelHex } from '../image.js';
import { outline } from '../ops/outline.js';
import { hexToRgb } from '../color.js';

function buildBlob() {
  const img = createImage(6, 6);
  const violet = hexToRgb('#7c5cff');
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) setPixel(img, x, y, ...violet, 255);
  return img;
}

// spec §9 test 4: outline(outline(x)) == outline(x); skip con already_outlined.
test('outline external adds ink around the silhouette', () => {
  const { image: out, report } = outline(buildBlob(), { mode: 'external', expandCanvas: true });
  assert.equal(report.applied, true);
  assert.ok(report.addedPixels > 0);
  // esquina superior-izquierda del blob original (1,1) ahora vive en (2,2) tras
  // expandCanvas +1px; su vecino (1,2) debe ser ink.
  assert.equal(pixelHex(out, 1, 2), '#1b1e2b');
});

test('outline is idempotent: running it twice equals running it once', () => {
  const once = outline(buildBlob(), { mode: 'external', expandCanvas: true });
  const twice = outline(once.image, { mode: 'external', expandCanvas: true });
  assert.equal(twice.report.skipped, 'already_outlined');
  assert.deepEqual(twice.image.data, once.image.data);
});

test('outline internal marks opaque border pixels without expanding canvas', () => {
  const blob = buildBlob();
  const { image: out, report } = outline(blob, { mode: 'internal' });
  assert.equal(out.width, blob.width);
  assert.equal(pixelHex(out, 1, 1), '#1b1e2b'); // esquina, borde
  assert.equal(pixelHex(out, 2, 2), '#7c5cff'); // centro del 3x3, no es borde
  assert.ok(report.addedPixels > 0);
});
