import { useCallback, useEffect, useRef, useState } from 'react';
import {
  compositeFrame,
  emptyCel,
  floodFill,
  getCel,
  plotLine,
  plotPixel,
  plotRect,
  type Cel,
  type SpriteDoc,
} from '../model/document.js';
import { TOOL_LABELS, type ToolId } from './Toolbar.js';
import { PixelToolIcon, type PixelToolIconName } from './PixelToolIcon.js';

export const ZOOMS = [1, 2, 4, 8, 16, 32] as const;

export interface ViewportProps {
  doc: SpriteDoc;
  rev: number;
  frameIndex: number;
  activeLayerId: string;
  soloLayerId: string | null;
  tool: ToolId;
  primary: string;
  secondary: string;
  brushSize: number;
  mirrorH: boolean;
  mirrorV: boolean;
  zoom: number;
  showGrid: boolean;
  onionSkin: boolean;
  playing: boolean;
  fitSignal: number;
  onZoom: (zoom: number) => void;
  onStrokeStart: () => void;
  onDocMutated: () => void;
  onEyedrop: (hex: string, asSecondary: boolean) => void;
  onCursor: (x: number, y: number) => void;
}

interface DragState {
  kind: 'draw' | 'shape' | 'pan';
  button: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  panStart?: { x: number; y: number };
}

function tintComposite(
  doc: SpriteDoc,
  frameIndex: number,
  soloLayerId: string | null,
  tint: string | null,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = doc.width;
  c.height = doc.height;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.putImageData(
    new ImageData(compositeFrame(doc, frameIndex, { soloLayerId }), doc.width, doc.height),
    0,
    0,
  );
  if (tint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

/**
 * Viewport Canvas 2D (spec §7, UX §2): zoom por multiplos enteros nearest,
 * pan con Space/boton medio, checkerboard, grid, onion skin (frame -1 rojo /
 * +1 verde), preview de linea/rect sin mutar el doc hasta soltar.
 */
export function Viewport(props: ViewportProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ x: 40, y: 40 });
  const dragRef = useRef<DragState | null>(null);
  const shapePreviewRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const spaceRef = useRef(false);
  const [, setLocalTick] = useState(0);
  const tick = useCallback(() => setLocalTick((t) => t + 1), []);

  const { doc } = props;

  // Space = pan temporal (UX §2).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        spaceRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const zw = Math.max(1, Math.floor((wrap.clientWidth * 0.88) / doc.width));
    const zh = Math.max(1, Math.floor((wrap.clientHeight * 0.88) / doc.height));
    const zoom = ZOOMS.reduce((best, z) => (z <= Math.min(zw, zh) ? z : best), 1);
    props.onZoom(zoom);
    panRef.current = {
      x: Math.round((wrap.clientWidth - doc.width * zoom) / 2),
      y: Math.round((wrap.clientHeight - doc.height * zoom) / 2),
    };
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.width, doc.height, props.onZoom]);

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitSignal, doc.width, doc.height]);

  // El canvas debe adoptar el tamaño real del área central. Los cambios de
  // paneles y el modo lienzo no siempre disparan un resize de ventana.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    });
    observer.observe(wrap);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [tick]);

  // ── render ──────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    // HiDPI: respaldar el canvas a pixeles de dispositivo (devicePixelRatio) y
    // dibujar en espacio CSS-px con setTransform. Sin esto, en escalado de
    // Windows 125/150% el compositor reescala todo el backing store y el
    // pixel-art (grid, bordes) sale borroso pese a image-rendering:pixelated.
    // Todo el input (pan/zoom/getBoundingClientRect) sigue en CSS-px, coherente.
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    // Este efecto redibuja en cada commit de React (sin dep array), y durante
    // un trazo/pan hay un commit por pointermove. Reasignar canvas.width/height
    // reasigna y limpia TODO el backing store en GPU aunque el tamano no cambie;
    // hacerlo por frame dispara el frame time sin motivo. Solo re-dimensionamos
    // cuando cambia de verdad (resize de ventana / cambio de dpr); el clearRect
    // de mas abajo ya limpia el frame en cada render.
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { x: px, y: py } = panRef.current;
    const z = props.zoom;
    const w = doc.width * z;
    const h = doc.height * z;
    const styles = getComputedStyle(wrap);
    const checkerA = styles.getPropertyValue('--canvas-checker-a').trim() || '#e7e9ed';
    const checkerB = styles.getPropertyValue('--canvas-checker-b').trim() || '#f7f8fa';
    const canvasBorder = styles.getPropertyValue('--canvas-border').trim() || '#8d96a5';
    const gridSoft = styles.getPropertyValue('--canvas-grid').trim() || 'rgba(32, 38, 50, 0.12)';
    const gridStrong = styles.getPropertyValue('--canvas-grid-strong').trim() || 'rgba(32, 38, 50, 0.3)';

    ctx.clearRect(0, 0, cssW, cssH);

    // checkerboard alpha 8px (solo bajo el sprite)
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, w, h);
    ctx.clip();
    for (let cy = 0; cy < Math.ceil(h / 8); cy += 1) {
      for (let cx = 0; cx < Math.ceil(w / 8); cx += 1) {
        ctx.fillStyle = (cx + cy) % 2 === 0 ? checkerA : checkerB;
        ctx.fillRect(px + cx * 8, py + cy * 8, 8, 8);
      }
    }
    ctx.restore();

    ctx.imageSmoothingEnabled = false;

    // onion skin: -1 rojo 30%, +1 verde 15% (UX §2), nunca durante play
    if (props.onionSkin && !props.playing) {
      if (props.frameIndex > 0) {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(tintComposite(doc, props.frameIndex - 1, props.soloLayerId, '#e01b24'), px, py, w, h);
      }
      if (props.frameIndex < doc.frames.length - 1) {
        ctx.globalAlpha = 0.15;
        ctx.drawImage(tintComposite(doc, props.frameIndex + 1, props.soloLayerId, '#33d17a'), px, py, w, h);
      }
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(tintComposite(doc, props.frameIndex, props.soloLayerId, null), px, py, w, h);

    // preview de linea/rect (scratch cel, sin tocar el doc)
    const shape = shapePreviewRef.current;
    if (shape && (props.tool === 'line' || props.tool === 'rect')) {
      const scratch: Cel = emptyCel(doc);
      const color = props.primary;
      if (props.tool === 'line') {
        plotLine(doc, scratch, shape.x0, shape.y0, shape.x1, shape.y1, color, props.brushSize, props.mirrorH, props.mirrorV);
      } else {
        plotRect(doc, scratch, shape.x0, shape.y0, shape.x1, shape.y1, color, props.brushSize, props.mirrorH, props.mirrorV);
      }
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < scratch.length; i += 1) {
        const hex = scratch[i];
        if (!hex) continue;
        ctx.fillStyle = hex;
        ctx.fillRect(px + (i % doc.width) * z, py + Math.floor(i / doc.width) * z, z, z);
      }
      ctx.globalAlpha = 1;
    }

    // grid (Shift+G): lineas 1px por pixel desde 4x (por debajo se emborrona),
    // linea fuerte cada 16 px del lienzo
    if (props.showGrid && z >= 4) {
      ctx.strokeStyle = gridSoft;
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= doc.width; gx += 1) {
        ctx.strokeStyle = gx % 16 === 0 ? gridStrong : gridSoft;
        ctx.beginPath();
        ctx.moveTo(px + gx * z + 0.5, py);
        ctx.lineTo(px + gx * z + 0.5, py + h);
        ctx.stroke();
      }
      for (let gy = 0; gy <= doc.height; gy += 1) {
        ctx.strokeStyle = gy % 16 === 0 ? gridStrong : gridSoft;
        ctx.beginPath();
        ctx.moveTo(px, py + gy * z + 0.5);
        ctx.lineTo(px + w, py + gy * z + 0.5);
        ctx.stroke();
      }
    }

    // ejes de espejo punteados (UX §3)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(124,92,255,0.6)';
    if (props.mirrorH) {
      ctx.beginPath();
      ctx.moveTo(px + w / 2, py);
      ctx.lineTo(px + w / 2, py + h);
      ctx.stroke();
    }
    if (props.mirrorV) {
      ctx.beginPath();
      ctx.moveTo(px, py + h / 2);
      ctx.lineTo(px + w, py + h / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // borde del lienzo
    ctx.strokeStyle = canvasBorder;
    ctx.strokeRect(px - 0.5, py - 0.5, w + 1, h + 1);
  });

  // ── input ───────────────────────────────────────────────────────
  const toPixel = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - rect.left - panRef.current.x) / props.zoom),
      y: Math.floor((e.clientY - rect.top - panRef.current.y) / props.zoom),
    };
  };

  const activeCel = (): Cel | null => {
    const layer = doc.layers.find((l) => l.id === props.activeLayerId);
    const frame = doc.frames[props.frameIndex];
    if (!layer || !frame || layer.locked || (!layer.visible && props.soloLayerId !== layer.id)) return null;
    return getCel(doc, layer.id, frame.id);
  };

  const sampleAt = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
    const rgba = compositeFrame(doc, props.frameIndex, { soloLayerId: props.soloLayerId });
    const o = (y * doc.width + x) * 4;
    if ((rgba[o + 3] ?? 0) < 128) return null;
    return (
      '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toPixel(e);

    if (spaceRef.current || e.button === 1) {
      dragRef.current = {
        kind: 'pan',
        button: e.button,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        panStart: { ...panRef.current },
      };
      return;
    }

    if (props.playing) return;

    const wantEyedrop = props.tool === 'eyedropper' || e.altKey;
    if (wantEyedrop) {
      const hex = sampleAt(x, y);
      if (hex) props.onEyedrop(hex, e.button === 2);
      return;
    }

    const color = e.button === 2 ? props.secondary : props.primary;

    if (props.tool === 'line' || props.tool === 'rect') {
      dragRef.current = { kind: 'shape', button: e.button, startX: x, startY: y, lastX: x, lastY: y };
      shapePreviewRef.current = { x0: x, y0: y, x1: x, y1: y };
      tick();
      return;
    }

    const cel = activeCel();
    if (!cel) return;
    props.onStrokeStart();
    dragRef.current = { kind: 'draw', button: e.button, startX: x, startY: y, lastX: x, lastY: y };

    if (props.tool === 'bucket') {
      floodFill(doc, cel, x, y, color);
      props.onDocMutated();
      dragRef.current = null;
      return;
    }
    // pencil / eraser
    plotPixel(doc, cel, x, y, props.tool === 'eraser' ? null : color, props.brushSize, props.mirrorH, props.mirrorV);
    props.onDocMutated();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = toPixel(e);
    props.onCursor(x, y);
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'pan' && drag.panStart) {
      panRef.current = {
        x: drag.panStart.x + (e.clientX - drag.startX),
        y: drag.panStart.y + (e.clientY - drag.startY),
      };
      tick();
      return;
    }

    if (drag.kind === 'shape') {
      shapePreviewRef.current = { x0: drag.startX, y0: drag.startY, x1: x, y1: y };
      tick();
      return;
    }

    if (drag.kind === 'draw' && (props.tool === 'pencil' || props.tool === 'eraser')) {
      const cel = activeCel();
      if (!cel) return;
      const color = drag.button === 2 ? props.secondary : props.primary;
      plotLine(
        doc,
        cel,
        drag.lastX,
        drag.lastY,
        x,
        y,
        props.tool === 'eraser' ? null : color,
        props.brushSize,
        props.mirrorH,
        props.mirrorV,
      );
      drag.lastX = x;
      drag.lastY = y;
      props.onDocMutated();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === 'shape') {
      const shape = shapePreviewRef.current;
      shapePreviewRef.current = null;
      const cel = activeCel();
      if (shape && cel) {
        props.onStrokeStart();
        const color = drag.button === 2 ? props.secondary : props.primary;
        if (props.tool === 'line') {
          plotLine(doc, cel, shape.x0, shape.y0, shape.x1, shape.y1, color, props.brushSize, props.mirrorH, props.mirrorV);
        } else {
          plotRect(doc, cel, shape.x0, shape.y0, shape.x1, shape.y1, color, props.brushSize, props.mirrorH, props.mirrorV);
        }
        props.onDocMutated();
      } else {
        tick();
      }
    }
    void e;
  };

  const onWheel = (e: React.WheelEvent) => {
    const idx = ZOOMS.indexOf(props.zoom as (typeof ZOOMS)[number]);
    const next = e.deltaY < 0 ? Math.min(idx + 1, ZOOMS.length - 1) : Math.max(idx - 1, 0);
    if (next === idx) return;
    const newZoom = ZOOMS[next];
    if (newZoom === undefined) return;
    const rect = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // zoom anclado al cursor
    panRef.current = {
      x: Math.round(cx - ((cx - panRef.current.x) * newZoom) / props.zoom),
      y: Math.round(cy - ((cy - panRef.current.y) * newZoom) / props.zoom),
    };
    props.onZoom(newZoom);
  };

  return (
    <div className="viewport-wrap" ref={wrapRef}>
      <div className="canvas-identity" aria-hidden="true">
        <span className="canvas-identity-kicker">CANVAS</span>
        <strong>{doc.name}</strong>
        <span>
          {doc.width} × {doc.height} px · frame {props.frameIndex + 1}/{doc.frames.length}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ cursor: spaceRef.current ? 'grab' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="zoom-overlay">
        {ZOOMS.map((z) => (
          <button
            key={z}
            type="button"
            className={props.zoom === z ? 'active' : ''}
            onClick={() => props.onZoom(z)}
          >
            {z * 100}%
          </button>
        ))}
        <button type="button" onClick={fit} title="Fit (F)">
          fit
        </button>
      </div>
      <div className="pan-hint" aria-hidden="true">SPACE · PAN</div>
      <div className="canvas-tool-hint" aria-hidden="true">
        <PixelToolIcon
          name={(props.tool === 'pencil' ? 'brush' : props.tool) as PixelToolIconName}
        />
        {TOOL_LABELS[props.tool]} · {props.brushSize}px
      </div>
    </div>
  );
}
