import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import { ProjectSchema, CreateProjectInputSchema, ProjectSummarySchema } from './project.js';
import { AssetSchema, AssetVariantSchema } from './asset.js';
import { JobSchema, AcceptedJobSchema, GenerateCharacterInputSchema } from './job.js';
import { ProblemDetailsSchema } from './errors.js';

const registry: Record<string, z.ZodTypeAny> = {
  Project: ProjectSchema,
  CreateProjectInput: CreateProjectInputSchema,
  ProjectSummary: ProjectSummarySchema,
  Asset: AssetSchema,
  AssetVariant: AssetVariantSchema,
  Job: JobSchema,
  AcceptedJob: AcceptedJobSchema,
  GenerateCharacterInput: GenerateCharacterInputSchema,
  ProblemDetails: ProblemDetailsSchema,
};

/**
 * Exporta cada contrato como JSON Schema — misma fuente Zod alimenta
 * MCP tools (inputSchema) y documentacion REST.
 */
export function exportJsonSchemas(): Record<string, object> {
  const out: Record<string, object> = {};
  for (const [name, schema] of Object.entries(registry)) {
    out[name] = zodToJsonSchema(schema, { name, target: 'jsonSchema7' });
  }
  return out;
}
