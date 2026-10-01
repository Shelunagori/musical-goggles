import { supportsRule, type DetectorBinding } from '@mg/pose-engine';
import type { ExerciseDto } from '@mg/shared';
export function detectorBindings(exercise: ExerciseDto): DetectorBinding[] {
  return exercise.corrections.flatMap((c) =>
    c.detector && !c.detectorIssue && supportsRule(c.detector.rule)
      ? [{ correctionId: c.id, detector: c.detector }]
      : [],
  );
}
