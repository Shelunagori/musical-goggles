import {
  ALIAS_LANGUAGES,
  EXERCISE_CATEGORIES,
  EXERCISE_LEVELS,
  cameraSupport,
  detectorCoverage,
  parseDetector,
  type AliasLanguage,
  type ExerciseCategory,
  type ExerciseLevel,
} from '@mg/taxonomy';
import {
  DATASET_NOTICE,
  type CorrectionDto,
  type CurriculumResponse,
  type ExerciseDto,
} from '@mg/shared';
import { AppError } from '../errors';
import type { CorrectionRow, CurriculumRows, ExerciseRow } from './repository';

export interface MappingWarning {
  correctionId: string;
  slug: string;
  issue: string;
}

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string,
  field: string,
  id: string,
): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new AppError('DATA_INTEGRITY', `Unexpected ${field} "${value}" on ${id}`, 500);
}

export function toCorrectionDto(row: CorrectionRow, warnings: MappingWarning[]): CorrectionDto {
  const parsed = parseDetector(row.detector);
  const detector = parsed.ok ? parsed.detector : null;
  const detectorIssue = parsed.ok ? null : `Invalid detector config: ${parsed.error}`;
  if (detectorIssue) warnings.push({ correctionId: row.id, slug: row.slug, issue: detectorIssue });
  return {
    id: row.id,
    slug: row.slug,
    exerciseId: row.exercise_id,
    errorName: row.error_name,
    description: row.description,
    correction: row.correction,
    cuePhrase: row.cue_phrase,
    detector,
    camera: cameraSupport(detector),
    detectorIssue,
    hasEmbedding: row.has_embedding,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function toExerciseDto(row: ExerciseRow, corrections: CorrectionDto[]): ExerciseDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    frenchTerm: row.french_term,
    germanTerm: row.german_term,
    level: oneOf<ExerciseLevel>(EXERCISE_LEVELS, row.level, 'level', row.slug),
    category: oneOf<ExerciseCategory>(EXERCISE_CATEGORIES, row.category, 'category', row.slug),
    description: row.description,
    aliases: row.aliases.map((a) => ({
      alias: a.alias,
      language: oneOf<AliasLanguage>(ALIAS_LANGUAGES, a.language, 'alias language', row.slug),
    })),
    corrections,
  };
}

/** Group flat rows into the nested curriculum. Invalid detectors degrade to "not camera-detectable" and are reported. */
export function buildCurriculum(rows: CurriculumRows): {
  exercises: ExerciseDto[];
  warnings: MappingWarning[];
} {
  const warnings: MappingWarning[] = [];
  const byExercise = new Map<string, CorrectionDto[]>();
  for (const row of rows.corrections) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push(toCorrectionDto(row, warnings));
    byExercise.set(row.exercise_id, list);
  }
  const exercises = rows.exercises.map((e) => toExerciseDto(e, byExercise.get(e.id) ?? []));
  return { exercises, warnings };
}

export function toCurriculumResponse(exercises: ExerciseDto[]): CurriculumResponse {
  return {
    dataset: { label: 'DEMO DATA', notice: DATASET_NOTICE },
    coverage: detectorCoverage(exercises.flatMap((e) => e.corrections)),
    exercises,
  };
}
