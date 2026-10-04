import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gridToImage } from '../image.js';
import { alphaCleanup } from '../ops/alphaCleanup.js';
import { quantize } from '../ops/quantize.js';
import { despeckle } from '../ops/despeckle.js';
import { validate } from '../ops/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Fixtures vendoreados desde vibecoder-latam/assets/characters (tavo_*.json) —
// packages/core es autocontenido, no lee cross-repo.
const CHARACTERS_DIR = path.join(__dirname, 'fixtures', 'characters');

function loadFrame(fileName, role) {
  const grid = JSON.parse(readFileSync(path.join(CHARACTERS_DIR, `${fileName}.json`), 'utf8'));
  let img = gridToImage(grid);
  img = alphaCleanup(img).image;
  img = quantize(img).image; // el asset esta en paleta vieja de PixelForge, no en el maestro
  img = despeckle(img, { mode: 'conservative' }).image;
  return { name: fileName, role, image: img };
}

// spec §9 test 1: golden set Tavo debe pasar `validate` con verdict pass total.
// El árbol actual trae 18 frames tavo_* (no 13): se agrupan en sets semánticos
// (direcciones / ciclos de animación de a pares) porque validate() compara forma
// entre frames DE LA MISMA pose — correr los 18 mezclados no tiene sentido semántico.
const GROUPS = [
  { name: 'directions', kind: 'directions', files: [['tavo_down', 'down'], ['tavo_up', 'up'], ['tavo_side_r', 'side']] },
  { name: 'walk_down', kind: 'animation', files: [['tavo_walk_down_a'], ['tavo_walk_down_b']] },
  { name: 'walk_up', kind: 'animation', files: [['tavo_walk_up_a'], ['tavo_walk_up_b']] },
  { name: 'walk_side', kind: 'animation', files: [['tavo_walk_side_a'], ['tavo_walk_side_b']] },
  { name: 'run', kind: 'animation', files: [['tavo_run_a'], ['tavo_run_b']] },
  { name: 'type', kind: 'animation', files: [['tavo_type_a'], ['tavo_type_b']] },
  { name: 'sleep', kind: 'animation', files: [['tavo_lie'], ['tavo_sleep_a'], ['tavo_sleep_b']] },
  { name: 'sit', kind: 'animation', files: [['tavo_sit_in'], ['tavo_sit_idle']] },
];

test('golden set: all tavo_* frames on disk are covered by the grouping above', () => {
  const onDisk = readdirSync(CHARACTERS_DIR)
    .filter((f) => /^tavo_.*\.json$/.test(f) && !f.includes('_v2'))
    .map((f) => f.replace('.json', ''));
  const grouped = GROUPS.flatMap((g) => g.files.map(([f]) => f));
  assert.deepEqual([...grouped].sort(), [...onDisk].sort());
});

for (const group of GROUPS) {
  test(`golden set: tavo_${group.name} passes validate with no fail`, () => {
    const frames = group.files.map(([f, role]) => loadFrame(f, role));
    const report = validate({ kind: group.kind, frames });
    const failed = report.checks.filter((c) => c.level === 'fail');
    assert.equal(failed.length, 0, `fails: ${JSON.stringify(failed, null, 2)}`);
  });
}
