/**
 * MediaPipe Pose (BlazePose, 33 landmarks) indices used by our rules.
 * https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export const POSE_LANDMARK_COUNT = 33;

/** Image-space landmark as produced by MediaPipe: x/y in [0,1], y grows downward. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseFrame {
  /** Media time (uploaded video) or performance.now() (live camera). */
  timestampMs: number;
  landmarks: readonly Landmark[];
}
