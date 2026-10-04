import { useState } from 'react';
import type { SpriteDoc } from '../model/document.js';

export interface LayersPanelProps {
  doc: SpriteDoc;
  activeLayerId: string;
  soloLayerId: string | null;
  onSelect: (layerId: string) => void;
  onToggleVisible: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onToggleSolo: (layerId: string) => void;
  onOpacity: (layerId: string, opacity: number) => void;
  onRename: (layerId: string, name: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (delta: 1 | -1) => void;
}

/**
 * Panel LAYERS (UX §5) + boton S de "solo" por capa: reproduce/previsualiza esa
 * capa aislada — asi se ve como se anima cada capa por separado antes de exportar.
 */
export function LayersPanel(props: LayersPanelProps) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // top primero en UI; doc.layers[0] es el fondo.
  const rows = [...props.doc.layers].reverse();

  return (
    <section className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>
        <span>LAYERS</span>
        <span>{open ? '⌄' : '›'}</span>
      </div>
      {open && (
        <div className="panel-body">
          <div className="layers-actions">
            <button type="button" title="Nueva capa" onClick={props.onAdd}>
              +
            </button>
            <button type="button" title="Duplicar capa" onClick={props.onDuplicate}>
              dup
            </button>
            <button type="button" title="Eliminar capa" onClick={props.onRemove}>
              🗑
            </button>
            <button type="button" title="Subir capa" onClick={() => props.onMove(1)}>
              ↑
            </button>
            <button type="button" title="Bajar capa" onClick={() => props.onMove(-1)}>
              ↓
            </button>
          </div>
          {rows.map((layer) => (
            <div
              key={layer.id}
              className={'layer-row' + (layer.id === props.activeLayerId ? ' active' : '')}
              onClick={() => props.onSelect(layer.id)}
            >
              <button
                type="button"
                className="icon-btn"
                title={layer.visible ? 'Ocultar' : 'Mostrar'}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggleVisible(layer.id);
                }}
              >
                {layer.visible ? '◉' : '○'}
              </button>
              <button
                type="button"
                className="icon-btn"
                title={layer.locked ? 'Desbloquear' : 'Bloquear'}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggleLock(layer.id);
                }}
              >
                {layer.locked ? '🔒' : '·'}
              </button>
              <button
                type="button"
                className={'icon-btn' + (props.soloLayerId === layer.id ? ' solo-on' : '')}
                title="Solo: ver/animar esta capa aislada"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggleSolo(layer.id);
                }}
              >
                S
              </button>
              {renaming === layer.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    props.onRename(layer.id, renameValue || layer.name);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  style={{ flex: 1, height: 18 }}
                />
              ) : (
                <span
                  className={'name' + (layer.visible ? '' : ' hidden-layer')}
                  onDoubleClick={() => {
                    setRenaming(layer.id);
                    setRenameValue(layer.name);
                  }}
                >
                  {layer.name}
                </span>
              )}
              <input
                className="opacity"
                type="number"
                min={0}
                max={100}
                value={Math.round(layer.opacity * 100)}
                title="Opacidad %"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  props.onOpacity(layer.id, Math.max(0, Math.min(100, Number(e.target.value))) / 100)
                }
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
