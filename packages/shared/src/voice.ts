import { z } from 'zod';
import { CorrectionDtoSchema } from './api';

export const SearchRequestSchema = z.strictObject({ query: z.string().trim().min(1).max(1000) });
export const NormalizedQuerySchema = z.object({
  originalQuery: z.string(),
  normalizedQuery: z.string(),
  detectedExercise: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }).nullable(),
});
export const MetricsSchema = z.object({
  sttMs: z.number().nonnegative().nullable(),
  normalizationMs: z.number().nonnegative(),
  searchMs: z.number().nonnegative(),
  totalMs: z.number().nonnegative(),
});
export const SearchResponseSchema = z.object({
  query: NormalizedQuerySchema,
  mode: z.enum(['fts', 'hybrid']),
  results: z.array(
    z.object({
      correction: CorrectionDtoSchema,
      exerciseName: z.string(),
      debug: z
        .object({
          textRank: z.number().nullable(),
          vectorRank: z.number().nullable(),
          rrfScore: z.number(),
        })
        .optional(),
    }),
  ),
  metrics: MetricsSchema,
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export const VoiceClientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start'),
    mimeType: z.enum([
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ]),
  }),
  z.strictObject({ type: z.literal('stop') }),
  z.strictObject({ type: z.literal('ping') }),
]);
// Binary frames carry audio directly, never base64 JSON.
export const MAX_AUDIO_FRAME_BYTES = 256 * 1024;
export const VoiceAudioFrameSchema = z
  .instanceof(Uint8Array)
  .refine(
    (bytes) => bytes.byteLength > 0 && bytes.byteLength <= MAX_AUDIO_FRAME_BYTES,
    'Audio frame must contain 1–262144 bytes',
  );
export const VoiceServerMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('transcript'), text: z.string(), final: z.boolean() }),
  z.strictObject({ type: z.literal('searching') }),
  z.strictObject({ type: z.literal('results'), data: SearchResponseSchema }),
  z.strictObject({ type: z.literal('metrics'), data: MetricsSchema }),
  z.strictObject({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type VoiceServerMessage = z.infer<typeof VoiceServerMessageSchema>;
