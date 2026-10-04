/// <reference types="vite/client" />

/** Espejo del shape expuesto por electron/preload.ts — sin import cross-boundary (rootDir separado del proceso main). */
export interface AppInfo {
  name: string;
  version: string;
}

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

export interface ExportBundleInput {
  files: Array<{ name: string; text?: string; dataBase64?: string }>;
}
export interface ExportBundleResult {
  dir: string | null;
  written: string[];
}

export interface GalleryItem {
  name: string;
  path: string;
  thumbDataUrl: string | null;
  mtimeMs: number;
}
export interface GallerySaveInput {
  name: string;
  json: string;
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

interface PixelForgeApi {
  getAppInfo: () => Promise<AppInfo>;
  generateCharacter: (input: GenerateCharacterInput) => Promise<AcceptedJobInfo>;
  getJobStatus: (jobId: string) => Promise<JobStatusInfo>;
  getJobPreviews: (jobId: string) => Promise<string[]>;
  healthz: () => Promise<HealthzInfo>;
  savePfx: (input: SavePfxInput) => Promise<SavePfxResult>;
  openPfx: () => Promise<OpenPfxResult | null>;
  exportBundle: (input: ExportBundleInput) => Promise<ExportBundleResult>;
  galleryList: () => Promise<GalleryItem[]>;
  gallerySave: (input: GallerySaveInput) => Promise<GallerySaveResult>;
  galleryOpen: (path: string) => Promise<GalleryOpenResult>;
  galleryDelete: (path: string) => Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    pixelforge: PixelForgeApi;
  }
}
