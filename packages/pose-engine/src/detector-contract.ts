import type { DetectorRule } from '@mg/taxonomy';
export type RuleStatus =
  'ok' | 'violation' | 'insufficient_confidence' | 'calibrating' | 'unsupported';
export interface RuleEvaluation {
  rule: DetectorRule;
  status: RuleStatus;
  value: number | null;
  side: 'left' | 'right';
  /** Minimum required landmark visibility, not probability of a technique error. */
  quality: number;
  landmarkIndices: number[];
}
