import { z } from 'zod';
import {
  ALIAS_LANGUAGES,
  DetectorSchema,
  EXERCISE_CATEGORIES,
  EXERCISE_LEVELS,
} from '@mg/taxonomy';

/** `GET /health` — liveness only, never touches the database. */
export const HealthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** `GET /health/ready` — readiness, includes a database round-trip. */
export const ReadinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['ok', 'unavailable']),
  database_latency_ms: z.number().nullable(),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const AliasDtoSchema = z.object({
  alias: z.string(),
  language: z.enum(ALIAS_LANGUAGES),
});
export type AliasDto = z.infer<typeof AliasDtoSchema>;

export const CorrectionDtoSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  exerciseId: z.uuid(),
  errorName: z.string(),
  description: z.string(),
  correction: z.string(),
  cuePhrase: z.string(),
  detector: DetectorSchema.nullable(),
  camera: z.enum(['supported', 'not_supported']),
  /** Set when the stored detector JSON is invalid; the correction is then treated as not camera-detectable. */
  detectorIssue: z.string().nullable(),
  /** True once Phase 2 has generated an embedding for the current text. */
  hasEmbedding: z.boolean(),
  updatedAt: z.string(),
});
export type CorrectionDto = z.infer<typeof CorrectionDtoSchema>;

export const ExerciseDtoSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  frenchTerm: z.string().nullable(),
  germanTerm: z.string().nullable(),
  level: z.enum(EXERCISE_LEVELS),
  category: z.enum(EXERCISE_CATEGORIES),
  description: z.string(),
  aliases: z.array(AliasDtoSchema),
  corrections: z.array(CorrectionDtoSchema),
});
export type ExerciseDto = z.infer<typeof ExerciseDtoSchema>;

export const CoverageSchema = z.object({
  cameraDetectable: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const DATASET_NOTICE =
  'Generic, publicly known ballet terminology written for this prototype. It is not the musical-goggles proprietary curriculum.';

/** `GET /curriculum` */
export const CurriculumResponseSchema = z.object({
  dataset: z.object({ label: z.literal('DEMO DATA'), notice: z.string() }),
  coverage: CoverageSchema,
  exercises: z.array(ExerciseDtoSchema),
});
export type CurriculumResponse = z.infer<typeof CurriculumResponseSchema>;

/** `GET /exercises/:slug` */
export const ExerciseResponseSchema = z.object({ exercise: ExerciseDtoSchema });
export type ExerciseResponse = z.infer<typeof ExerciseResponseSchema>;

export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'NOT_FOUND',
  'DATABASE_UNAVAILABLE',
  'DATA_INTEGRITY',
  'INTERNAL',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
