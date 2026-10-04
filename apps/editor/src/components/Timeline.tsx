import { useState } from 'react';
import { celKey, type AnimTag, type SpriteDoc } from '../model/document.js';

export interface TimelineProps {
  doc: SpriteDoc;
  activeFrameIndex: number;
  activeLayerId: string;
  playing: boolean;
  collapsed: boolean;
  activeTagIndex: number | null;
  onSelectCel: (layerId: string, frameIndex: number) => void;
  onSelectFrame: (frameIndex: number) => void;
  onAddFrame: () => void;
  onDuplicateFrame: () => void;
  onRemoveFrame: () => void;
  onDuration: (frameIndex: number, ms: number) => void;
  onTogglePlay: () => void;
  onToggleCollapsed: () => void;
  onSelectTag: (index: number | null) => void;
  onAddTag: (tag: AnimTag) => void;
}

/** Timeline (UX §6): matriz layer x frame = cels, duracion por frame, tags, play. */
export function Timeline(props: TimelineProps) {
  const { doc } = props;
  const [tagName, setTagName] = useState('');
  const rows = [...doc.layers].reverse();

  if (props.collapsed) {
    return (
      <div className="timeline collapsed">
        <div className="timeline-controls">
          <button type="button" onClick={props.onToggleCollapsed} title="Expandir timeline (Tab)">
            ▸ TIMELINE ({doc.frames.length} frames)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button type="button" onClick={props.onToggleCollapsed} title="Plegar (Tab)">
          ⌄
        </button>
        <button type="button" onClick={props.onTogglePlay} title="Play/Stop (Enter)">
          {props.playing ? '■ stop' : '▶ play'}
        </button>
        <button type="button" onClick={props.onAddFrame} title="Nuevo frame">
          +f
        </button>
        <button type="button" onClick={props.onDuplicateFrame} title="Duplicar frame actual">
          dup
        </button>
        <button type="button" onClick={props.onRemoveFrame} title="Eliminar frame actual">
          🗑
        </button>
        <span style={{ color: 'var(--text-dim)' }}>tags:</span>
        <span
          className={'tag-chip' + (props.activeTagIndex === null ? ' active' : '')}
          onClick={() => props.onSelectTag(null)}
        >
          todos
        </span>
        {doc.tags.map((tag, i) => (
          <span
            key={`${tag.name}_${i}`}
            className={'tag-chip' + (props.activeTagIndex === i ? ' active' : '')}
            title={`frames ${tag.from + 1}–${tag.to + 1}`}
            onClick={() => props.onSelectTag(i)}
          >
            {tag.name}
          </span>
        ))}
        <input
          placeholder="+tag (frame actual→fin)"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tagName.trim()) {
              props.onAddTag({
                name: tagName.trim(),
                from: props.activeFrameIndex,
                to: doc.frames.length - 1,
              });
              setTagName('');
            }
          }}
          style={{ width: 140 }}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th className="layer-name" />
            {doc.frames.map((f, i) => (
              <th
                key={f.id}
                className={'frame-head' + (i === props.activeFrameIndex ? ' current' : '')}
                style={{ cursor: 'pointer' }}
                onClick={() => props.onSelectFrame(i)}
              >
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((layer) => (
            <tr key={layer.id}>
              <th className="layer-name" title={layer.name}>
                {layer.name}
              </th>
              {doc.frames.map((frame, i) => {
                const cel = doc.cels[celKey(layer.id, frame.id)];
                const has = !!cel && cel.some((p) => p !== null);
                const sel = layer.id === props.activeLayerId && i === props.activeFrameIndex;
                return (
                  <td
                    key={frame.id}
                    className={'cel' + (sel ? ' sel' : '')}
                    onClick={() => props.onSelectCel(layer.id, i)}
                  >
                    <span className={'dot' + (has ? ' full' : '')} />
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th className="layer-name">ms</th>
            {doc.frames.map((frame, i) => (
              <td key={frame.id}>
                <input
                  className="ms-input"
                  type="number"
                  min={20}
                  step={10}
                  value={frame.durationMs}
                  onChange={(e) => props.onDuration(i, Math.max(20, Number(e.target.value)))}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
