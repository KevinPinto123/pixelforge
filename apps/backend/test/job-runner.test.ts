import { ProviderRegistry, type PixelProviderAdapter } from '@pixelforge/providers';
import sharp from 'sharp';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlobStore } from '../src/blob-store.js';
import { openDb } from '../src/db.js';
import { createJobQueues } from '../src/job-queue.js';
import { createJobRunner } from '../src/job-runner.js';
import { JobsRepo } from '../src/jobs-repo.js';

let db: DatabaseSync;

beforeEach(() => {
  db = openDb(':memory:');
});

afterEach(() => {
  db.close();
});

async function makePng(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 200, b: 30, alpha: 1 } } })
    .png()
    .toBuffer();
}

function fakeCharacterAdapter(finalStatus: 'succeeded' | 'failed', png: Buffer): PixelProviderAdapter {
  let polls = 0;
  return {
    id: 'pixellab-api',
    capabilities: ['character'],
    generateCharacter: async () => ({ providerJobId: 'pj1', estimateS: 5 }),
    generateAnimation: async () => ({ providerJobId: 'x' }),
    generateTileset: async () => ({ providerJobId: 'x' }),
    getJobStatus: async () => {
      polls += 1;
      if (polls < 2) return { status: 'running', progress: 0.5 };
      return { status: finalStatus, progress: 1 };
    },
    downloadResult: async () => ({ images: [{ buffer: new Uint8Array(png), meta: {} }] }),
    healthcheck: async () => ({ ok: true }),
  };
}

describe('job runner: pipeline generate-character', () => {
  it('queued -> running -> awaiting_provider -> post_processing -> ready, con blob persistido', async () => {
    const png = await makePng();
    const registry = new ProviderRegistry();
    registry.register(fakeCharacterAdapter('succeeded', png));

    const jobsRepo = new JobsRepo(db);
    const blobStore = new BlobStore(`${process.env.TEMP ?? '/tmp'}/pf-test-blobs-${Date.now()}`);
    const runner = createJobRunner({
      registry,
      jobsRepo,
      blobStore,
      queues: createJobQueues(),
      pollDelayMs: 1,
    });

    const now = new Date().toISOString();
    jobsRepo.insert({
      id: 'job1',
      requestId: 'req1',
      projectId: 'proj1',
      status: 'queued',
      progress: 0,
      retries: 0,
      maxRetries: 3,
      outputAssetVariantIds: [],
      previewUrls: [],
      metrics: {},
      createdAt: now,
      updatedAt: now,
    });

    runner.enqueueGenerateCharacter({ jobId: 'job1', input: { prompt: 'npc', size: 48, directions: 8 } });

    await vi.waitFor(
      () => {
        const job = jobsRepo.findById('job1');
        expect(job?.status).toBe('ready');
      },
      { timeout: 5000, interval: 20 },
    );

    const job = jobsRepo.findById('job1')!;
    expect(job.provider).toBe('pixellab-api');
    expect(job.providerJobId).toBe('pj1');
    expect(job.previewUrls).toHaveLength(1);
    expect(job.previewUrls[0]).toMatch(/^blob:\/\/[a-f0-9]{64}$/);
    expect(job.metrics.totalMs).toBeGreaterThan(0);
  });

  it('marca failed+retryable si el provider nunca termina', async () => {
    const registry = new ProviderRegistry();
    registry.register({
      id: 'pixellab-api',
      capabilities: ['character'],
      generateCharacter: async () => ({ providerJobId: 'pj2' }),
      generateAnimation: async () => ({ providerJobId: 'x' }),
      generateTileset: async () => ({ providerJobId: 'x' }),
      getJobStatus: async () => ({ status: 'running', progress: 0.1 }),
      downloadResult: async () => ({ images: [] }),
      healthcheck: async () => ({ ok: true }),
    });

    const jobsRepo = new JobsRepo(db);
    const blobStore = new BlobStore(`${process.env.TEMP ?? '/tmp'}/pf-test-blobs-${Date.now()}`);
    const runner = createJobRunner({
      registry,
      jobsRepo,
      blobStore,
      queues: createJobQueues(),
      pollDelayMs: 1,
      maxPollAttempts: 3,
    });

    const now = new Date().toISOString();
    jobsRepo.insert({
      id: 'job2',
      requestId: 'req2',
      projectId: 'proj1',
      status: 'queued',
      progress: 0,
      retries: 0,
      maxRetries: 3,
      outputAssetVariantIds: [],
      previewUrls: [],
      metrics: {},
      createdAt: now,
      updatedAt: now,
    });

    runner.enqueueGenerateCharacter({ jobId: 'job2', input: { prompt: 'npc', size: 48, directions: 8 } });

    await vi.waitFor(
      () => {
        const job = jobsRepo.findById('job2');
        expect(job?.status).toBe('failed');
      },
      { timeout: 5000, interval: 20 },
    );

    const job = jobsRepo.findById('job2')!;
    expect(job.error?.retryable).toBe(true);
  });

  it('falla sin provider registrado para la capability', async () => {
    const registry = new ProviderRegistry();
    const jobsRepo = new JobsRepo(db);
    const runner = createJobRunner({
      registry,
      jobsRepo,
      blobStore: new BlobStore(`${process.env.TEMP ?? '/tmp'}/pf-test-blobs-${Date.now()}`),
      queues: createJobQueues(),
    });

    const now = new Date().toISOString();
    jobsRepo.insert({
      id: 'job3',
      requestId: 'req3',
      projectId: 'proj1',
      status: 'queued',
      progress: 0,
      retries: 0,
      maxRetries: 3,
      outputAssetVariantIds: [],
      previewUrls: [],
      metrics: {},
      createdAt: now,
      updatedAt: now,
    });

    runner.enqueueGenerateCharacter({ jobId: 'job3', input: { prompt: 'npc', size: 48, directions: 8 } });

    await vi.waitFor(() => {
      const job = jobsRepo.findById('job3');
      expect(job?.status).toBe('failed');
    });

    expect(jobsRepo.findById('job3')!.error?.code).toBe('no_provider');
  });
});
