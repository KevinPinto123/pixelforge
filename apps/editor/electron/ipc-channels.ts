/** Whitelist de canales IPC expuestos por preload. Toda tool nueva se agrega aqui primero. */
export const IPC_CHANNELS = {
  getAppInfo: 'pixelforge:getAppInfo',
  generateCharacter: 'pixelforge:generateCharacter',
  getJobStatus: 'pixelforge:getJobStatus',
  getJobPreviews: 'pixelforge:getJobPreviews',
  healthz: 'pixelforge:healthz',
  savePfx: 'pixelforge:savePfx',
  openPfx: 'pixelforge:openPfx',
  exportBundle: 'pixelforge:exportBundle',
  galleryList: 'pixelforge:galleryList',
  gallerySave: 'pixelforge:gallerySave',
  galleryOpen: 'pixelforge:galleryOpen',
  galleryDelete: 'pixelforge:galleryDelete',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface AppInfo {
  name: string;
  version: string;
}

/** Espejo minimo de GenerateCharacterInputSchema (@pixelforge/contracts) sin cross-import proceso main/renderer. */
export interface GenerateCharacterInput {
  projectId: string;
  prompt: string;
  size?: 16 | 32 | 48 | 64;
  directions?: 1 | 4 | 8;
  paletteColors?: string[];
}

export interface AcceptedJobInfo {
  jobId: string;
  status: string;
  pollWith: 'get_job_status';
}

export interface JobStatusInfo {
  id: string;
  status: string;
  progress: number;
  provider?: string;
  previewUrls: string[];
  error?: { code: string; message: string; retryable: boolean; suggestion?: string };
}

export interface HealthzInfo {
  ok: boolean;
  version?: string;
  providers?: string[];
}

/** Guardar .pfx: main abre dialogo nativo y escribe el JSON. path null = usuario cancelo. */
export interface SavePfxInput {
  defaultName: string;
  json: string;
}
export interface SavePfxResult {
  path: string | null;
}

export interface OpenPfxResult {
  name: string;
  json: string;
  path: string;
}

/** Export a juego: N archivos (texto o binario base64) a un directorio elegido con dialogo nativo. */
export interface ExportBundleInput {
  files: Array<{ name: string; text?: string; dataBase64?: string }>;
}
export interface ExportBundleResult {
  dir: string | null;
  written: string[];
}

/** Galeria: biblioteca local de sprites (Aseprite-like) en %APPDATA%/pixelforge/gallery. */
export interface GalleryItem {
  name: string;
  path: string;
  thumbDataUrl: string | null;
  mtimeMs: number;
}
export interface GallerySaveInput {
  name: string;
  json: string;
  /** PNG base64 (sin prefijo data:) de la miniatura del sprite. */
  thumbBase64: string;
}
export interface GallerySaveResult {
  path: string;
}
export interface GalleryOpenResult {
  name: string;
  json: string;
  path: string;
}
