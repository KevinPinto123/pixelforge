import { z } from 'zod';

/** RFC 7807 application/problem+json — formato de error de toda la REST API. */
export const ProblemDetailsSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Extension PixelForge: el agente debe poder autocorregirse. */
  code: z.string().optional(),
  retryable: z.boolean().optional(),
  suggestion: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export function problem(
  status: number,
  title: string,
  extra: Partial<Omit<ProblemDetails, 'status' | 'title'>> = {},
): ProblemDetails {
  return ProblemDetailsSchema.parse({ type: 'about:blank', title, status, ...extra });
}
