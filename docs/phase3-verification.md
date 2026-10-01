# Phase 3 — uploaded video and deterministic pose analysis

## Baseline and scope

Started from clean Phase 2 commit `4ebea50cb4c0569c9671f8d903f7889abfaf362b`. Inspected pose-engine geometry/contracts, taxonomy schemas, the nullable detector JSONB/seed data, Next.js UI architecture and Phase 1/2 tests. No API/voice/search/embedding functionality, database schema or seed correction text was changed. Live webcam was not implemented.

## Changed files

- `packages/pose-engine/src/adapter.ts`: validated MediaPipe landmark conversion, including aspect-ratio correction.
- `rules.ts`, `detector-contract.ts`, `geometry.ts`: pure side-specific detector measurements, visibility/frontal-view gates and explicit unsupported/calibrating states.
- `pipeline.ts`, `temporal.ts`, `index.ts`: recording-scoped calibration, correction-ID bindings and reusable event filtering.
- `rules.test.ts`, `temporal.test.ts`, `geometry.test.ts`, `fixtures.test-support.ts`: synthetic geometry, calibration, confidence, configuration and temporal tests.
- `apps/web/src/lib/pose/{protocol,pose.worker,worker-client,video-analysis,taxonomy,overlay}.ts`: typed worker messages, model adapter, bounded decoder/inference pipeline, taxonomy bindings and canvas rendering.
- `apps/web/src/lib/pose/{adapter,lifecycle}.test.ts`: sampling/binding, decoded-seek/cancellation, model failures/timeouts and overlay scaling tests.
- `apps/web/src/components/VideoClassroom.tsx`, `src/app/video/page.tsx`, `src/app/page.tsx`: local picker/drop, preview, exercise context, controls, overlay, progress, current corrections, event timeline and technical metrics.
- `apps/web/package.json`, `pnpm-lock.yaml`: pinned MediaPipe Tasks Vision dependency.
- `apps/web/next.config.ts`: CSP on worker script responses to restrict network access to model assets and block runtime telemetry.
- README and architecture documentation.

Next.js generated AGENTS/CLAUDE files during dev verification; these were moved outside the repository after stopping dev and are not part of this change.

## MediaPipe and frame processing

Selected `@mediapipe/tasks-vision` **1.0.1**, using the supported [Pose Landmarker Web API](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js): `FilesetResolver.forVisionTasks`, `PoseLandmarker.createFromOptions`, and `detectForVideo` in VIDEO mode. The dependency and WASM URL versions match. The Lite float16 task asset is pinned to model version 1. Runtime/model assets download from jsDelivr/Google; missing assets surface an error.

A classic bundled Web Worker runs MediaPipe with the CPU delegate and up to two poses, rejecting multi-person frames for this single-dancer prototype. The main thread seeks a browser-local video at 10 Hz, waits for decode, creates a resized bitmap (long edge ≤960 px), and transfers it. Only one frame is in flight; every bitmap/result is closed and the worker is terminated on teardown. Five-minute clips bound history to at most 3,000 samples. Pose history stores landmarks/evaluations without repeated event-list snapshots.

No `getUserMedia` or live-camera path was added. The shared pipeline accepts timestamped landmarks; future camera input can use it without moving detector logic into React.

## Geometry and supported rules

Both x and y must use equal spatial units. The adapter changes x and z from width units to image-height units before normalization. Torso length is shoulder-midpoint to hip-midpoint distance. This avoids changing detector thresholds when aspect ratio, image translation or camera distance changes.

Required landmarks need finite coordinates and visibility ≥0.65. Missing confidence is unavailable, not automatically high confidence. Front-view gating requires useful shoulder and hip span, approximately level shoulders, and no large lateral torso lean. These checks reject obvious poor views; they cannot certify a frontal camera from 2D alone.

### Knee alignment

Each knee is evaluated independently. Interpolate the hip–ankle line at the knee's image y-coordinate, measure the knee's medial deviation from that line, and divide by torso length. Inward direction is toward the opposite hip, so mirroring does not reverse the rule. The seeded threshold is 0.05 torso lengths, with 300 ms persistence.

This measures a **frontal-plane alignment proxy**, not true knee tracking over a rotated foot. It is not a turnout, joint-load, medical or teaching assessment. Perspective, deep bends, loose clothing, occlusion, leg crossing and out-of-plane movement can invalidate it. Manual Demi-plié context does not classify movement phase. Teachers should review the video rather than treat a flag as a verdict.

### Shoulder elevation

Measure ear-to-shoulder distance divided by torso length on both sides. Require 1.5 seconds and at least 12 consecutive stable observations (range ≤0.08 torso lengths per side) to capture median relaxed baseline distances. A distance reduction beyond the seeded 0.08 threshold is a candidate elevation; the seeded persistence is 400 ms.

The user must begin relaxed, facing forward, with visible ears. An already raised baseline cannot reveal sustained elevation. Head nodding, head turns, camera perspective and anatomy remain confounders; large ear-height differences are rejected but not every head movement can be distinguished from shoulder movement. Baseline is recording-scoped and resets with a new analysis.

### Heel lift: intentionally unavailable

No heel-lift rule is enabled. Frontal 2D heel/toe landmarks do not defensibly establish floor contact or separate heel rise from rotation/perspective. Existing database metadata remains a candidate rather than being silently deleted. `supportsRule` exposes only knee alignment and shoulder elevation, and the video UI explains the distinction. The existing curriculum count of 3 detector metadata records remains unchanged.

## Temporal behavior and taxonomy

One filter per correction ID and side implements candidate → active → cleared. Activation requires both persistence duration and a minimum of three frames. Recovery requires 400 ms plus three frames. A single noisy frame cannot start or clear an alert. Uncertain tracking immediately closes the last observed interval as tracking-lost; a >350 ms gap likewise cannot accumulate persistence. EOF/cancellation use the last analyzed timestamp, never inventing analysis through an unobserved tail.

Each event contains correction ID, rule, side, start/confirmation/end timestamps and end reason. There is one event per sustained side-specific interval. IDs resolve against the existing curriculum DTO, so voice and video display exactly the same error name, cue and correction text. Engine source contains no correction prose. Timeline buttons seek to event start; active intervals highlight resolved correction cards. Unmeasurable/no-event periods are not called “alignment OK”.

## Verification

2026-10-01, Node 22.23.3, pnpm 10.28.0, macOS ARM64, Chromium browser and an isolated local PostgreSQL/pgvector database.

- Dependency installation, typecheck, ESLint and formatting check passed.
- **138 tests passed**, including real PostgreSQL and real E5 tests from Phase 2; no skips in this verification run. Tests cover geometry/aspect ratio/mirroring, independent knees, shoulder baseline, missing visibility, configuration rejection, persistence/clear intervals, tracking gaps, duplicate suppression, cancellation, model/worker failure and overlay scaling.
- Production API and Next.js builds passed; the compiled production worker was also exercised in Chromium.
- Browser curriculum still shows the seeded 3/29 metadata coverage and correction records. Typed “knees in during plie” still retrieves “Knees over toes”.
- `/video` loads only Demi-plié and Port de bras from actual curriculum data. Corrupt WebM input shows an explicit decode error. Stop during model initialization shows cancellation. Reset/replacement discards local analysis. Blocking the actual worker model download produced the expected model-unavailable UI error, with no unhandled runtime exception.
- No real ballet video was present in the repository or supplied attachment. **No real movement accuracy, sensitivity, calibration robustness or false-positive rate has been validated.** Synthetic fixtures validate deterministic behavior, not real dancer performance.
- A browser-generated **blank diagnostic WebM**, clearly labeled as having no person, exercised actual file decoding, worker initialization and MediaPipe inference. It generated no detector events and displayed “No person detected”. This is a plumbing/performance check, not a ballet demonstration.

### Measured diagnostic performance

A 640×360, approximately 2.1-second blank clip produced 22 analyzed frames at 10 Hz media time. One observed run processed **53.2 frames/s**, with **14.8 ms mean inference** and **0.08 ms mean detector evaluation**, excluding model download/initialization. The compiled production worker measured 59.1 frames/s, 13.1 ms mean inference and 0.06 ms mean detector evaluation on a subsequent run. No person was measurable and zero events were generated. Dancer footage, longer clips and slower devices may perform differently; these figures are not a real-pose benchmark. The UI displays counts, elapsed-throughput FPS, mean inference/detector times and event count for each run.

### Privacy and network inspection

The file is used only through a local blob URL and decoded `ImageBitmap` transfers between browser threads. No video/frame endpoint, form upload, server storage or media-content logging was added.

A Chrome DevTools Protocol audit attached to **both page and worker** targets. Initial testing revealed the new MediaPipe runtime's `odml.pa.googleapis.com/v1/log` telemetry POST. Google's [repository documentation](https://github.com/google-ai-edge/mediapipe) describes usage/performance metrics separately from input data. The application now applies a worker-script CSP permitting same-origin and the pinned WASM/model asset paths; telemetry is excluded. The repeat inference audit recorded only GETs for scripts/WASM/model, **zero non-GET requests and zero runtime exceptions**. Hosting must preserve the worker response CSP. The policy is not installed on page documents, so existing typed-search POST and voice WebSocket traffic are unaffected.

## Remaining work

Phase 3 movement validation still needs suitable consented ballet footage: front/oblique views, diverse body proportions, relaxed/raised shoulder baselines, occlusions, clothing, lighting, camera movement, and sustained/noisy knee conditions. Thresholds may need tuning or a rule may need to be disabled after evaluation.

Phase 4 remains entirely unimplemented: camera permission/capture, live frame scheduling, pause/resume and dropped-frame lifecycle, reusing this same worker adapter and pose pipeline. No Render embedding-memory work was attempted.
