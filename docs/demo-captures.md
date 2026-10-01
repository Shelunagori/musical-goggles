# Product demo capture notes

Captured 2026-10-01 from commit `d70b897` using the actual premium UI at a 1440 × 1000 desktop viewport. No mock screens, patched DOM, intercepted API responses, invented transcripts or fabricated detections. No application analysis/retrieval code was changed.

## Assets

All files are under `apps/web/public/demo/`. Sizes use decimal MB.

| File                    | Duration    | Size    |
| ----------------------- | ----------- | ------- |
| `video-demo-poster.jpg` | Still       | 0.11 MB |
| `video-demo.gif`        | 00:00:14.60 | 5.48 MB |
| `video-demo.mp4`        | 00:00:14.56 | 1.52 MB |
| `voice-demo-poster.jpg` | Still       | 0.11 MB |
| `voice-demo.gif`        | 00:00:09.01 | 2.13 MB |
| `voice-demo.mp4`        | 00:00:08.96 | 0.32 MB |

MP4: H.264, yuv420p, 25 fps, 1440 × 1000, fast-start, silent. Voice GIF: 1100 × 764 at 12 fps. Video GIF: 1000 × 694 at 10 fps. GIFs use a generated 128-color palette and ordered dithering. Posters are frames extracted from the recordings, not generated images. `/review` uses the smaller MP4s with native pause/fullscreen controls and `preload="none"`; it does not force autoplay. README uses GIFs and relative MP4 links.

## Voice: prerecorded speech, real STT

The query was “Common mistake in demi plié.” macOS Samantha speech synthesis produced a temporary WAV with leading/trailing silence. Chromium's file-backed test audio input supplied that WAV to the app's normal getUserMedia/MediaRecorder path. It was not a human speaking into a physical microphone, and the video is explicitly described as prerecorded speech.

Actual flow: browser audio → WebSocket → local Fastify API → Deepgram Nova-3 → final transcript “Common mistake in demi-plié.” → deterministic normalizer → local PostgreSQL full-text retrieval → actual correction cards. One results response was observed; no transcript or search response was mocked. The API key stayed server-side. This take used FTS, not semantic retrieval. The recorder ends on the actual Result state, then the browser context closes and releases audio resources. The silent exported video does not contain an audio track.

Only browser loading time was trimmed; the remaining voice interaction plays at normal speed. Physical microphone usability and live webcam capture were not verified by this recording. The typed fallback was not needed.

## Video: original supplied clip, actual geometric events

Source: `8462204-uhd_2160_4096_25fps.mp4`, 36.96 seconds, 2160 × 4096, 25 fps, about 58 MB. The original file was selected directly in `/video` with Demi-plié chosen manually. It was not copied into the repository or sent to the API. The clip contains varied movement and camera angles; the exercise label is context supplied by the user, not movement classification.

The take shows selection/preview, start, real MediaPipe overlay, completion, timeline, seeking to an actual event and diagnostics. The full source was processed: 370 sampled frames, 50 measurable frames, two left knee-alignment events at 1.5–2.6 s and 9.7–10.4 s. Both intervals ended with tracking lost. Selecting the first event displayed the real taxonomy cue “Knees over toes.” These events are experimental geometric signals, **not a reliable ballet-technique conclusion about this dancer**. Unsupported-angle/visibility states remain visible in the recording.

The approximately 37.5-second analysis portion is accelerated to 4.3 seconds (about 8.7×) to meet the requested short-demo duration. Preview and result interactions remain at normal speed. This is not a speed benchmark. Network observation during the video take contained GET requests only (curriculum/model/runtime/local blob reads), no uploaded video/frame, and no browser runtime exceptions. The deliberately published screen recording includes rendered frames; that does not change the app's local-processing privacy boundary.

## Capture and conversion

Playwright 1.63.0 recorded viewport-only WebM from a clean Chromium context, without browser chrome or DevTools. The existing local PostgreSQL seed, production-built frontend and real API were used. E5 was disabled for these captures. Temporary raw recordings, generated speech and capture tools stayed outside the repository under `/tmp`.

For prerecorded speech, Chromium launched with `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream` and `--use-file-for-fake-audio-capture=<temporary WAV>`. These supply a test audio device; they do not fake the API/STT output. Video capture used no fake camera device.

FFmpeg trimmed/retimed the real recordings, encoded H.264 (`-crf 21 -preset slow -pix_fmt yuv420p -movflags +faststart`), and generated optimized GIFs with `fps`, Lanczos scaling, `palettegen=stats_mode=diff:max_colors=128` and `paletteuse=dither=bayer:diff_mode=rectangle`. No source clip or raw capture is included in the repo. Playwright saves completed recordings when its browser context closes ([recording documentation](https://playwright.dev/docs/videos)).

## Verification and limits

Typecheck, lint, format check, all 202 tests (including enabled database/E5 checks) and production builds passed. A pre-existing quote/whitespace formatting issue in the root layout was corrected without changing its metadata. The production-built review page served all six assets with HTTP 200 and the correct media types. Both MP4s played with advancing playback time and native controls; both GIFs decoded in Chromium. Review layouts at 1440, 390 and 320 px had no horizontal overflow or browser runtime exceptions.

Both GIFs and MP4s decoded completely with FFmpeg; poster images decoded. README paths resolve to the generated files using GitHub-compatible relative paths. Remote GitHub rendering will only be available after a future commit/push. The supplied frontend returned HTTP 200 and the public API `/health` returned `{"status":"ok"}`; this does not verify deployed end-to-end behavior. No deployment was performed.

Live camera/admin recordings were optional and were not created. No physical webcam footage was captured. These assets demonstrate actual prototype behavior and its current limitations, not validated ballet coaching.
