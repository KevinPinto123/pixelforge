import { useEffect, useRef, useState } from 'react';
import type { JobStatusInfo } from '../vite-env.js';
import { PALETTE_MASTER } from '../model/palette-master.js';
import { decodePngDataUrl, type DecodedImage } from '../model/raster.js';

const TERMINAL = new Set(['ready', 'failed', 'canceled']);
const POLL_MS = 1500;

export interface GeneratePanelProps {
  backendOk: boolean;
  onImportLayers: (images: DecodedImage[], baseName: string) => void;
  onImportFrames: (images: DecodedImage[], baseName: string) => void;
  onNewDoc: (images: DecodedImage[], baseName: string) => void;
  onJobLine: (line: string) => void;
}

/** Mensaje humano por estado del job — el "diseñando en tiempo real" del encargo. */
function statusView(job: JobStatusInfo): { text: string; cls: string } {
  const pct = Math.round(job.progress * 100);
  const artista =
    job.provider === 'claude-cli' ? 'Claude (tu suscripción)' : (job.provider ?? 'IA');
  switch (job.status) {
    case 'queued':
      return { text: '⏳ En cola…', cls: 'designing' };
    case 'running':
    case 'awaiting_provider':
      return { text: `✨ Diseñando en tiempo real con ${artista}… ${pct}%`, cls: 'designing' };
    case 'post_processing':
      return { text: '🎨 Puliendo píxeles (paleta maestra + limpieza)…', cls: 'designing' };
    case 'ready':
      return { text: '✔ Diseño listo', cls: 'ready' };
    case 'canceled':
      return { text: 'Cancelado', cls: 'failed' };
    default:
      return { text: `✗ Falló: ${job.error?.message ?? 'error desconocido'}`, cls: 'failed' };
  }
}

/**
 * Tab GENERATE (UX §7): prompt → job → progreso en vivo → preview → importar.
 * Nunca modal; un job corriendo jamás bloquea el dibujo manual.
 */
export function GeneratePanel(props: GeneratePanelProps) {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<16 | 32 | 48 | 64>(32);
  const [directions, setDirections] = useState<1 | 4>(1);
  const [useMaster, setUseMaster] = useState(true);
  const [job, setJob] = useState<JobStatusInfo | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPromptRef = useRef('');

  useEffect(() => () => stopPolling(), []);

  function stopPolling(): void {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function track(next: JobStatusInfo): void {
    setJob(next);
    const view = statusView(next);
    props.onJobLine(`job ${next.id.slice(0, 8)} · ${view.text}`);
    if (TERMINAL.has(next.status)) {
      stopPolling();
      if (next.status === 'ready') {
        void window.pixelforge.getJobPreviews(next.id).then(setPreviews).catch(() => setPreviews([]));
      }
    }
  }

  async function generate(): Promise<void> {
    setError(null);
    setPreviews([]);
    setJob(null);
    lastPromptRef.current = prompt;
    try {
      const accepted = await window.pixelforge.generateCharacter({
        projectId: 'proj-demo',
        prompt,
        size,
        directions,
        ...(useMaster ? { paletteColors: PALETTE_MASTER.map((c) => c.hex) } : {}),
      });
      track(await window.pixelforge.getJobStatus(accepted.jobId));
      stopPolling();
      pollRef.current = setInterval(() => {
        window.pixelforge
          .getJobStatus(accepted.jobId)
          .then(track)
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
            stopPolling();
          });
      }, POLL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function decodeAll(): Promise<DecodedImage[]> {
    setImporting(true);
    try {
      return await Promise.all(previews.map((url) => decodePngDataUrl(url)));
    } finally {
      setImporting(false);
    }
  }

  const baseName = () =>
    lastPromptRef.current.trim().split(/\s+/).slice(0, 3).join('_') || 'generado';

  const view = job ? statusView(job) : null;

  return (
    <div className="zone3-body">
      {!props.backendOk && (
        <div className="banner">sin conexión al backend · reintentando — el dibujo manual sigue OK</div>
      )}
      <label>
        prompt
        <textarea
          rows={3}
          placeholder="campesino peruano con chullo, hoodie verde…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <div className="row">
        <label>
          tamaño
          <select value={size} onChange={(e) => setSize(Number(e.target.value) as 16 | 32 | 48 | 64)}>
            {[16, 32, 48, 64].map((s) => (
              <option key={s} value={s}>
                {s}×{s}
              </option>
            ))}
          </select>
        </label>
        <label>
          dirs
          <select
            value={directions}
            onChange={(e) => setDirections(Number(e.target.value) as 1 | 4)}
          >
            <option value={1}>1 (south)</option>
            <option value={4}>4 (S/N/E/W)</option>
          </select>
        </label>
        <label className="row" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" checked={useMaster} onChange={(e) => setUseMaster(e.target.checked)} />
          paleta master
        </label>
      </div>
      <button
        type="button"
        className="accent"
        disabled={!prompt.trim() || !props.backendOk || (job !== null && !TERMINAL.has(job.status))}
        onClick={() => void generate()}
      >
        ⚡ Generar
      </button>
      {error && (
        <div className="job-live">
          <span className="msg failed">✗ {error}</span>
        </div>
      )}
      {job && view && (
        <div className="job-live">
          <span className={`msg ${view.cls}`}>{view.text}</span>
          {!TERMINAL.has(job.status) && (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.round(job.progress * 100)}%` }} />
            </div>
          )}
          {job.status === 'failed' && (
            <button type="button" onClick={() => void generate()}>
              reintentar
            </button>
          )}
          {previews.length > 0 && (
            <>
              <div className="previews">
                {previews.map((url, i) => (
                  <img key={i} src={url} alt={`preview ${i + 1}`} />
                ))}
              </div>
              <div className="row">
                <button
                  type="button"
                  disabled={importing}
                  title="Cada imagen entra como capa nueva del frame activo"
                  onClick={() => void decodeAll().then((imgs) => props.onImportLayers(imgs, baseName()))}
                >
                  → capas
                </button>
                <button
                  type="button"
                  disabled={importing}
                  title="Cada imagen entra como frame nuevo en la capa activa"
                  onClick={() => void decodeAll().then((imgs) => props.onImportFrames(imgs, baseName()))}
                >
                  → frames
                </button>
                <button
                  type="button"
                  disabled={importing}
                  title="Abrir como documento nuevo (un frame por imagen)"
                  onClick={() => void decodeAll().then((imgs) => props.onNewDoc(imgs, baseName()))}
                >
                  → doc nuevo
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
