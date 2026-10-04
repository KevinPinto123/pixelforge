import { useCallback, useEffect, useState } from 'react';
import type { SpriteDoc } from '../model/document.js';
import { serializeDoc } from '../model/document.js';
import { spritesheetPngBase64 } from '../model/raster.js';
import type { GalleryItem } from '../vite-env.js';

/**
 * Galeria: biblioteca local de sprites, estilo "home" de Aseprite. Lista los
 * .pfx.json guardados en %APPDATA%/pixelforge/gallery con su miniatura, permite
 * reabrirlos en el lienzo y borrarlos. "Guardar en galeria" serializa el doc
 * actual + rasteriza una miniatura del frame 0 y la persiste sin dialogo.
 */
export function GalleryPanel({
  doc,
  rev,
  onOpen,
  onLine,
}: {
  doc: SpriteDoc;
  rev: number;
  onOpen: (json: string, name: string) => void;
  onLine: (line: string) => void;
}) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setItems(await window.pixelforge.galleryList());
    } catch (err) {
      onLine(`✗ galeria: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [onLine]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveCurrent(): Promise<void> {
    setBusy(true);
    try {
      // Miniatura: frame 0 a escala 4x (capada) para que se vea en la grilla.
      const scale = Math.max(1, Math.min(6, Math.round(96 / doc.width)));
      const thumbBase64 = spritesheetPngBase64(doc, scale, 0, 1);
      const res = await window.pixelforge.gallerySave({
        name: doc.name.replace(/\.pfx\.json$/, ''),
        json: serializeDoc(doc),
        thumbBase64,
      });
      onLine(`✓ en galeria: ${res.path}`);
      await refresh();
    } catch (err) {
      onLine(`✗ guardar en galeria: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function open(item: GalleryItem): Promise<void> {
    try {
      const res = await window.pixelforge.galleryOpen(item.path);
      onOpen(res.json, res.name);
      onLine(`abierto de galeria: ${res.name}`);
    } catch (err) {
      onLine(`✗ abrir: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function remove(item: GalleryItem, e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    try {
      await window.pixelforge.galleryDelete(item.path);
      await refresh();
    } catch (err) {
      onLine(`✗ borrar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // rev fuerza re-render cuando cambia el doc (para reflejar el nombre en el boton).
  void rev;

  return (
    <div className="gallery-panel">
      <div className="gallery-actions">
        <button type="button" className="accent" disabled={busy} onClick={() => void saveCurrent()}>
          ＋ Guardar en galería
        </button>
        <button type="button" onClick={() => void refresh()}>
          ↻
        </button>
      </div>

      {items.length === 0 ? (
        <div className="gallery-empty">
          Sin sprites guardados todavía.
          <br />
          Dibuja o genera con IA, luego “Guardar en galería”.
        </div>
      ) : (
        <div className="gallery-grid">
          {items.map((item) => (
            <div
              key={item.path}
              className="gallery-item"
              title={item.name}
              onClick={() => void open(item)}
            >
              <div className="gallery-thumb">
                {item.thumbDataUrl ? (
                  <img src={item.thumbDataUrl} alt={item.name} />
                ) : (
                  <div className="gallery-thumb-empty">?</div>
                )}
              </div>
              <div className="gallery-name">{item.name}</div>
              <button
                type="button"
                className="gallery-del"
                title="borrar"
                onClick={(e) => void remove(item, e)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
