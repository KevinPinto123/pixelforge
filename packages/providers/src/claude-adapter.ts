import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ProviderId } from '@pixelforge/contracts';
import type { PixelForgeImage } from '@pixelforge/postprocess';
import type {
  NormalizedAnimationInput,
  NormalizedCharacterInput,
  NormalizedTilesetInput,
  PixelProviderAdapter,
  ProviderAcceptedJob,
  ProviderCapability,
  ProviderHealth,
  ProviderJobStatus,
  ProviderResult,
} from './adapter.js';
import { imageToPng } from './png-codec.js';

export interface ClaudeCliAdapterOptions {
  /** Comando del CLI de Claude Code (default 'claude'; usa la suscripcion del usuario, sin API key). */
  command?: string;
  /** Modelo a pedir al CLI (default: DEFAULT_MODEL, un modelo rapido). */
  model?: string;
  timeoutMs?: number;
  estimateS?: number;
}

/**
 * Modelo por defecto de generacion. Se fija a un modelo rapido (Haiku) a proposito:
 * el default de la sesion del usuario suele ser Opus con thinking alto, que gasta
 * minutos razonando sobre la grilla de pixeles y se pasa del timeout de 240s (medido:
 * Opus >240s, Haiku ~66s con salida valida). La generacion de pixel-art como grilla
 * indexada es estructurada, no se beneficia del razonamiento extendido de Opus.
 * Override por request (opts.model) o entorno (PF_CLAUDE_MODEL).
 */
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/** Alfabeto de indices de paleta en las filas del spec: '.' = transparente, resto indexa palette[]. */
const INDEX_ALPHABET = '0123456789abcdefghijklmnopqrstuv';

export interface ClaudePixelFrame {
  name: string;
  rows: string[];
}
export interface ClaudePixelSpec {
  size: number;
  palette: string[];
  frames: ClaudePixelFrame[];
}

const DIRECTION_NAMES: Record<1 | 4 | 8, string[]> = {
  1: ['south'],
  4: ['south', 'north', 'east', 'west'],
  8: ['south', 'north', 'east', 'west', 'se', 'sw', 'ne', 'nw'],
};

export function buildCharacterPrompt(input: NormalizedCharacterInput): string {
  const dirs = DIRECTION_NAMES[input.directions];
  const paletteRule = input.paletteColors?.length
    ? `Usa EXCLUSIVAMENTE estos colores (hex): ${input.paletteColors.join(', ')}.`
    : 'Usa una paleta corta (<=16 colores) de tonos pixel-art coherentes.';
  return [
    'Eres un artista pixel-art profesional. Disena un sprite de personaje en pixel art.',
    `Descripcion del personaje: ${input.prompt}`,
    `Tamano del lienzo: ${input.size}x${input.size} pixeles.`,
    `Direcciones requeridas (un frame por direccion, mismo personaje, coherente entre si): ${dirs.join(', ')}.`,
    paletteRule,
    'Reglas de estilo: silueta legible, luz canonica arriba-izquierda, outline oscuro, sin anti-aliasing fuera de paleta, fondo 100% transparente.',
    '',
    'Responde UNICAMENTE con un objeto JSON valido (sin markdown, sin explicaciones) con este shape exacto:',
    '{',
    `  "size": ${input.size},`,
    '  "palette": ["#RRGGBB", ...],',
    `  "frames": [{ "name": "south", "rows": ["<${input.size} chars>", ... x${input.size}] }, ...]`,
    '}',
    `Cada "rows" tiene exactamente ${input.size} strings de exactamente ${input.size} caracteres.`,
    `Cada caracter: '.' para pixel transparente, o un caracter de "${INDEX_ALPHABET}" que indexa "palette" (0=palette[0], 1=palette[1], ... a=palette[10], b=palette[11], etc).`,
    `"frames" tiene exactamente ${dirs.length} entradas, con "name" en este orden: ${dirs.join(', ')}.`,
  ].join('\n');
}

/**
 * Extrae y valida el ClaudePixelSpec de la respuesta de texto del CLI.
 * Tolera fences de markdown y texto alrededor del primer bloque JSON.
 */
export function parsePixelSpec(text: string, expectedSize: number): ClaudePixelSpec {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('La respuesta de Claude no contiene un objeto JSON');
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<ClaudePixelSpec>;
  if (!Array.isArray(parsed.palette) || parsed.palette.length === 0) {
    throw new Error('Spec sin "palette"');
  }
  if (parsed.palette.length > INDEX_ALPHABET.length) {
    throw new Error(`Paleta demasiado grande (${parsed.palette.length} > ${INDEX_ALPHABET.length})`);
  }
  if (!Array.isArray(parsed.frames) || parsed.frames.length === 0) {
    throw new Error('Spec sin "frames"');
  }
  const size = typeof parsed.size === 'number' ? parsed.size : expectedSize;
  for (const frame of parsed.frames) {
    if (!Array.isArray(frame.rows) || frame.rows.length !== size) {
      throw new Error(`Frame "${frame.name ?? '?'}": esperaba ${size} rows, llego ${frame.rows?.length ?? 0}`);
    }
    frame.rows = frame.rows.map((row) => {
      // Modelos a veces acortan/alargan una fila por 1 char: pad/trim es mas util que fallar.
      if (row.length < size) return row.padEnd(size, '.');
      if (row.length > size) return row.slice(0, size);
      return row;
    });
  }
  return { size, palette: parsed.palette, frames: parsed.frames as ClaudePixelFrame[] };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const v = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.slice(0, 6), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function rasterizeFrame(spec: ClaudePixelSpec, frame: ClaudePixelFrame): PixelForgeImage {
  const { size, palette } = spec;
  const data = new Uint8ClampedArray(size * size * 4);
  const rgb = palette.map(hexToRgb);
  for (let y = 0; y < size; y += 1) {
    const row = frame.rows[y];
    if (row === undefined) continue;
    for (let x = 0; x < size; x += 1) {
      const ch = row[x];
      if (ch === '.' || ch === ' ' || ch === undefined) continue;
      const idx = INDEX_ALPHABET.indexOf(ch.toLowerCase());
      if (idx < 0 || idx >= palette.length) continue;
      const px = rgb[idx];
      if (px === undefined) continue;
      const o = (y * size + x) * 4;
      const [r, g, b] = px;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

interface CliJob {
  status: ProviderJobStatus['status'];
  progress: number;
  startedAt: number;
  estimateMs: number;
  error?: string;
  images?: Array<{ buffer: Uint8Array; meta: Record<string, unknown> }>;
  child?: ChildProcess;
  raw?: unknown;
}

/**
 * ClaudeCliAdapter — provider de generacion que corre sobre el CLI de Claude Code
 * (`claude -p`), es decir sobre la SUSCRIPCION de Claude del usuario, sin API key
 * de proveedor externo. Pide el sprite como JSON de grilla indexada a paleta y lo
 * rasteriza a PNG local con sharp; despues pasa por el mismo post-proceso
 * (quantize a PALETTE-MASTER, despeckle) que cualquier otro provider.
 *
 * Encaja en el contrato PixelProviderAdapter (spec §10) como proveedor por
 * defecto cuando PIXELLAB_API_KEY no esta configurada — la generacion "con mi
 * suscripcion de Claude" pedida por el usuario. El job es un proceso local, asi
 * que providerJobId indexa un mapa in-memory; el backend re-adopta reinicios
 * marcando failed+retryable igual que con providers remotos.
 */
export class ClaudeCliAdapter implements PixelProviderAdapter {
  readonly id: ProviderId = 'claude-cli';
  readonly capabilities: ProviderCapability[] = ['character'];

  private readonly command: string;
  private readonly model?: string;
  private readonly timeoutMs: number;
  private readonly estimateS: number;
  private readonly jobs = new Map<string, CliJob>();

  constructor(opts: ClaudeCliAdapterOptions = {}) {
    this.command = opts.command ?? process.env.PF_CLAUDE_CMD ?? 'claude';
    this.model = opts.model ?? process.env.PF_CLAUDE_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? 240_000;
    this.estimateS = opts.estimateS ?? 75;
  }

  async generateCharacter(input: NormalizedCharacterInput): Promise<ProviderAcceptedJob> {
    const providerJobId = randomUUID();
    const job: CliJob = {
      status: 'running',
      progress: 0.02,
      startedAt: Date.now(),
      estimateMs: this.estimateS * 1000,
    };
    this.jobs.set(providerJobId, job);
    void this.run(providerJobId, input);
    return { providerJobId, estimateS: this.estimateS };
  }

  async generateAnimation(_input: NormalizedAnimationInput): Promise<ProviderAcceptedJob> {
    throw new Error('claude-cli: generateAnimation no implementado (capability character solamente)');
  }

  async generateTileset(_input: NormalizedTilesetInput): Promise<ProviderAcceptedJob> {
    throw new Error('claude-cli: generateTileset no implementado (capability character solamente)');
  }

  async getJobStatus(providerJobId: string): Promise<ProviderJobStatus> {
    const job = this.jobs.get(providerJobId);
    if (!job) return { status: 'failed', error: 'job desconocido (reinicio del backend?)' };
    if (job.status === 'running') {
      // Progreso estimado en tiempo real: asintotico a 0.9 hasta que el CLI responda.
      const elapsed = Date.now() - job.startedAt;
      job.progress = Math.min(0.9, elapsed / job.estimateMs);
    }
    return { status: job.status, progress: job.progress, error: job.error };
  }

  async downloadResult(providerJobId: string): Promise<ProviderResult> {
    const job = this.jobs.get(providerJobId);
    if (!job || job.status !== 'succeeded' || !job.images) {
      throw new Error(`claude-cli: job ${providerJobId} sin resultado descargable`);
    }
    return { images: job.images, raw: job.raw };
  }

  async cancel(providerJobId: string): Promise<void> {
    const job = this.jobs.get(providerJobId);
    if (!job) return;
    job.child?.kill();
    job.status = 'failed';
    job.error = 'cancelado';
  }

  async healthcheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.invokeCli(['--version'], '', 10_000);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, detail: (err as Error).message };
    }
  }

  private async run(providerJobId: string, input: NormalizedCharacterInput): Promise<void> {
    const job = this.jobs.get(providerJobId);
    if (!job) return;
    try {
      // --strict-mcp-config: el subproceso NO carga los MCP servers del proyecto
      // (cerebro, figma, supermetrics, etc.) ni plugins/hooks. Sin esto el cold-start
      // de cada generacion arrastra toda la flota MCP de la oficina y se va a >240s
      // (timeout); con esto un turno queda en ~15s (medido). La auth/suscripcion del
      // usuario es independiente del MCP config, asi que sigue generando igual.
      const args = ['-p', '--output-format', 'json', '--strict-mcp-config'];
      if (this.model) args.push('--model', this.model);
      const stdout = await this.invokeCli(args, buildCharacterPrompt(input), this.timeoutMs, job);

      // Envelope del CLI en --output-format json: { result: string, ... }. Si el
      // CLI devolviera texto plano (versiones viejas), parsePixelSpec lo tolera.
      let text = stdout;
      try {
        const envelope = JSON.parse(stdout) as { result?: string };
        if (typeof envelope.result === 'string') text = envelope.result;
      } catch {
        /* texto plano */
      }

      const spec = parsePixelSpec(text, input.size);
      const images = await Promise.all(
        spec.frames.map(async (frame) => ({
          buffer: new Uint8Array(await imageToPng(rasterizeFrame(spec, frame))),
          meta: { direction: frame.name, size: spec.size, provider: 'claude-cli' },
        })),
      );
      job.images = images;
      job.raw = { palette: spec.palette, frames: spec.frames.map((f) => f.name) };
      job.progress = 1;
      job.status = 'succeeded';
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
    }
  }

  private invokeCli(args: string[], stdin: string, timeoutMs: number, job?: CliJob): Promise<string> {
    return new Promise((resolve, reject) => {
      // shell:true en win32 para resolver claude.cmd del PATH.
      const child = spawn(this.command, args, {
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      if (job) job.child = child;

      let out = '';
      let errOut = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude-cli: timeout tras ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        errOut += chunk.toString('utf8');
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`claude-cli: no pude ejecutar "${this.command}" (${err.message})`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`claude-cli: exit ${code}: ${(errOut || out).slice(0, 300)}`));
      });

      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    });
  }
}
