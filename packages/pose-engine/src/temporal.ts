import type { RuleEvaluation } from './detector-contract';
export interface DetectionEvent {
  id: string;
  correctionId: string;
  rule: RuleEvaluation['rule'];
  side: RuleEvaluation['side'];
  startMs: number;
  endMs: number | null;
  confirmedMs: number;
  endReason?: 'cleared' | 'tracking_lost' | 'ended' | 'cancelled';
}
export interface TemporalOptions {
  persistenceMs: number;
  minFrames: number;
  clearMs: number;
  clearFrames: number;
  maxGapMs: number;
}
const DEFAULTS: TemporalOptions = {
  persistenceMs: 400,
  minFrames: 3,
  clearMs: 400,
  clearFrames: 3,
  maxGapMs: 350,
};
export class TemporalDetector {
  private options: TemporalOptions;
  private lastMs: number | undefined;
  private candidate: { start: number; frames: number } | undefined;
  private clearing: { start: number; frames: number } | undefined;
  private active: DetectionEvent | undefined;
  private events: DetectionEvent[] = [];
  constructor(
    private readonly correctionId: string,
    options: Partial<TemporalOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
    if (
      Object.values(this.options).some((v) => !Number.isFinite(v) || v < 0) ||
      !Number.isInteger(this.options.minFrames) ||
      !Number.isInteger(this.options.clearFrames) ||
      this.options.minFrames < 1 ||
      this.options.clearFrames < 1 ||
      this.options.maxGapMs <= 0
    )
      throw new Error('Invalid temporal configuration');
  }
  private end(time: number, reason: DetectionEvent['endReason']) {
    if (this.active) {
      this.active.endMs = time;
      this.active.endReason = reason;
    }
    this.active = undefined;
    this.candidate = undefined;
    this.clearing = undefined;
  }
  update(time: number, result: RuleEvaluation): void {
    if (!Number.isFinite(time) || time < 0 || (this.lastMs !== undefined && time <= this.lastMs))
      throw new Error('Frame timestamps must increase');
    if (this.lastMs !== undefined && time - this.lastMs > this.options.maxGapMs)
      this.end(this.lastMs, 'tracking_lost');
    const previous = this.lastMs;
    this.lastMs = time;
    if (result.status !== 'ok' && result.status !== 'violation') {
      this.end(previous ?? time, 'tracking_lost');
      return;
    }
    if (result.status === 'violation') {
      this.clearing = undefined;
      if (this.active) return;
      this.candidate ??= { start: time, frames: 0 };
      this.candidate.frames++;
      if (
        time - this.candidate.start >= this.options.persistenceMs &&
        this.candidate.frames >= this.options.minFrames
      ) {
        this.active = {
          id: `${this.correctionId}:${result.side}:${time}`,
          correctionId: this.correctionId,
          rule: result.rule,
          side: result.side,
          startMs: this.candidate.start,
          confirmedMs: time,
          endMs: null,
        };
        this.events.push(this.active);
        this.candidate = undefined;
      }
    } else {
      this.candidate = undefined;
      if (!this.active) return;
      this.clearing ??= { start: time, frames: 0 };
      this.clearing.frames++;
      if (
        time - this.clearing.start >= this.options.clearMs &&
        this.clearing.frames >= this.options.clearFrames
      )
        this.end(this.clearing.start, 'cleared');
    }
  }
  finish(reason: 'ended' | 'cancelled' = 'ended') {
    this.end(this.lastMs ?? 0, reason);
  }
  snapshot(): DetectionEvent[] {
    return this.events.map((e) => ({ ...e }));
  }
}
