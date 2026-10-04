import { useMemo, useState } from 'react';
import {
  exportLegacyFrames,
  sanitizeName,
  serializeDoc,
  type SpriteDoc,
} from '../model/document.js';
import { spritesheetPngBase64 } from '../model/raster.js';

export interface ExportPanelProps {
  doc: SpriteDoc;
  rev: number;
  onLine: (line: string) => void;
}

type Target = 'godot-json' | 'spritesheet' | 'pfx';

/**
 * Tab EXPORT (UX §9): el preview del manifest ES la feature — antes de exportar
 * ves exactamente qué archivos salen. `godot-json` emite el esquema legacy
 * {W,H,pixels,palette} por frame con convención `<char>_<anim>_<n>.json` que
 * consume videocoder-game/godot/tools/pixelforge_atlas.gd (atlas + SpriteFrames).
 */
export function ExportPanel({ doc, rev, onLine }: ExportPanelProps) {
  const [target, setTarget] = useState<Target>('godot-json');
  const [scale, setScale] = useState(1);
  const [tagIndex, setTagIndex] = useState<number | 'all'>('all');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tag = tagIndex === 'all' ? undefined : doc.tags[tagIndex];
  const base = sanitizeName(doc.name);

  const manifest = useMemo(() => {
    void rev;
    const frames = tag ? tag.to - tag.from + 1 : doc.frames.length;
    switch (target) {
      case 'godot-json':
        return exportLegacyFrames(doc, tag, scale).map(
          (f) =>
            `${f.name}  native ${doc.width}x${doc.height} -> export ${doc.width * scale}x${doc.height * scale}  ${scale}x nearest`,
        );
      case 'spritesheet':
        return [
          `${base}.png  ${doc.width * scale * frames}×${doc.height * scale}  ${frames} fr  ${scale}×`,
          `${base}.json  frames+durations+tags`,
        ];
      case 'pfx':
        return [`${base}.pfx.json  doc completo (capas+frames+cels+paleta)`];
    }
  }, [doc, rev, target, scale, tag, base]);

  async function doExport(): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      if (target === 'pfx') {
        const saved = await window.pixelforge.savePfx({ defaultName: base, json: serializeDoc(doc) });
        setResult(saved.path ? `guardado: ${saved.path}` : 'cancelado');
        if (saved.path) onLine(`${base}.pfx.json guardado`);
        return;
      }

      const files: Array<{ name: string; text?: string; dataBase64?: string }> = [];
      if (target === 'godot-json') {
        files.push(...exportLegacyFrames(doc, tag, scale));
      } else {
        const from = tag?.from ?? 0;
        const to = tag?.to ?? doc.frames.length - 1;
        files.push({ name: `${base}.png`, dataBase64: spritesheetPngBase64(doc, scale, from, to) });
        files.push({
          name: `${base}.json`,
          text: JSON.stringify(
            {
              name: doc.name,
              width: doc.width,
              height: doc.height,
              scale,
              frames: doc.frames.slice(from, to + 1).map((f, i) => ({
                index: i,
                durationMs: f.durationMs,
                x: i * doc.width * scale,
                y: 0,
                w: doc.width * scale,
                h: doc.height * scale,
              })),
              tags: doc.tags,
            },
            null,
            2,
          ),
        });
      }
      const out = await window.pixelforge.exportBundle({ files });
      if (out.dir) {
        setResult(`✔ ${out.written.length} archivo(s) → ${out.dir}`);
        onLine(`export ${target}: ${out.written.length} archivo(s) escritos`);
      } else {
        setResult('cancelado');
      }
    } catch (err) {
      setResult(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="zone3-body">
      <label>
        target
        <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
          <option value="godot-json">Godot (JSON pixelforge_atlas)</option>
          <option value="spritesheet">Spritesheet PNG + JSON</option>
          <option value="pfx">.pfx (guardar documento)</option>
        </select>
      </label>
      <div className="row">
        {target !== 'pfx' && (
          <label>
            escala
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              {[1, 2, 4, 8].map((s) => (
                <option key={s} value={s}>
                  {s}× nearest
                </option>
              ))}
            </select>
          </label>
        )}
        {target !== 'pfx' && (
          <label>
            alcance
            <select
              value={tagIndex}
              onChange={(e) => setTagIndex(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">todos los frames</option>
              {doc.tags.map((t, i) => (
                <option key={`${t.name}_${i}`} value={i}>
                  tag: {t.name} ({t.from + 1}–{t.to + 1})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div>
        <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>PREVIEW MANIFEST</div>
        <div className="manifest">
          {manifest.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>
      <button type="button" className="accent" disabled={busy} onClick={() => void doExport()}>
        Exportar
      </button>
      {result && <div style={{ color: 'var(--text-dim)' }}>{result}</div>}
    </div>
  );
}
