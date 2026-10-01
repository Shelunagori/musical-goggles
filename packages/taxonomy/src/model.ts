import { z } from 'zod';

export const EXERCISE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];

export const EXERCISE_CATEGORIES = ['barre', 'centre', 'port_de_bras', 'allegro'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const ALIAS_LANGUAGES = ['en', 'fr', 'de'] as const;
export type AliasLanguage = (typeof ALIAS_LANGUAGES)[number];

/** snake_case identifier, mirrored by a CHECK constraint in the database. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
export const SlugSchema = z.string().min(1).max(80).regex(SLUG_PATTERN, 'must be snake_case');
