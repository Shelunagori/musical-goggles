import { z } from 'zod';
import {
  ALIAS_LANGUAGES,
  DetectorSchema,
  EXERCISE_CATEGORIES,
  EXERCISE_LEVELS,
  SlugSchema,
} from '@mg/taxonomy';

const requiredText = (max: number) => z.string().trim().min(1, 'Required').max(max);
export const ExerciseInputSchema = z
  .object({
    slug: SlugSchema,
    name: requiredText(200),
    frenchTerm: requiredText(200).nullable(),
    germanTerm: requiredText(200).nullable(),
    level: z.enum(EXERCISE_LEVELS),
    category: z.enum(EXERCISE_CATEGORIES),
    description: z.string().trim().max(5000),
    aliases: z
      .array(z.object({ alias: requiredText(200), language: z.enum(ALIAS_LANGUAGES) }).strict())
      .max(50)
      .refine(
        (aliases) => new Set(aliases.map((a) => a.alias.toLowerCase())).size === aliases.length,
        'Aliases must be unique, ignoring case',
      ),
  })
  .strict();
export const CorrectionInputSchema = z
  .object({
    slug: SlugSchema,
    errorName: requiredText(200),
    description: z.string().trim().max(5000),
    correction: requiredText(5000),
    cuePhrase: requiredText(300),
    detector: DetectorSchema.nullable(),
  })
  .strict();
export const MutationResponseSchema = z.object({ id: z.uuid() });
export type ExerciseInput = z.infer<typeof ExerciseInputSchema>;
export type CorrectionInput = z.infer<typeof CorrectionInputSchema>;

export const DemoSessionResponseSchema = z.object({
  enabled: z.boolean(),
  active: z.boolean(),
  expiresAt: z.number().int().positive().nullable(),
});
export type DemoSessionResponse = z.infer<typeof DemoSessionResponseSchema>;
