import type { ExerciseDto } from '@mg/shared';
import type { FrameAnalysis } from './protocol';

/** Resolve sustained events, never raw per-frame violations, to current taxonomy rows. */
export function liveCorrections(exercise: ExerciseDto | undefined, frame: FrameAnalysis | null) {
  const ids = new Set(
    frame?.events.filter((event) => event.endMs === null).map((event) => event.correctionId),
  );
  return exercise?.corrections.filter((correction) => ids.has(correction.id)) ?? [];
}
export function liveSignal(frame: FrameAnalysis | null): string {
  if (!frame) return 'Waiting for fresh camera measurements.';
  if (frame.poseStatus === 'multiple_people')
    return 'Multiple people detected — keep one dancer in view.';
  if (frame.poseStatus === 'no_person')
    return 'No person visible — step into view with the required joints visible.';
  if (frame.evaluations.some((evaluation) => evaluation.status === 'calibrating'))
    return 'Calibrating — face the camera, relax your shoulders and hold still for 1.5 seconds.';
  if (
    !frame.evaluations.length ||
    frame.evaluations.every((evaluation) => evaluation.status === 'unsupported')
  )
    return 'Detector unavailable for this exercise.';
  if (frame.evaluations.some((evaluation) => evaluation.status === 'insufficient_confidence'))
    return 'Insufficient visibility or camera angle on one or both sides. Reposition to face the camera.';
  return 'Pose is measurable. Corrections appear only after sustained detection.';
}
