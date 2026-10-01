import type { DetectorRule } from '@mg/taxonomy';

/**
 * What a rule evaluation returns for one frame. Note: no correction text here.
 * The UI resolves `rule` -> taxonomy correction record (cue, correction, error name).
 */
export type RuleStatus = 'ok' | 'violation' | 'insufficient_confidence';

export interface RuleEvaluation {
  rule: DetectorRule;
  status: RuleStatus;
  /** Rule-specific measurement in normalized pose units, null when not measurable. */
  value: number | null;
  side?: 'left' | 'right' | 'both';
}

// Phase 3 will add: rule implementations, the per-frame evaluator and the
// debounce/event state machine — used identically by uploaded video and live camera.
