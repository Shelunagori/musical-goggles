import { z } from 'zod';

/**
 * Geometric rules the pose engine knows how to evaluate.
 *
 * This list is deliberately tiny. A correction gets a detector only when the
 * error is reasonably observable from single-camera 2D landmarks. Everything
 * else keeps `detector = null` and is reported honestly as "not camera-detectable".
 *
 * The pose engine emits one of these rule ids; the human-readable correction
 * text always comes from the taxonomy record, never from the engine.
 */
export const DETECTOR_RULES = ['knee_alignment', 'heel_lift', 'shoulder_elevation'] as const;
export type DetectorRule = (typeof DETECTOR_RULES)[number];

export const GeometricDetectorSchema = z
  .object({
    type: z.literal('geometric'),
    rule: z.enum(DETECTOR_RULES),
    /** Rule-specific threshold in normalized pose units (torso length = 1). */
    threshold: z.number().positive().max(1),
    /** Minimum time the violation must persist before an alert is raised. */
    min_duration_ms: z.number().int().nonnegative().max(10_000).optional(),
  })
  .strict();

/** Today only geometric detectors exist; a learned-model variant can be added as a discriminated union. */
export const DetectorSchema = GeometricDetectorSchema;
export type Detector = z.infer<typeof DetectorSchema>;

export type DetectorParseResult =
  { ok: true; detector: Detector | null } | { ok: false; error: string };

/**
 * Parse a raw `corrections.detector` JSONB value.
 * `null`/`undefined` is valid and means "not camera-detectable".
 */
export function parseDetector(raw: unknown): DetectorParseResult {
  if (raw === null || raw === undefined) return { ok: true, detector: null };
  const parsed = DetectorSchema.safeParse(raw);
  if (parsed.success) return { ok: true, detector: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; '),
  };
}

export type CameraSupport = 'supported' | 'not_supported';

export function cameraSupport(detector: Detector | null): CameraSupport {
  return detector ? 'supported' : 'not_supported';
}

export interface DetectorCoverage {
  cameraDetectable: number;
  total: number;
}

export function detectorCoverage(
  items: ReadonlyArray<{ detector: Detector | null }>,
): DetectorCoverage {
  return {
    cameraDetectable: items.filter((i) => i.detector !== null).length,
    total: items.length,
  };
}
