import type { SpriteDoc } from '../model/document.js';
import type { HealthzInfo } from '../vite-env.js';

export interface StatusBarProps {
  doc: SpriteDoc;
  cursor: { x: number; y: number } | null;
  zoom: number;
  gridOn: boolean;
  health: HealthzInfo | null;
  jobLine: string | null;
}

/** Status bar (UX §1/§12): contexto de cursor a la izquierda, único indicador global de jobs + semáforo de backend a la derecha. */
export function StatusBar({ doc, cursor, zoom, gridOn, health, jobLine }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span>{cursor ? `(${cursor.x},${cursor.y})` : '(-,-)'}</span>
      <span>
        {doc.width}×{doc.height} px
      </span>
      <span>zoom {zoom * 100}%</span>
      <span>{gridOn ? '⛶ grid 16' : 'grid off'}</span>
      <span className="spacer" />
      {jobLine && <span className="job-line">{jobLine}</span>}
      <span
        title={
          health?.ok
            ? `backend ok · providers: ${(health.providers ?? []).join(', ') || 'ninguno'}`
            : 'backend caído: el dibujo manual sigue funcionando'
        }
      >
        <span className={'semaphore' + (health?.ok ? ' ok' : '')} />{' '}
        {health?.ok ? (health.providers ?? []).join('+') || 'backend' : 'sin backend'}
      </span>
    </footer>
  );
}
