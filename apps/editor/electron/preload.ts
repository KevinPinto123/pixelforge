import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type AcceptedJobInfo,
  type AppInfo,
  type ExportBundleInput,
  type ExportBundleResult,
  type GalleryItem,
  type GalleryOpenResult,
  type GallerySaveInput,
  type GallerySaveResult,
  type GenerateCharacterInput,
  type HealthzInfo,
  type JobStatusInfo,
  type OpenPfxResult,
  type SavePfxInput,
  type SavePfxResult,
} from './ipc-channels.js';

/** Unica superficie expuesta al renderer: window.pixelforge, tipado y de canal fijo (spec §7). */
const pixelforgeApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  generateCharacter: (input: GenerateCharacterInput): Promise<AcceptedJobInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.generateCharacter, input),
  getJobStatus: (jobId: string): Promise<JobStatusInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.getJobStatus, jobId),
  getJobPreviews: (jobId: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getJobPreviews, jobId),
  healthz: (): Promise<HealthzInfo> => ipcRenderer.invoke(IPC_CHANNELS.healthz),
  savePfx: (input: SavePfxInput): Promise<SavePfxResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.savePfx, input),
  openPfx: (): Promise<OpenPfxResult | null> => ipcRenderer.invoke(IPC_CHANNELS.openPfx),
  exportBundle: (input: ExportBundleInput): Promise<ExportBundleResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportBundle, input),
  galleryList: (): Promise<GalleryItem[]> => ipcRenderer.invoke(IPC_CHANNELS.galleryList),
  gallerySave: (input: GallerySaveInput): Promise<GallerySaveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.gallerySave, input),
  galleryOpen: (path: string): Promise<GalleryOpenResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.galleryOpen, path),
  galleryDelete: (path: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.galleryDelete, path),
};

export type PixelForgeApi = typeof pixelforgeApi;

contextBridge.exposeInMainWorld('pixelforge', pixelforgeApi);
