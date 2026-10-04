import { describe, expect, it } from 'vitest';
import {
  addFrame,
  addLayer,
  celKey,
  cloneDoc,
  compositeFrame,
  createDoc,
  deserializeDoc,
  duplicateFrame,
  duplicateLayer,
  emptyCel,
  exportLegacyFrames,
  flattenFrame,
  floodFill,
  getCel,
  moveLayer,
  newId,
  plotLine,
  plotPixel,
  plotRect,
  removeFrame,
  removeLayer,
  sanitizeName,
  serializeDoc,
  type SpriteDoc,
} from '../src/model/document.js';

/** Pinta un pixel directo en el cel activo del primer layer/frame. */
function px(doc: SpriteDoc, x: number, y: number, hex: string): void {
  getCel(doc, doc.layers[0]!.id, doc.frames[0]!.id)[y * doc.width + x] = hex;
}

describe('modelo SpriteDocument (tarea 9)', () => {
  describe('createDoc', () => {
    it('crea doc con 1 capa, 1 frame, cel vacio y paleta master', () => {
      const doc = createDoc('hero', 16, 24);
      expect(doc.name).toBe('hero');
      expect(doc.width).toBe(16);
      expect(doc.height).toBe(24);
      expect(doc.layers).toHaveLength(1);
      expect(doc.frames).toHaveLength(1);
      expect(doc.palette.length).toBeGreaterThan(0);
      const cel = doc.cels[celKey(doc.layers[0]!.id, doc.frames[0]!.id)];
      expect(cel).toHaveLength(16 * 24);
      expect(cel!.every((c) => c === null)).toBe(true);
    });

    it('newId genera ids unicos', () => {
      expect(newId('ly')).not.toBe(newId('ly'));
    });

    it('emptyCel llena de null con el tamano del doc', () => {
      expect(emptyCel({ width: 3, height: 2 })).toEqual([null, null, null, null, null, null]);
    });

    it('getCel crea el cel perezosamente si falta', () => {
      const doc = createDoc('s', 4, 4);
      const l = addLayer(doc);
      // addLayer ya crea cels; forzamos el camino perezoso borrandolo.
      delete doc.cels[celKey(l.id, doc.frames[0]!.id)];
      const cel = getCel(doc, l.id, doc.frames[0]!.id);
      expect(cel).toHaveLength(16);
      expect(doc.cels[celKey(l.id, doc.frames[0]!.id)]).toBe(cel);
    });
  });

  describe('operaciones de capa', () => {
    it('addLayer agrega capa con cel por cada frame', () => {
      const doc = createDoc('s', 4, 4);
      addFrame(doc);
      const l = addLayer(doc, 'sombra');
      expect(doc.layers).toHaveLength(2);
      expect(l.name).toBe('sombra');
      for (const f of doc.frames) expect(doc.cels[celKey(l.id, f.id)]).toBeDefined();
    });

    it('duplicateLayer copia pixeles y queda encima del original', () => {
      const doc = createDoc('s', 2, 2);
      px(doc, 0, 0, '#ff0000');
      const copy = duplicateLayer(doc, doc.layers[0]!.id);
      expect(copy).not.toBeNull();
      expect(doc.layers[1]!.id).toBe(copy!.id);
      expect(getCel(doc, copy!.id, doc.frames[0]!.id)[0]).toBe('#ff0000');
      // copia independiente: mutar el original no toca la copia
      px(doc, 1, 1, '#00ff00');
      expect(getCel(doc, copy!.id, doc.frames[0]!.id)[3]).toBeNull();
    });

    it('removeLayer no borra la ultima capa', () => {
      const doc = createDoc('s', 2, 2);
      removeLayer(doc, doc.layers[0]!.id);
      expect(doc.layers).toHaveLength(1);
    });

    it('removeLayer borra la capa y sus cels', () => {
      const doc = createDoc('s', 2, 2);
      const l = addLayer(doc);
      removeLayer(doc, l.id);
      expect(doc.layers.some((x) => x.id === l.id)).toBe(false);
      expect(Object.keys(doc.cels).some((k) => k.startsWith(`${l.id}:`))).toBe(false);
    });

    it('moveLayer reordena y respeta los limites', () => {
      const doc = createDoc('s', 2, 2);
      const a = doc.layers[0]!;
      const b = addLayer(doc);
      moveLayer(doc, b.id, -1);
      expect(doc.layers[0]!.id).toBe(b.id);
      moveLayer(doc, b.id, -1); // ya esta abajo: no-op
      expect(doc.layers[0]!.id).toBe(b.id);
      expect(doc.layers[1]!.id).toBe(a.id);
    });
  });

  describe('operaciones de frame', () => {
    it('addFrame inserta despues del indice dado y crea cels', () => {
      const doc = createDoc('s', 2, 2);
      const f = addFrame(doc, 0);
      expect(doc.frames).toHaveLength(2);
      expect(doc.frames[1]!.id).toBe(f.id);
      for (const l of doc.layers) expect(doc.cels[celKey(l.id, f.id)]).toBeDefined();
    });

    it('duplicateFrame copia los pixeles de todas las capas', () => {
      const doc = createDoc('s', 2, 2);
      px(doc, 0, 0, '#abcdef');
      const copy = duplicateFrame(doc, 0);
      expect(copy).not.toBeNull();
      expect(getCel(doc, doc.layers[0]!.id, copy!.id)[0]).toBe('#abcdef');
    });

    it('removeFrame no borra el ultimo y clampa/descarta tags', () => {
      const doc = createDoc('s', 2, 2);
      addFrame(doc);
      addFrame(doc); // 3 frames: 0,1,2
      doc.tags.push({ name: 'walk', from: 1, to: 2 });
      removeFrame(doc, 2); // quedan 2 frames
      expect(doc.frames).toHaveLength(2);
      expect(doc.tags[0]).toMatchObject({ from: 1, to: 1 });
      // no borra el ultimo frame
      removeFrame(doc, 0);
      removeFrame(doc, 0);
      expect(doc.frames).toHaveLength(1);
    });
  });

  describe('herramientas de dibujo', () => {
    it('plotPixel respeta brush y recorta fuera de limites', () => {
      const doc = createDoc('s', 4, 4);
      const cel = getCel(doc, doc.layers[0]!.id, doc.frames[0]!.id);
      plotPixel(doc, cel, 1, 1, '#fff', 2, false, false);
      // brush 2 con half=1 → (0,0),(1,0),(0,1),(1,1)
      expect([cel[0], cel[1], cel[4], cel[5]].every((c) => c === '#fff')).toBe(true);
      // borde: pixel en la esquina no desborda al vecino de otra fila
      const cel2 = emptyCel(doc);
      plotPixel(doc, cel2, 3, 0, '#fff', 1, false, false);
      expect(cel2[3]).toBe('#fff');
      expect(cel2[4]).toBeNull();
    });

    it('plotPixel con mirrorH refleja en el eje vertical', () => {
      const doc = createDoc('s', 4, 4);
      const cel = emptyCel(doc);
      plotPixel(doc, cel, 0, 2, '#fff', 1, true, false);
      expect(cel[2 * 4 + 0]).toBe('#fff');
      expect(cel[2 * 4 + 3]).toBe('#fff'); // width-1-0 = 3
    });

    it('plotLine traza una diagonal contigua (Bresenham)', () => {
      const doc = createDoc('s', 4, 4);
      const cel = emptyCel(doc);
      plotLine(doc, cel, 0, 0, 3, 3, '#fff', 1, false, false);
      expect([cel[0], cel[5], cel[10], cel[15]].every((c) => c === '#fff')).toBe(true);
    });

    it('plotRect dibuja el contorno cerrado', () => {
      const doc = createDoc('s', 4, 4);
      const cel = emptyCel(doc);
      plotRect(doc, cel, 0, 0, 3, 3, '#fff', 1, false, false);
      expect(cel[0]).toBe('#fff'); // esquinas
      expect(cel[3]).toBe('#fff');
      expect(cel[12]).toBe('#fff');
      expect(cel[15]).toBe('#fff');
      expect(cel[5]).toBeNull(); // interior vacio
    });

    it('floodFill rellena la region contigua y es no-op si ya es del color', () => {
      const doc = createDoc('s', 3, 3);
      const cel = emptyCel(doc);
      floodFill(doc, cel, 1, 1, '#f00');
      expect(cel.every((c) => c === '#f00')).toBe(true);
      const before = [...cel];
      floodFill(doc, cel, 1, 1, '#f00'); // target === color
      expect(cel).toEqual(before);
    });
  });

  describe('composicion', () => {
    it('compositeFrame pinta un pixel opaco a RGBA', () => {
      const doc = createDoc('s', 2, 2);
      px(doc, 0, 0, '#ff0000');
      const out = compositeFrame(doc, 0);
      expect([out[0], out[1], out[2], out[3]]).toEqual([255, 0, 0, 255]);
      expect([out[4], out[5], out[6], out[7]]).toEqual([0, 0, 0, 0]);
    });

    it('la opacidad de capa se aplica al componer', () => {
      const doc = createDoc('s', 1, 1);
      doc.layers[0]!.opacity = 0.5;
      px(doc, 0, 0, '#0000ff');
      const out = compositeFrame(doc, 0);
      expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, 255, 128]);
    });

    it('capa invisible no se compone; solo aisla una capa', () => {
      const doc = createDoc('s', 1, 1);
      px(doc, 0, 0, '#111111');
      const top = addLayer(doc);
      getCel(doc, top.id, doc.frames[0]!.id)[0] = '#00ff00';
      top.visible = false;
      // invisible → solo se ve la de abajo
      expect(Array.from(compositeFrame(doc, 0).slice(0, 4))).toEqual([0x11, 0x11, 0x11, 255]);
      // solo top → solo se ve la de arriba (aunque este invisible)
      const solo = compositeFrame(doc, 0, { soloLayerId: top.id });
      expect(Array.from(solo.slice(0, 4))).toEqual([0, 255, 0, 255]);
    });

    it('flattenFrame umbraliza alpha al 50%', () => {
      const doc = createDoc('s', 1, 1);
      px(doc, 0, 0, '#0000ff');
      doc.layers[0]!.opacity = 0.5; // alpha 128 > 127 → incluido
      expect(flattenFrame(doc, 0)[0]).toBe('#0000ff');
      doc.layers[0]!.opacity = 0.4; // alpha 102 <= 127 → descartado
      expect(flattenFrame(doc, 0)[0]).toBeNull();
    });
  });

  describe('serializacion .pfx (tarea 9)', () => {
    it('round-trip .pfx v2 preserva todo el documento', () => {
      const doc = createDoc('hero', 8, 8);
      px(doc, 2, 3, '#ff00ff');
      const l = addLayer(doc, 'outline');
      l.opacity = 0.7;
      const f = addFrame(doc);
      getCel(doc, l.id, f.id)[0] = '#00ffff';
      doc.tags.push({ name: 'idle', from: 0, to: 1 });

      const round = deserializeDoc(serializeDoc(doc), 'fallback');
      expect(round).toEqual(doc);
    });

    it('serializeDoc emite el marcador de version pfx:2', () => {
      const parsed = JSON.parse(serializeDoc(createDoc('s', 4, 4)));
      expect(parsed.pfx).toBe(2);
    });

    it('cloneDoc produce copia profunda independiente', () => {
      const doc = createDoc('s', 2, 2);
      px(doc, 0, 0, '#ff0000');
      const clone = cloneDoc(doc);
      expect(clone).toEqual(doc);
      px(clone, 1, 1, '#00ff00');
      expect(getCel(doc, doc.layers[0]!.id, doc.frames[0]!.id)[3]).toBeNull();
    });

    it('importa legacy cuadrado {N,pixels,palette} como 1 capa/1 frame', () => {
      const legacy = JSON.stringify({
        N: 2,
        pixels: ['#ff0000', null, null, '#00ff00'],
        palette: ['#ff0000', '#00ff00'],
      });
      const doc = deserializeDoc(legacy, 'legacy');
      expect([doc.width, doc.height]).toEqual([2, 2]);
      expect(doc.layers).toHaveLength(1);
      expect(doc.frames).toHaveLength(1);
      const cel = getCel(doc, doc.layers[0]!.id, doc.frames[0]!.id);
      expect(cel[0]).toBe('#ff0000');
      expect(cel[3]).toBe('#00ff00');
      expect(doc.palette).toEqual(['#ff0000', '#00ff00']);
    });

    it('importa legacy no cuadrado via W/H', () => {
      const legacy = JSON.stringify({
        W: 3,
        H: 2,
        pixels: new Array(6).fill(null),
        palette: ['#fff'],
      });
      const doc = deserializeDoc(legacy, 'legacy');
      expect([doc.width, doc.height]).toEqual([3, 2]);
    });

    it('formato irreconocible lanza error', () => {
      expect(() => deserializeDoc(JSON.stringify({ foo: 1 }), 'x')).toThrow();
    });
  });

  describe('export legacy para el pipeline Godot', () => {
    it('emite un archivo por frame con nombre <char>_<anim>_<n>.json', () => {
      const doc = createDoc('Hero Knight', 4, 4);
      addFrame(doc);
      const files = exportLegacyFrames(doc);
      expect(files.map((f) => f.name)).toEqual([
        'hero_knight_idle_0.json',
        'hero_knight_idle_1.json',
      ]);
      const body = JSON.parse(files[0]!.text);
      expect(body.N).toBe(4); // cuadrado → incluye N ademas de W/H
      expect(body.W).toBe(4);
      expect(body.H).toBe(4);
      expect(body.pixels).toHaveLength(16);
    });

    it('un tag limita el rango y renumera desde 0', () => {
      const doc = createDoc('boss', 4, 4);
      addFrame(doc);
      addFrame(doc); // frames 0,1,2
      const files = exportLegacyFrames(doc, { name: 'walk', from: 1, to: 2 });
      expect(files.map((f) => f.name)).toEqual(['boss_walk_0.json', 'boss_walk_1.json']);
    });

    it('registra tamano nativo y escala reproducible para Godot', () => {
      const doc = createDoc('hero', 16, 24);
      const [file] = exportLegacyFrames(doc, undefined, 4);
      const body = JSON.parse(file!.text);
      expect(body.W).toBe(16);
      expect(body.H).toBe(24);
      expect(body.pixels).toHaveLength(16 * 24);
      expect(body.pixelforge.nativeSize).toEqual({ width: 16, height: 24 });
      expect(body.pixelforge.exportScale).toBe(4);
    });

    it('rechaza escalas no enteras o fuera de 1x-8x', () => {
      const doc = createDoc('hero', 16, 16);
      expect(() => exportLegacyFrames(doc, undefined, 0)).toThrow(/1 y 8/);
      expect(() => exportLegacyFrames(doc, undefined, 1.5)).toThrow(/1 y 8/);
      expect(() => exportLegacyFrames(doc, undefined, 9)).toThrow(/1 y 8/);
    });

    it('sanitizeName normaliza a slug seguro', () => {
      expect(sanitizeName('My Sprite!!')).toBe('my_sprite');
      expect(sanitizeName('###')).toBe('sprite');
    });
  });
});
