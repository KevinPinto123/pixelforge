import { useState } from 'react';
import type { SpriteDoc } from '../model/document.js';
import { MASTER_HEX_SET, PALETTE_MASTER } from '../model/palette-master.js';

export interface PalettePanelProps {
  doc: SpriteDoc;
  primary: string;
  secondary: string;
  onPrimary: (hex: string) => void;
  onSecondary: (hex: string) => void;
  onAddColor: (hex: string) => void;
}

/**
 * Panel PALETTE (UX §4): paleta del documento (editable) + biblioteca
 * institucional PALETTE-MASTER (solo lectura, plegada). Swatch fuera de master
 * lleva triangulo de alerta — regla "0 colores fuera de master" sin bloquear.
 */
export function PalettePanel({
  doc,
  primary,
  secondary,
  onPrimary,
  onSecondary,
  onAddColor,
}: PalettePanelProps) {
  const [open, setOpen] = useState(true);
  const [libOpen, setLibOpen] = useState(false);
  const [pick, setPick] = useState('#7c5cff');

  return (
    <section className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>
        <span>PALETTE</span>
        <span>
          doc: {doc.palette.length} {open ? '⌄' : '›'}
        </span>
      </div>
      {open && (
        <div className="panel-body">
          <div className="swatches">
            {doc.palette.map((hex) => (
              <button
                key={hex}
                type="button"
                className={
                  'swatch' +
                  (hex === primary ? ' primary' : '') +
                  (hex === secondary ? ' secondary' : '')
                }
                style={{ background: hex }}
                title={hex + (MASTER_HEX_SET.has(hex.toLowerCase()) ? '' : ' (fuera de master)')}
                onClick={() => onPrimary(hex)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSecondary(hex);
                }}
              >
                {!MASTER_HEX_SET.has(hex.toLowerCase()) && <span className="off-master" />}
              </button>
            ))}
          </div>
          <div className="palette-row">
            <input
              type="color"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              style={{ width: 28, height: 22, padding: 0 }}
              title="Elegir color nuevo"
            />
            <button type="button" onClick={() => onAddColor(pick)}>
              + añadir
            </button>
            <span style={{ color: 'var(--text-dim)' }}>
              1º {primary} / 2º {secondary}
            </span>
          </div>
          <div className="palette-row" style={{ cursor: 'pointer' }} onClick={() => setLibOpen(!libOpen)}>
            <span style={{ color: 'var(--text-dim)' }}>
              {libOpen ? '⌄' : '▸'} PALETTE-MASTER (32) inst.
            </span>
          </div>
          {libOpen && (
            <div className="swatches" style={{ marginTop: 4 }}>
              {PALETTE_MASTER.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className="swatch"
                  style={{ background: c.hex }}
                  title={`${c.name} ${c.hex}`}
                  onClick={() => {
                    onPrimary(c.hex);
                    if (!doc.palette.includes(c.hex)) onAddColor(c.hex);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
