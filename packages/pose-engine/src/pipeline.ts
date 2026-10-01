import { DetectorSchema, type Detector } from '@mg/taxonomy';
import type { PoseFrame } from './landmarks';
import { evaluateDetector, shoulderClearance, type ShoulderBaseline } from './rules';
import { TemporalDetector } from './temporal';
export interface DetectorBinding {
  correctionId: string;
  detector: Detector;
}
/** Stateful per recording, independent of React, MediaPipe and input source. */
export class PosePipeline {
  private bindings: DetectorBinding[];
  private filters = new Map<string, TemporalDetector>();
  private calibration: { time: number; value: ShoulderBaseline }[] = [];
  private baseline?: ShoulderBaseline;
  private lastMs = -1;
  constructor(bindings: DetectorBinding[]) {
    this.bindings = bindings.map((b) => ({
      correctionId: b.correctionId,
      detector: DetectorSchema.parse(b.detector),
    }));
    if (new Set(bindings.map((b) => b.correctionId)).size !== bindings.length)
      throw new Error('Duplicate correction binding');
    for (const b of this.bindings)
      for (const side of ['left', 'right'])
        this.filters.set(
          `${b.correctionId}:${side}`,
          new TemporalDetector(b.correctionId, {
            persistenceMs: b.detector.min_duration_ms ?? 400,
          }),
        );
  }
  process(frame: PoseFrame) {
    if (
      !Number.isFinite(frame.timestampMs) ||
      frame.timestampMs < 0 ||
      frame.timestampMs <= this.lastMs
    )
      throw new Error('Frame timestamps must increase');
    if (!this.baseline && this.bindings.some((b) => b.detector.rule === 'shoulder_elevation')) {
      const value = shoulderClearance(frame.landmarks);
      if (!value || frame.timestampMs - this.lastMs > 350) this.calibration = [];
      if (value) {
        this.calibration.push({ time: frame.timestampMs, value });
        while (
          this.calibration.length > 1 &&
          frame.timestampMs - (this.calibration[0]?.time ?? 0) > 1700
        )
          this.calibration.shift();
        const first = this.calibration[0];
        if (first && this.calibration.length >= 12 && frame.timestampMs - first.time >= 1500) {
          const left = this.calibration.map((s) => s.value.left).sort((a, b) => a - b);
          const right = this.calibration.map((s) => s.value.right).sort((a, b) => a - b);
          if (
            Math.max(...left) - Math.min(...left) <= 0.08 &&
            Math.max(...right) - Math.min(...right) <= 0.08
          )
            this.baseline = {
              left: left[Math.floor(left.length / 2)] ?? 0,
              right: right[Math.floor(right.length / 2)] ?? 0,
            };
        }
      }
    }
    this.lastMs = frame.timestampMs;
    const evaluations = this.bindings.flatMap((b) =>
      evaluateDetector(frame.landmarks, b.detector, this.baseline).map((result) => {
        this.filters.get(`${b.correctionId}:${result.side}`)?.update(frame.timestampMs, result);
        return { correctionId: b.correctionId, ...result };
      }),
    );
    return { evaluations, events: this.events(), calibrated: Boolean(this.baseline) };
  }
  events() {
    return [...this.filters.values()]
      .flatMap((f) => f.snapshot())
      .sort((a, b) => a.startMs - b.startMs);
  }
  finish(reason: 'ended' | 'cancelled' = 'ended') {
    for (const f of this.filters.values()) f.finish(reason);
    return this.events();
  }
}
