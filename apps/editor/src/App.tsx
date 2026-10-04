import { useCallback, useEffect, useRef, useState } from 'react';
import { ExportPanel } from './components/ExportPanel.js';
import { GalleryPanel } from './components/GalleryPanel.js';
import { GeneratePanel } from './components/GeneratePanel.js';
import { LayersPanel } from './components/LayersPanel.js';
import { PalettePanel } from './components/PalettePanel.js';
import { StatusBar } from './components/StatusBar.js';
import { Timeline } from './components/Timeline.js';
import { TOOL_LABELS, Toolbar, type ToolId } from './components/Toolbar.js';
import { Viewport } from './components/Viewport.js';
import {
  addFrame,
  addLayer,
  createDoc,
  deserializeDoc,
  duplicateFrame,
  duplicateLayer,
  getCel,
  moveLayer,
  removeFrame,
  removeLayer,
  serializeDoc,
  DOC_SIZES,
  type AnimTag,
  type SpriteDoc,
} from './model/document.js';
import { History } from './model/history.js';
import type { DecodedImage } from './model/raster.js';
import type { HealthzInfo } from './vite-env.js';
import './styles.css';

const AUTOSAVE_KEY = 'pixelforge.autosave.v2';
const AUTOSAVE_MS = 30_000;

function blit(doc: SpriteDoc, cel: (string | null)[], image: DecodedImage): void {
  const w = Math.min(doc.width, image.width);
  const h = Math.min(doc.height, image.height);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const px = image.pixels[y * image.width + x];
      if (px != null) cel[y * doc.width + x] = px;
    }
  }
}

/**
 * PixelForge Editor — shell del editor real (Fase 1 tareas 9-16 sobre el árbol
 * canónico + generation panel Fase 2 tarea 27 con progreso en vivo). Layout y
 * atajos según UX-PIXELFORGE-EDITOR.md; tema oscuro único con PALETTE-MASTER.
 */
export function App() {
  // ── documento (mutable + rev para render) ─────────────────────────
  const docRef = useRef<SpriteDoc>(createDoc('sprite', 32, 32));
  const historyRef = useRef(new History());
  const [rev, setRev] = useState(0);
  const refresh = useCallback(() => setRev((r) => r + 1), []);
  const doc = docRef.current;

  // ── seleccion / vista ─────────────────────────────────────────────
  const [activeLayerId, setActiveLayerId] = useState(doc.layers[0]!.id);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [soloLayerId, setSoloLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId>('pencil');
  const [brushSize, setBrushSize] = useState(1);
  const [primary, setPrimary] = useState('#7c5cff');
  const [secondary, setSecondary] = useState('#1b1e2b');
  const [mirrorH, setMirrorH] = useState(false);
  const [mirrorV, setMirrorV] = useState(false);
  const [zoom, setZoom] = useState(8);
  const [showGrid, setShowGrid] = useState(true);
  const [onionSkin, setOnionSkin] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [timelineCollapsed, setTimelineCollapsed] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
  const [zone3, setZone3] = useState<'generate' | 'export' | 'gallery'>('generate');
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [health, setHealth] = useState<HealthzInfo | null>(null);
  const [jobLine, setJobLine] = useState<string | null>(null);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('pixelforge.theme') === 'dark' ? 'dark' : 'light',
  );
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pixelforge.theme', theme);
  }, [theme]);

  const refitCanvas = useCallback(() => {
    requestAnimationFrame(() => setFitSignal((signal) => signal + 1));
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((value) => !value);
    refitCanvas();
  }, [refitCanvas]);

  const pushHistory = useCallback(() => {
    historyRef.current.push(docRef.current);
  }, []);

  /** Mutación con snapshot de undo. */
  const mutate = useCallback(
    (fn: (d: SpriteDoc) => void) => {
      pushHistory();
      fn(docRef.current);
      refresh();
    },
    [pushHistory, refresh],
  );

  const ensureSelectionValid = useCallback(() => {
    const d = docRef.current;
    if (!d.layers.some((l) => l.id === activeLayerId)) {
      setActiveLayerId(d.layers[d.layers.length - 1]!.id);
    }
    if (activeFrameIndex >= d.frames.length) setActiveFrameIndex(d.frames.length - 1);
    if (soloLayerId && !d.layers.some((l) => l.id === soloLayerId)) setSoloLayerId(null);
  }, [activeLayerId, activeFrameIndex, soloLayerId]);

  useEffect(ensureSelectionValid, [rev, ensureSelectionValid]);

  const undo = useCallback(() => {
    const next = historyRef.current.undo(docRef.current);
    if (next) {
      docRef.current = next;
      refresh();
    }
  }, [refresh]);

  const redo = useCallback(() => {
    const next = historyRef.current.redo(docRef.current);
    if (next) {
      docRef.current = next;
      refresh();
    }
  }, [refresh]);

  const replaceDoc = useCallback(
    (next: SpriteDoc) => {
      docRef.current = next;
      historyRef.current.clear();
      setActiveLayerId(next.layers[next.layers.length - 1]!.id);
      setActiveFrameIndex(0);
      setSoloLayerId(null);
      setActiveTagIndex(null);
      setPlaying(false);
      setFitSignal((s) => s + 1);
      refresh();
    },
    [refresh],
  );

  // ── play (Enter): recorre el tag activo o todos los frames ───────
  useEffect(() => {
    if (!playing) return;
    const d = docRef.current;
    const tag = activeTagIndex !== null ? d.tags[activeTagIndex] : null;
    const from = tag ? tag.from : 0;
    const to = tag ? tag.to : d.frames.length - 1;
    const current = Math.max(from, Math.min(activeFrameIndex, to));
    const duration = d.frames[current]?.durationMs ?? 220;
    const timer = setTimeout(() => {
      setActiveFrameIndex(current >= to ? from : current + 1);
    }, duration);
    return () => clearTimeout(timer);
  }, [playing, activeFrameIndex, activeTagIndex, rev]);

  // ── healthz semáforo (UX §12) ─────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const check = () => {
      window.pixelforge
        ?.healthz()
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth({ ok: false }));
    };
    check();
    const timer = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // ── autosave + recuperación de crash (amendment §16 eje 3) ───────
  useEffect(() => {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) setRestoreOffer(saved);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, serializeDoc(docRef.current));
      } catch {
        /* lienzo enorme + storage lleno: el autosave no debe tirar el editor */
      }
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, []);

  // ── archivo ───────────────────────────────────────────────────────
  const savePfx = useCallback(async () => {
    const saved = await window.pixelforge.savePfx({
      defaultName: docRef.current.name,
      json: serializeDoc(docRef.current),
    });
    if (saved.path) setJobLine(`guardado: ${saved.path}`);
  }, []);

  const openPfx = useCallback(async () => {
    const opened = await window.pixelforge.openPfx();
    if (!opened) return;
    try {
      replaceDoc(deserializeDoc(opened.json, opened.name));
      setJobLine(`abierto: ${opened.name}`);
    } catch (err) {
      setJobLine(`✗ no pude abrir: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [replaceDoc]);

  // ── atajos de teclado (UX §11) ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      const d = docRef.current;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((k === 'z' && e.shiftKey) || k === 'y') {
          e.preventDefault();
          redo();
        } else if (k === 's') {
          e.preventDefault();
          void savePfx();
        } else if (k === 'o') {
          e.preventDefault();
          void openPfx();
        } else if (k === 'n') {
          e.preventDefault();
          setNewDocOpen(true);
        }
        return;
      }
      if (e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 'g') setShowGrid((v) => !v);
        else if (k === 'h') setMirrorH((v) => !v);
        else if (k === 'v') setMirrorV((v) => !v);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'escape':
          setNewDocOpen(false);
          setHelpOpen(false);
          setFocusMode((value) => {
            if (value) refitCanvas();
            return false;
          });
          break;
        case 'f11':
          e.preventDefault();
          toggleFocusMode();
          break;
        case 'x':
          setPrimary(secondary);
          setSecondary(primary);
          break;
        case 'd':
          setPrimary('#000000');
          setSecondary('#ffffff');
          break;
        case 'b':
          setTool('pencil');
          break;
        case 'e':
          setTool('eraser');
          break;
        case 'g':
          setTool('bucket');
          break;
        case 'l':
          setTool('line');
          break;
        case 'u':
          setTool('rect');
          break;
        case 'i':
          setTool('eyedropper');
          break;
        case 'o':
          setOnionSkin((v) => !v);
          break;
        case 'f':
          setFitSignal((s) => s + 1);
          break;
        case ',':
          setActiveFrameIndex((i) => Math.max(0, i - 1));
          break;
        case '.':
          setActiveFrameIndex((i) => Math.min(d.frames.length - 1, i + 1));
          break;
        case 'enter':
          setPlaying((p) => !p);
          break;
        case 'tab':
          e.preventDefault();
          setTimelineCollapsed((c) => !c);
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          setZoom([1, 2, 4, 8, 16][Number(e.key) - 1] ?? 8);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, savePfx, openPfx, primary, secondary, refitCanvas, toggleFocusMode]);

  // ── import desde generación IA ────────────────────────────────────
  const importAsLayers = useCallback(
    (images: DecodedImage[], baseName: string) => {
      mutate((d) => {
        const frame = d.frames[activeFrameIndex];
        if (!frame) return;
        images.forEach((img, i) => {
          const layer = addLayer(d, `gen/${baseName}_${i + 1}`);
          blit(d, getCel(d, layer.id, frame.id), img);
        });
      });
      setJobLine(`importadas ${images.length} capa(s) IA`);
    },
    [mutate, activeFrameIndex],
  );

  const importAsFrames = useCallback(
    (images: DecodedImage[], baseName: string) => {
      mutate((d) => {
        images.forEach((img) => {
          const frame = addFrame(d);
          blit(d, getCel(d, activeLayerId, frame.id), img);
        });
      });
      setJobLine(`importados ${images.length} frame(s) IA (${baseName})`);
    },
    [mutate, activeLayerId],
  );

  const newDocFromImages = useCallback(
    (images: DecodedImage[], baseName: string) => {
      const first = images[0];
      if (!first) return;
      const next = createDoc(baseName, first.width, first.height);
      const layer0 = next.layers[0]!;
      const frame0 = next.frames[0]!;
      layer0.name = 'gen';
      blit(next, getCel(next, layer0.id, frame0.id), first);
      for (let i = 1; i < images.length; i += 1) {
        const img = images[i];
        if (!img) continue;
        const frame = addFrame(next);
        blit(next, getCel(next, layer0.id, frame.id), img);
      }
      replaceDoc(next);
      setJobLine(`doc nuevo desde IA: ${baseName} (${images.length} frames)`);
    },
    [replaceDoc],
  );

  // ── UI ────────────────────────────────────────────────────────────
  const busyJob = jobLine !== null && jobLine.includes('Diseñando');
  const displayFrame = Math.min(activeFrameIndex, doc.frames.length - 1);

  return (
    <div
      className={`app${sidebarOpen ? '' : ' sidebar-collapsed'}${focusMode ? ' focus-mode' : ''}`}
      data-theme={theme}
    >
      <header className="menubar">
        <span className="brand-mark" aria-hidden="true" />
        <span className="title">PIXELFORGE</span>
        <button type="button" className="menu-action" onClick={() => setNewDocOpen((v) => !v)}>
          <span aria-hidden="true">＋</span> Nuevo
        </button>
        <button type="button" className="menu-action" onClick={() => void openPfx()}>
          <span aria-hidden="true">▣</span> Abrir
        </button>
        <button type="button" className="menu-action" onClick={() => void savePfx()}>
          <span aria-hidden="true">◆</span> Guardar
        </button>
        <button type="button" disabled={!historyRef.current.canUndo} onClick={undo}>
          ↶
        </button>
        <button type="button" disabled={!historyRef.current.canRedo} onClick={redo}>
          ↷
        </button>
        <span className="spacer" />
        <button
          type="button"
          className={focusMode ? 'active compact-action' : 'compact-action'}
          title="Modo lienzo: oculta paneles para maximizar el área de dibujo"
          onClick={toggleFocusMode}
        >
          ⛶ lienzo
        </button>
        <button
          type="button"
          className="compact-action"
          title={sidebarOpen ? 'Ocultar inspector' : 'Mostrar inspector'}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          {sidebarOpen ? '▸ panel' : '◂ panel'}
        </button>
        <button
          type="button"
          className="compact-action"
          title={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
          aria-label={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
          onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
        >
          {theme === 'light' ? '☾ Oscuro' : '☀ Claro'}
        </button>
        <button
          type="button"
          className="compact-action help-action"
          title="Guía rápida y atajos"
          onClick={() => setHelpOpen(true)}
        >
          ? Ayuda
        </button>
        <span className={'document-chip' + (busyJob ? ' busy' : '')}>
          <span className="document-state" aria-hidden="true" />
          <span className="document-name">{doc.name}</span>
          <span className="document-meta">
            {doc.width}×{doc.height} · {doc.frames.length}f · {doc.layers.length}c
          </span>
        </span>
        {newDocOpen && (
          <NewDocPopover
            onCreate={(name, w, h) => {
              replaceDoc(createDoc(name, w, h));
              setNewDocOpen(false);
            }}
            onClose={() => setNewDocOpen(false)}
          />
        )}
      </header>

      <div className="context-strip">
        <div className="color-wells" title="Color frontal / fondo · X intercambia · D restablece">
          <input
            type="color"
            className="color-well primary-well"
            aria-label={`Color frontal ${primary}`}
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
          />
          <input
            type="color"
            className="color-well secondary-well"
            aria-label={`Color de fondo ${secondary}`}
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
          />
          <button
            type="button"
            className="swap-colors"
            title="Intercambiar colores (X)"
            onClick={() => {
              setPrimary(secondary);
              setSecondary(primary);
            }}
          >
            ⇄
          </button>
        </div>
        <span className="context-separator" aria-hidden="true" />
        <label>
          pincel
          <select value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))}>
            {[1, 2, 3, 4].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </label>
        <span className="tool-readout">{TOOL_LABELS[tool]}</span>
        <div className="view-toggles" aria-label="Opciones de vista">
          <button
            type="button"
            className={showGrid ? 'active' : ''}
            title="Cuadrícula (Shift+G)"
            onClick={() => setShowGrid((v) => !v)}
          >
            # grid
          </button>
          <button
            type="button"
            className={onionSkin ? 'active' : ''}
            title="Onion skin (O)"
            onClick={() => setOnionSkin((v) => !v)}
          >
            ◉ onion
          </button>
          <button
            type="button"
            className={!timelineCollapsed ? 'active' : ''}
            title="Mostrar timeline (Tab)"
            onClick={() => setTimelineCollapsed((v) => !v)}
          >
            ▤ timeline
          </button>
        </div>
        <span className="canvas-help">ESPACIO + arrastrar para mover · rueda para zoom</span>
        {soloLayerId && <span style={{ color: 'var(--warn)' }}>SOLO capa activa</span>}
        {onionSkin && <span>onion ±1</span>}
        {restoreOffer && (
          <span className="banner">
            hay una sesión anterior sin guardar
            <button
              type="button"
              onClick={() => {
                try {
                  replaceDoc(deserializeDoc(restoreOffer, 'recuperado'));
                } catch {
                  /* autosave corrupto: se descarta */
                }
                setRestoreOffer(null);
              }}
            >
              recuperar
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(AUTOSAVE_KEY);
                setRestoreOffer(null);
              }}
            >
              descartar
            </button>
          </span>
        )}
      </div>

      <Toolbar
        tool={tool}
        onTool={setTool}
        mirrorH={mirrorH}
        mirrorV={mirrorV}
        onMirrorH={() => setMirrorH((v) => !v)}
        onMirrorV={() => setMirrorV((v) => !v)}
      />

      <Viewport
        doc={doc}
        rev={rev}
        frameIndex={displayFrame}
        activeLayerId={activeLayerId}
        soloLayerId={soloLayerId}
        tool={tool}
        primary={primary}
        secondary={secondary}
        brushSize={brushSize}
        mirrorH={mirrorH}
        mirrorV={mirrorV}
        zoom={zoom}
        showGrid={showGrid}
        onionSkin={onionSkin}
        playing={playing}
        fitSignal={fitSignal}
        onZoom={setZoom}
        onStrokeStart={pushHistory}
        onDocMutated={refresh}
        onEyedrop={(hex, asSecondary) => (asSecondary ? setSecondary(hex) : setPrimary(hex))}
        onCursor={(x, y) => setCursor({ x, y })}
      />

      <aside className="sidebar" aria-hidden={!sidebarOpen || focusMode}>
        <PalettePanel
          doc={doc}
          primary={primary}
          secondary={secondary}
          onPrimary={setPrimary}
          onSecondary={setSecondary}
          onAddColor={(hex) =>
            mutate((d) => {
              if (!d.palette.includes(hex)) d.palette.push(hex);
            })
          }
        />
        <LayersPanel
          doc={doc}
          activeLayerId={activeLayerId}
          soloLayerId={soloLayerId}
          onSelect={setActiveLayerId}
          onToggleVisible={(id) =>
            mutate((d) => {
              const layer = d.layers.find((l) => l.id === id);
              if (layer) layer.visible = !layer.visible;
            })
          }
          onToggleLock={(id) =>
            mutate((d) => {
              const layer = d.layers.find((l) => l.id === id);
              if (layer) layer.locked = !layer.locked;
            })
          }
          onToggleSolo={(id) => setSoloLayerId((cur) => (cur === id ? null : id))}
          onOpacity={(id, opacity) =>
            mutate((d) => {
              const layer = d.layers.find((l) => l.id === id);
              if (layer) layer.opacity = opacity;
            })
          }
          onRename={(id, name) =>
            mutate((d) => {
              const layer = d.layers.find((l) => l.id === id);
              if (layer) layer.name = name;
            })
          }
          onAdd={() =>
            mutate((d) => {
              const layer = addLayer(d);
              setActiveLayerId(layer.id);
            })
          }
          onDuplicate={() =>
            mutate((d) => {
              const copy = duplicateLayer(d, activeLayerId);
              if (copy) setActiveLayerId(copy.id);
            })
          }
          onRemove={() => mutate((d) => removeLayer(d, activeLayerId))}
          onMove={(delta) => mutate((d) => moveLayer(d, activeLayerId, delta))}
        />
        <div className="zone3-tabs">
          <button
            type="button"
            className={zone3 === 'generate' ? 'active' : ''}
            onClick={() => setZone3('generate')}
          >
            CREAR CON IA
          </button>
          <button
            type="button"
            className={zone3 === 'export' ? 'active' : ''}
            onClick={() => setZone3('export')}
          >
            EXPORTAR
          </button>
          <button
            type="button"
            className={zone3 === 'gallery' ? 'active' : ''}
            onClick={() => setZone3('gallery')}
          >
            GALERÍA
          </button>
        </div>
        {zone3 === 'generate' && (
          <GeneratePanel
            backendOk={health?.ok ?? false}
            onImportLayers={importAsLayers}
            onImportFrames={importAsFrames}
            onNewDoc={newDocFromImages}
            onJobLine={setJobLine}
          />
        )}
        {zone3 === 'export' && <ExportPanel doc={doc} rev={rev} onLine={setJobLine} />}
        {zone3 === 'gallery' && (
          <GalleryPanel
            doc={doc}
            rev={rev}
            onOpen={(json, name) => {
              try {
                replaceDoc(deserializeDoc(json, name));
                setJobLine(`abierto: ${name}`);
              } catch (err) {
                setJobLine(`✗ no pude abrir: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
            onLine={setJobLine}
          />
        )}
      </aside>

      <Timeline
        doc={doc}
        activeFrameIndex={displayFrame}
        activeLayerId={activeLayerId}
        playing={playing}
        collapsed={timelineCollapsed}
        activeTagIndex={activeTagIndex}
        onSelectCel={(layerId, frameIndex) => {
          setActiveLayerId(layerId);
          setActiveFrameIndex(frameIndex);
        }}
        onSelectFrame={setActiveFrameIndex}
        onAddFrame={() =>
          mutate((d) => {
            addFrame(d, activeFrameIndex);
            setActiveFrameIndex(activeFrameIndex + 1);
            setTimelineCollapsed(false);
          })
        }
        onDuplicateFrame={() =>
          mutate((d) => {
            duplicateFrame(d, activeFrameIndex);
            setActiveFrameIndex(activeFrameIndex + 1);
            setTimelineCollapsed(false);
          })
        }
        onRemoveFrame={() => mutate((d) => removeFrame(d, activeFrameIndex))}
        onDuration={(frameIndex, ms) =>
          mutate((d) => {
            const f = d.frames[frameIndex];
            if (f) f.durationMs = ms;
          })
        }
        onTogglePlay={() => setPlaying((p) => !p)}
        onToggleCollapsed={() => setTimelineCollapsed((c) => !c)}
        onSelectTag={setActiveTagIndex}
        onAddTag={(tag: AnimTag) =>
          mutate((d) => {
            d.tags.push(tag);
          })
        }
      />

      <StatusBar
        doc={doc}
        cursor={cursor}
        zoom={zoom}
        gridOn={showGrid}
        health={health}
        jobLine={jobLine}
      />
      {helpOpen && <QuickHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function QuickHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">GUÍA RÁPIDA</span>
            <h2 id="quick-help-title">Dibuja tu primer sprite</h2>
          </div>
          <button type="button" aria-label="Cerrar ayuda" onClick={onClose}>×</button>
        </header>
        <ol>
          <li><strong>Elige una herramienta.</strong> Lápiz (B), borrador (E), relleno (G), línea (L) o rectángulo (U).</li>
          <li><strong>Escoge el color.</strong> Usa los dos cuadros de arriba; X los intercambia.</li>
          <li><strong>Dibuja en el lienzo central.</strong> Rueda para zoom y Espacio + arrastrar para mover.</li>
          <li><strong>Organiza.</strong> Las capas están a la derecha y los frames en la línea de tiempo inferior.</li>
          <li><strong>Guarda.</strong> Usa Guardar o Ctrl+S. El modo Lienzo (F11) deja solo el área de dibujo.</li>
        </ol>
        <div className="help-shortcuts" aria-label="Atajos principales">
          <span><kbd>F</kbd>Ajustar</span>
          <span><kbd>Tab</kbd>Timeline</span>
          <span><kbd>O</kbd>Onion skin</span>
          <span><kbd>Esc</kbd>Salir de lienzo</span>
        </div>
        <button type="button" className="primary-button" onClick={onClose}>Entendido</button>
      </section>
    </div>
  );
}

interface NewDocPopoverProps {
  onCreate: (name: string, w: number, h: number) => void;
  onClose: () => void;
}

function NewDocPopover({ onCreate, onClose }: NewDocPopoverProps) {
  const [name, setName] = useState('sprite');
  const [w, setW] = useState(32);
  const [h, setH] = useState(32);
  return (
    <div className="newdoc-pop">
      <label>
        nombre
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="row" style={{ display: 'flex', gap: 6 }}>
        <label>
          ancho
          <select value={w} onChange={(e) => setW(Number(e.target.value))}>
            {DOC_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          alto
          <select value={h} onChange={(e) => setH(Number(e.target.value))}>
            {DOC_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="accent" onClick={() => onCreate(name || 'sprite', w, h)}>
          Crear
        </button>
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
