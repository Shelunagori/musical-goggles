import { DetectorSchema, type Detector, type DetectorRule } from '@mg/taxonomy';
import { distance2d, midpoint, normalizePose, type NormalizedPose } from './geometry';
import { LM, type Landmark } from './landmarks';
import type { RuleEvaluation } from './detector-contract';
export const SUPPORTED_RULES: readonly DetectorRule[] = ['knee_alignment', 'shoulder_elevation'];
export const supportsRule = (rule: DetectorRule) => SUPPORTED_RULES.includes(rule);
export type ShoulderBaseline = { left: number; right: number };
const SIDES = ['left', 'right'] as const;
const JOINTS = {
  left: {
    hip: LM.LEFT_HIP,
    knee: LM.LEFT_KNEE,
    ankle: LM.LEFT_ANKLE,
    otherHip: LM.RIGHT_HIP,
    shoulder: LM.LEFT_SHOULDER,
    ear: LM.LEFT_EAR,
  },
  right: {
    hip: LM.RIGHT_HIP,
    knee: LM.RIGHT_KNEE,
    ankle: LM.RIGHT_ANKLE,
    otherHip: LM.LEFT_HIP,
    shoulder: LM.RIGHT_SHOULDER,
    ear: LM.RIGHT_EAR,
  },
};
function visible(points: readonly Landmark[], ids: number[]) {
  return ids.every((id) => {
    const p = points[id];
    return (
      p &&
      [p.x, p.y, p.z].every(Number.isFinite) &&
      Number.isFinite(p.visibility) &&
      (p.visibility ?? 0) >= 0.65 &&
      (p.visibility ?? 0) <= 1
    );
  });
}
function frontal(pose: NormalizedPose): boolean {
  const p = pose.points;
  const ls = p[LM.LEFT_SHOULDER],
    rs = p[LM.RIGHT_SHOULDER],
    lh = p[LM.LEFT_HIP],
    rh = p[LM.RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return false;
  const width = Math.abs(ls.x - rs.x);
  return (
    width > 0.45 &&
    Math.abs(lh.x - rh.x) > 0.25 &&
    Math.abs(ls.y - rs.y) < 0.3 &&
    Math.abs(midpoint(ls, rs).x) < 0.35
  );
}
export function shoulderClearance(landmarks: readonly Landmark[]): ShoulderBaseline | null {
  const ids = [
    LM.LEFT_SHOULDER,
    LM.RIGHT_SHOULDER,
    LM.LEFT_HIP,
    LM.RIGHT_HIP,
    LM.LEFT_EAR,
    LM.RIGHT_EAR,
  ];
  if (!visible(landmarks, ids)) return null;
  const pose = normalizePose(landmarks, 0.65);
  if (!pose || !frontal(pose)) return null;
  const le = pose.points[LM.LEFT_EAR],
    re = pose.points[LM.RIGHT_EAR];
  if (!le || !re || Math.abs(le.y - re.y) > 0.2) return null;
  const values = SIDES.map((side) => {
    const j = JOINTS[side];
    const ear = pose.points[j.ear],
      shoulder = pose.points[j.shoulder];
    return ear && shoulder && ear.y < shoulder.y ? distance2d(ear, shoulder) : NaN;
  });
  const [left, right] = values;
  return left !== undefined && right !== undefined && [left, right].every(Number.isFinite)
    ? { left, right }
    : null;
}
/** Pure frontal-plane heuristic; coordinates must use equal x/y units (see adapter). */
export function evaluateDetector(
  landmarks: readonly Landmark[],
  config: Detector,
  baseline?: ShoulderBaseline,
): RuleEvaluation[] {
  const detector = DetectorSchema.parse(config);
  const pose = normalizePose(landmarks, 0.65);
  return SIDES.map((side) => {
    const j = JOINTS[side];
    const landmarkIndices =
      detector.rule === 'knee_alignment'
        ? [j.hip, j.knee, j.ankle, j.otherHip, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER]
        : [
            j.ear,
            j.shoulder,
            LM.LEFT_EAR,
            LM.RIGHT_EAR,
            LM.LEFT_SHOULDER,
            LM.RIGHT_SHOULDER,
            LM.LEFT_HIP,
            LM.RIGHT_HIP,
          ];
    const result: RuleEvaluation = {
      rule: detector.rule,
      side,
      status: 'insufficient_confidence',
      value: null,
      quality: Math.min(
        ...landmarkIndices.map((id) =>
          Number.isFinite(landmarks[id]?.visibility)
            ? Math.max(0, Math.min(1, landmarks[id]?.visibility ?? 0))
            : 0,
        ),
      ),
      landmarkIndices,
    };
    if (!supportsRule(detector.rule)) return { ...result, status: 'unsupported' };
    if (!pose || !frontal(pose) || !visible(landmarks, landmarkIndices)) return result;
    let value: number;
    if (detector.rule === 'knee_alignment') {
      const hip = pose.points[j.hip],
        knee = pose.points[j.knee],
        ankle = pose.points[j.ankle],
        other = pose.points[j.otherHip];
      if (!hip || !knee || !ankle || !other || ankle.y - hip.y < 0.5) return result;
      const t = (knee.y - hip.y) / (ankle.y - hip.y);
      if (t < 0.1 || t > 0.9) return result;
      const axisX = hip.x + t * (ankle.x - hip.x);
      // Medial deviation from the hip–ankle line in torso lengths. Mirror invariant.
      value = (knee.x - axisX) * Math.sign(other.x - hip.x);
    } else {
      const clearance = shoulderClearance(landmarks);
      if (!clearance) return result;
      if (!baseline) return { ...result, status: 'calibrating' };
      value = baseline[side] - clearance[side];
    }
    return { ...result, value, status: value > detector.threshold ? 'violation' : 'ok' };
  });
}
