import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile, readFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { z } from 'zod';
import { PixelForgeBackendClient } from './backend-client.js';
import { IPC_CHANNELS, type AppInfo } from './ipc-channels.js';

const here = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const BACKEND_BASE = `http://127.0.0.1:${process.env.PF_PORT ?? '7710'}`;

async function backendHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_BASE}/healthz`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Arranca el backend como daemon si no responde /healthz (spec §5: "el backend se
 * lanza como daemon si no responde healthcheck"). Sin esto, abrir el editor deja el
 * generation-panel sin backend hasta que alguien lo levante a mano. Best-effort: si
 * falla, el editor abre igual (dibujar no necesita backend) y el status bar refleja
 * el semaforo de conexion. `ELECTRON_RUN_AS_NODE` hace que process.execPath (electron)
 * corra el entry como Node puro en vez de abrir otra ventana.
 */
async function ensureBackendDaemon(): Promise<void> {
  if (await backendHealthy()) return;
  const entry = join(here, '..', '..', 'backend', 'dist', 'index.js');
  if (!existsSync(entry)) return; // build del backend ausente: no rompemos el arranque del editor
  try {
    spawn(process.execPath, [entry], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }).unref();
  } catch {
    /* best-effort: el status bar mostrara backend caido si no levanto */
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
].join('; ');

const GetAppInfoInputSchema = z.void();

const GenerateCharacterInputSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  size: z.union([z.literal(16), z.literal(32), z.literal(48), z.literal(64)]).optional(),
  directions: z.union([z.literal(1), z.literal(4), z.literal(8)]).optional(),
  paletteColors: z.array(z.string()).optional(),
});

const GetJobStatusInputSchema = z.string().min(1);

const SavePfxInputSchema = z.object({
  defaultName: z.string().min(1).max(120),
  json: z.string().min(2).max(50_000_000),
});

const GallerySaveInputSchema = z.object({
  name: z.string().min(1).max(120),
  json: z.string().min(2).max(50_000_000),
  thumbBase64: z.string().min(1).max(20_000_000),
});
const GalleryPathSchema = z.string().min(1).max(4096);

/** Nombres de archivo del bundle: relativos, sin separadores ni '..' (nada de path traversal). */
const SAFE_FILENAME_RE = /^[\w.\-]+$/;
const ExportBundleInputSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().regex(SAFE_FILENAME_RE),
        text: z.string().max(50_000_000).optional(),
        dataBase64: z.string().max(100_000_000).optional(),
      }),
    )
    .min(1)
    .max(512),
});

/**
 * Unico lugar del proceso main que sabe hablar con el backend y el filesystem
 * (spec §7: el renderer nunca ve token, URL ni paths — solo invoca estos
 * canales IPC, validados con Zod).
 */
function registerIpcHandlers(): void {
  const backend = new PixelForgeBackendClient();

  ipcMain.handle(IPC_CHANNELS.getAppInfo, (_event, rawInput: unknown): AppInfo => {
    GetAppInfoInputSchema.parse(rawInput);
    return { name: 'pixelforge-editor', version: app.getVersion() };
  });

  ipcMain.handle(IPC_CHANNELS.generateCharacter, async (_event, rawInput: unknown) => {
    const input = GenerateCharacterInputSchema.parse(rawInput);
    return backend.generateCharacter(input);
  });

  ipcMain.handle(IPC_CHANNELS.getJobStatus, async (_event, rawInput: unknown) => {
    const jobId = GetJobStatusInputSchema.parse(rawInput);
    return backend.getJobStatus(jobId);
  });

  ipcMain.handle(IPC_CHANNELS.getJobPreviews, async (_event, rawInput: unknown) => {
    const jobId = GetJobStatusInputSchema.parse(rawInput);
    return backend.getJobPreviews(jobId);
  });

  ipcMain.handle(IPC_CHANNELS.healthz, async (_event, rawInput: unknown) => {
    GetAppInfoInputSchema.parse(rawInput);
    return backend.healthz();
  });

  ipcMain.handle(IPC_CHANNELS.savePfx, async (event, rawInput: unknown) => {
    const input = SavePfxInputSchema.parse(rawInput);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { path: null };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Guardar sprite PixelForge',
      defaultPath: input.defaultName.endsWith('.pfx.json')
        ? input.defaultName
        : `${input.defaultName}.pfx.json`,
      filters: [{ name: 'PixelForge sprite', extensions: ['pfx.json', 'json'] }],
    });
    if (canceled || !filePath) return { path: null };
    await writeFile(filePath, input.json, 'utf8');
    return { path: filePath };
  });

  ipcMain.handle(IPC_CHANNELS.openPfx, async (event, rawInput: unknown) => {
    GetAppInfoInputSchema.parse(rawInput);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Abrir sprite PixelForge',
      filters: [
        { name: 'PixelForge sprite', extensions: ['json'] },
        { name: 'Todos', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    const first = filePaths[0];
    if (canceled || !first) return null;
    const path = normalize(first);
    const json = await readFile(path, 'utf8');
    return { name: basename(path).replace(/\.pfx\.json$|\.json$/i, ''), json, path };
  });

  ipcMain.handle(IPC_CHANNELS.exportBundle, async (event, rawInput: unknown) => {
    const input = ExportBundleInputSchema.parse(rawInput);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { dir: null, written: [] };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Exportar a carpeta (ej: videocoder-game/assets/characters)',
      properties: ['openDirectory', 'createDirectory'],
    });
    const chosen = filePaths[0];
    if (canceled || !chosen) return { dir: null, written: [] };
    const dir = normalize(chosen);
    await mkdir(dir, { recursive: true });
    const written: string[] = [];
    for (const file of input.files) {
      const target = join(dir, file.name);
      if (file.dataBase64 !== undefined) {
        await writeFile(target, Buffer.from(file.dataBase64, 'base64'));
      } else if (file.text !== undefined) {
        await writeFile(target, file.text, 'utf8');
      } else {
        continue;
      }
      written.push(file.name);
    }
    return { dir, written };
  });

  // ── Galeria: biblioteca local de sprites (Aseprite-like) ────────────────
  // Carpeta fija %APPDATA%/pixelforge/gallery: cada sprite = <name>.pfx.json +
  // <name>.thumb.png. Sin dialogos: guardar/abrir/borrar son directos, para que
  // la galeria funcione como un "home" de proyectos recientes.
  ipcMain.handle(IPC_CHANNELS.galleryList, async () => {
    const dir = galleryDir();
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir);
    const items = [];
    for (const file of entries) {
      if (!file.endsWith('.pfx.json')) continue;
      const path = join(dir, file);
      const base = file.replace(/\.pfx\.json$/, '');
      const thumbPath = join(dir, `${base}.thumb.png`);
      let thumbDataUrl: string | null = null;
      if (existsSync(thumbPath)) {
        thumbDataUrl = `data:image/png;base64,${(await readFile(thumbPath)).toString('base64')}`;
      }
      const st = await stat(path);
      items.push({ name: base, path, thumbDataUrl, mtimeMs: st.mtimeMs });
    }
    items.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return items;
  });

  ipcMain.handle(IPC_CHANNELS.gallerySave, async (_event, rawInput: unknown) => {
    const input = GallerySaveInputSchema.parse(rawInput);
    const dir = galleryDir();
    await mkdir(dir, { recursive: true });
    const safe = input.name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.pfx\.json$/, '') || 'sprite';
    const jsonPath = join(dir, `${safe}.pfx.json`);
    await writeFile(jsonPath, input.json, 'utf8');
    await writeFile(join(dir, `${safe}.thumb.png`), Buffer.from(input.thumbBase64, 'base64'));
    return { path: jsonPath };
  });

  ipcMain.handle(IPC_CHANNELS.galleryOpen, async (_event, rawInput: unknown) => {
    const path = normalize(GalleryPathSchema.parse(rawInput));
    if (!path.startsWith(galleryDir())) throw new Error('Ruta fuera de la galeria');
    const json = await readFile(path, 'utf8');
    return { name: basename(path).replace(/\.pfx\.json$/, ''), json, path };
  });

  ipcMain.handle(IPC_CHANNELS.galleryDelete, async (_event, rawInput: unknown) => {
    const path = normalize(GalleryPathSchema.parse(rawInput));
    if (!path.startsWith(galleryDir())) throw new Error('Ruta fuera de la galeria');
    await unlink(path).catch(() => undefined);
    await unlink(path.replace(/\.pfx\.json$/, '.thumb.png')).catch(() => undefined);
    return { ok: true };
  });
}

function galleryDir(): string {
  const base = process.env.APPDATA ?? join(homedir(), '.config');
  return join(base, 'pixelforge', 'gallery');
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#1b1e2b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(here, 'preload.js'),
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(join(here, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });

  registerIpcHandlers();
  void ensureBackendDaemon(); // no bloquea: la ventana abre ya, el backend levanta en paralelo
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
