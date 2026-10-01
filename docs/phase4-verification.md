# Phase 4 — live camera verification

Verified locally on 2026-10-01, macOS ARM64, Node 22.23.3, pnpm 10.28.0, Chromium automation, production Next.js build and Fastify API. Phase 3 baseline commit: `5588136`. Phase 5 was not started.

## Scope and changed files

- `apps/web/src/components/LiveClassroom.tsx`: classroom camera controls, DB-backed exercise selector and correction cards, preview/overlay, calibration instructions, error/status display, collapsed metrics.
- `apps/web/src/app/live/page.tsx`: replaces the placeholder with the live classroom.
- `apps/web/src/app/page.tsx`: marks live camera available.
- `apps/web/src/lib/pose/live-camera.ts`: camera ownership, lifecycle, bounded waits, 10 Hz scheduling, metrics and calibration deadline.
- `apps/web/src/lib/pose/live-view.ts`: deduplicated active-event → taxonomy lookup and visibility messages.
- `apps/web/src/lib/pose/capture-frame.ts` and `video-analysis.ts`: extract the existing maximum-960-pixel bitmap capture so video and camera use the same input sizing.
- `apps/web/src/lib/pose/live-camera.test.ts`: 20 camera/lifecycle/integration tests.
- `README.md`, `docs/architecture.md`, this report: usage, architecture and verification limits.

No new dependency, API route, database migration, classifier, detector, voice/search/embedding change, or second MediaPipe implementation. `pose.worker.ts`, the adapter, `PosePipeline`, rules, temporal filters, calibration and CSP configuration are unchanged.

## States, ownership and detection

`idle → requesting → loading_model → calibrating (shoulders) → analyzing`; cancellation ends in `stopped`, failures in `error`. Knee checks skip calibration. The browser's current default camera is requested with audio disabled. Stop/start is the supported device-switching path.

Each session owns one stream, one worker, one in-flight frame and one scheduling timer. Stop, pagehide, unmount, hidden tab, stream ended/mute and errors release tracks, terminate the worker, detach listeners and cancel timers. Pending permission responses are guarded: streams granted after stop/timeout are immediately stopped. Permission wait is limited to 60 seconds, preview play to 10 seconds, worker loading to the existing 90 seconds and worker frames to the existing 20 seconds.

Camera timestamps are monotonic session times. Scheduling targets 100 ms slots and skips overdue slots or duplicate camera timestamps. The latest UI sample clears after 350 ms without a new result; five seconds without new camera frames produces an error. Sessions stop after ten minutes to bound the existing engine's event history. The UI retains only the latest frame and scalar metrics, without recordings or landmark history.

The same engine requires 1.5 seconds / at least 12 stable shoulder observations before its baseline is ready. A 30-second live calibration deadline produces instructions to reposition and restart. Knee alignment needs no baseline. Both supported exercises are selected from API records with valid, implemented detector metadata. Heel lift remains unavailable.

Only sustained, open temporal events produce correction cards. Events resolve to the selected exercise's existing correction IDs and are deduplicated across sides. Cue and correction text come from the database DTOs. Raw violations do not produce per-frame alerts; clearing and tracking-loss behavior remain the Phase 3 temporal rules. Missing poses/visibility never claim correct alignment.

## Automated checks

Passed:

- `pnpm install --frozen-lockfile` (no dependency/lockfile change).
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- `TEST_DATABASE_URL=… TEST_E5=true pnpm test`: **158 tests**, no skips; includes real PostgreSQL/pgvector and cached multilingual E5 integration tests.
- `NEXT_PUBLIC_API_URL=http://localhost:4100 pnpm build`: API and web production builds.

New tests cover state transitions, permission/error mapping, repeated and duplicate starts, timer/listener/track/worker cleanup, late permissions, bitmap cancellation, hidden tab/page exit, ended/muted streams, missing detectors, model/worker failure, one in-flight frame, stale/frozen preview, session duration, calibration success/reset/timeout, and stable deduplicated taxonomy cards. Only browser/MediaPipe boundaries are substituted; the real `PosePipeline`, geometry and temporal filters process synthetic landmarks in these tests.

## Browser and regression checks

Production API on port 4100 and web on 3100 were started for verification.

- `/live` renders the preview, controls, privacy notice and collapsed details without hydration errors. Its selector contains only Demi-plié and Port de bras from the real curriculum.
- The browser enumerates one video input, but actual `getUserMedia` returns permission denied, including after a scoped camera permission grant for localhost. The page displays the actionable error and permits retry. **Actual webcam capture, real skeleton overlay and real-person stable corrections were not verified.** No camera frames were recorded or saved.
- `/curriculum` renders all 9 exercises / 29 corrections, with the existing 3 metadata candidates (two implemented pose rules).
- `/voice` renders and its typed fallback posts to the real API. `knees in during plie` displays “Knees over toes” from the database. All five representative Phase 2 queries returned HTTP 200 with relevant exercise/correction records; German shoulders resolves to the same shoulder correction.
- Voice microphone/STT remains unverified: no Deepgram key is available. Voice UI and retrieval tests pass; voice implementation was not changed.
- `/video` processes a clearly labeled synthetic blank 2.1-second WebM with the real MediaPipe model: 22 frames, zero detections, explicit no-person message, no runtime exceptions. This is a pipeline regression, not ballet validation.
- Home navigation displays the live camera mode as available.

## Synthetic stream performance and lifecycle diagnostic

Because actual camera capture is blocked, the verification browser's `getUserMedia` boundary was temporarily replaced with a **labeled blank 640×360 canvas stream**. Production UI, worker, MediaPipe model and pose engine were unchanged. The substitution existed only in the test browser and was restored afterward; it is not shipped. These measurements are **not real webcam or dancer measurements**.

Three ten-second runs, excluding model initialization:

| Cycle | Processed frames | Processing FPS | Mean inference | Mean detector evaluation | Skipped slots |
| ----- | ---------------: | -------------: | -------------: | -----------------------: | ------------: |
| 1     |              101 |           10.1 |        19.9 ms |                  0.06 ms |             0 |
| 2     |              101 |           10.1 |        21.3 ms |                  0.06 ms |             0 |
| 3     |              101 |           10.1 |        22.4 ms |                  0.06 ms |             0 |

Each run had exactly one worker; each stop left **zero workers**, all tracks `ended`, and `video.srcObject === null`. No-person status and zero active corrections were correct for the blank source. An earlier three-cycle cleanup diagnostic also left zero workers/tracks active.

Post-stop page JS heap after explicit garbage collection was 3,968,564 → 3,996,368 → 4,040,564 bytes (~3.78 → 3.85 MiB). Active worker JS heap was ~4.70 MiB and reported backing storage ~11.85 MiB. The small page-heap rise is not proof of a leak or proof of leak freedom; this short sample includes browser/framework bookkeeping. CDP heap figures do **not** measure complete browser/process/GPU/WASM resident memory. Longer real-camera sessions and total process memory measurements remain outstanding.

For comparison, the uploaded blank-video regression in this phase measured 58.1 processing FPS, 13.5 ms inference and 0.05 ms detector evaluation (Phase 3's prior production measurement: 59.1 FPS / 13.1 ms / 0.06 ms). Uploaded video runs through decoded samples as quickly as possible; live sampling intentionally waits for real-time slots. Model/input/system conditions differ, so this is only a rough comparison.

## Privacy and network evidence

CDP observed the page **and child workers**, not only page-level fetches, during synthetic live cycles and uploaded-video regression. Live runs issued only GETs for local worker chunks, pinned MediaPipe WASM/runtime and the Lite model. There were **no POSTs or media/frame uploads and no runtime exceptions** in the diagnostic. Browser console checks were clean.

The actual production worker script response retained `connect-src 'self'` plus only the pinned jsDelivr WASM and Google Storage model paths. The MediaPipe telemetry destination is outside this allowlist. This preserves Phase 3's telemetry blocking; it must be retained when hosting. No backend endpoints accept camera frames; the live wrapper neither encodes, stores nor logs them. Only curriculum DTOs come from the API.

The network observation applies to the diagnostic input. Real-camera network behavior could not be directly observed due to permission denial, though it uses the identical production pipeline.

## Remaining work

Real webcam permission/capture verification on an accessible device; actual single-dancer skeleton/correction/calibration checks; longer session memory measurements; detector validation against ballet movement remain outstanding verification work. Phase 5's admin CRUD and UI polish are untouched. Deployment remains a later phase. No commit or push was made for this implementation.
