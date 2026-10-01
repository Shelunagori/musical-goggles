# musical-goggles · AI Classroom

A focused technical prototype: **one structured ballet correction taxonomy powering three input modes** — voice questions, uploaded video and live camera. All three resolve to the **same correction records**.

> **Status: Phase 4 implemented.** Voice/typed retrieval, local uploaded-video analysis and live camera share one correction taxonomy and one pose pipeline. Real webcam capture is blocked by permissions in the verification environment; geometric detectors still need validation on real ballet movement. See [Phase 4 verification](docs/phase4-verification.md).

## What this demo proves (and what it doesn't)

- **Proves:** a single taxonomy record (`demi_plie / knees_inward → "Knees over toes"`) can be _retrieved_ by voice and _detected_ by pose analysis without duplicating correction definitions.
- **Does not claim** general ballet technique correction. Only a handful of errors are plausibly observable from 2D landmarks; every other correction has `detector = null` and the UI says so (**Camera-detectable corrections: 3 / 29**).
- **Seed content is DEMO DATA** — generic public ballet terminology, not the musical-goggles proprietary curriculum.

## Architecture

```
apps/web            Next.js 16 + React 19 + Tailwind v4 (Vercel)
apps/api            Fastify 5 + node-postgres (Render) — the only backend
packages/taxonomy   detector contract + domain vocabulary
packages/shared     API contract (zod) shared by web and api
packages/pose-engine  pose geometry + rule contract (video & camera share it)
supabase/           migrations + seed.sql (Postgres + pgvector + full-text)
```

Full design, data model, search strategy and decisions: **[docs/architecture.md](docs/architecture.md)**.

## Local setup

Requirements: Node ≥ 22, pnpm 10 (`corepack enable`), a Postgres 15+ with **pgvector ≥ 0.5** and **unaccent** (Supabase has both).

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env          # set DATABASE_URL
cp apps/web/.env.example apps/web/.env.local    # NEXT_PUBLIC_API_URL
pnpm db:migrate
pnpm db:seed
pnpm dev          # api on :4000, web on :3000
```

Local Postgres alternative (Docker): `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16` then `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres`.

### Supabase setup

1. Create a project. Extensions `vector` and `unaccent` are created by the migration (in the `extensions` schema).
2. **Project Settings → Database → Connection string → Session pooler** (IPv4, port 5432). Put it in `apps/api/.env` as `DATABASE_URL`.
3. `pnpm db:migrate && pnpm db:seed` from your machine. (Or `supabase db push` — migration filenames follow the Supabase CLI convention.)
4. TLS is automatic for non-local hosts. Optionally set `DATABASE_SSL_CA` to the project CA to verify the certificate.
5. RLS is enabled with no policies: the anon key can read nothing. Only the API (server credentials) reads the DB.

### Voice and retrieval setup (Phase 2)

Set `DEEPGRAM_API_KEY` in the **API** environment only. Open `/voice`, allow microphone access, and speak in English, German or French. HTTPS (or localhost) is required for microphone access. “Type instead” uses `POST /search` and works without Deepgram.

FTS is enabled without a model. Optional E5 embeddings:

```bash
EMBEDDING_ALLOW_DOWNLOAD=true pnpm db:embed
# Set EMBEDDING_ENABLED=true in apps/api/.env, then restart the API.
# Re-running db:embed only processes NULL embeddings.
pnpm --filter @mg/api embedding:measure
```

API requests only load an already cached model; model downloads are explicit CLI work. `EMBEDDING_ALLOW_DOWNLOAD=true` can also be used with `embedding:measure`. Inference uses q8 multilingual-e5-small with 384 dimensions, E5 prefixes, mean pooling and L2 normalization. Model failure degrades to FTS. `SEARCH_DEBUG=true` exposes per-result ranks; leave it false normally.

**Memory:** a real local q8 query reached ~620 MiB RSS on macOS ARM64. This is not a Render Linux measurement and does not establish free-tier suitability. Embeddings therefore default to **disabled**. Keep FTS on Render free until a target-host measurement supports local inference, or implement another `EmbeddingProvider` with the same corpus/query model identity. Never mix embedding spaces.

For real database and E5 integration tests after migrations, seed and backfill:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/goggles TEST_E5=true pnpm test
```

Use a disposable test database. Without `TEST_DATABASE_URL`, database tests are explicitly skipped; without `TEST_E5=true`, real-model tests are skipped.

## Local uploaded-video analysis (Phase 3)

Open `/video`, choose Demi-plié or Port de bras, select a local file and start analysis. Use a single dancer, a fixed level camera facing the dancer, and clear views of the required joints. Port de bras needs an initial **1.5 seconds of still, relaxed shoulders** for calibration. MP4/H.264 and WebM depend on browser codec support; clips are limited to five minutes.

The video stays in a browser blob URL. A worker downloads the pinned MediaPipe Tasks Vision runtime and Lite model, samples decoded frames at 10 Hz, then runs the shared pose engine. Nothing uploads the video or frames. Worker-response CSP allows model assets and blocks MediaPipe telemetry. Keep the configured `_next/static` response headers when hosting the app.

Knee alignment and calibrated shoulder elevation are experimental 2D heuristics. Heel lift remains unavailable in the video engine; its existing taxonomy metadata is retained as a candidate, so the curriculum's metadata count of 3 is **not** a count of implemented video rules. The video selector only offers exercises with an implemented rule. No automatic classifier or ballet score is included.

A completed analysis shows sustained-event intervals; click one to seek the player. Low visibility and missing poses are not called “alignment OK”. Reset or select another file to discard local results. Offline/model-download failures appear as errors. See [detector assumptions and verification](docs/phase3-verification.md).

## Live camera analysis (Phase 4)

Open `/live`, choose an available exercise and press **Start camera**. HTTPS or localhost and camera permission are required. Only exercises with implemented detectors are offered; their names and correction cards come from the same API records as voice and video. The preview is unmirrored so skeleton coordinates match it.

Webcam frames use the same MediaPipe worker, adapter, pose engine, temporal filters and calibration as uploaded video. Sampling targets 10 Hz with one frame in flight. Shoulder checks need 1.5 seconds of stable, relaxed posture; calibration times out after 30 seconds. Knee checks need no baseline. Low visibility does not mean alignment is correct.

**Stop camera**, leaving the page, hiding the tab or an interrupted stream releases camera tracks and the worker. Restart to acquire the current default camera and a fresh baseline. Sessions are limited to ten minutes to bound event history; no video is recorded or stored. Technical details show cadence, inference/evaluation timings and visibility. See [verification and limitations](docs/phase4-verification.md).

## Scripts

| Command                                              | What                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | API (tsx watch) + web (next dev)                                                                                     |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | strict TS, ESLint (typescript-eslint strict + Next + hooks), Prettier                                                |
| `pnpm test`                                          | Vitest in every package. API DB tests run when `TEST_DATABASE_URL` is set, otherwise they are skipped with a warning |
| `pnpm build`                                         | tsup bundle for API, `next build` for web                                                                            |
| `pnpm check`                                         | all of the above                                                                                                     |
| `pnpm db:migrate` / `db:seed`                        | apply `supabase/migrations/*.sql` / load DEMO DATA (both idempotent)                                                 |
| `pnpm db:reset`                                      | drop project tables — refuses non-local databases unless `ALLOW_DB_RESET=true`                                       |

## API

`POST /search` · WebSocket `/voice` · `GET /health` → `{"status":"ok"}` · `GET /health/ready` · `GET /curriculum` · `GET /exercises/:slug`. Details in the architecture doc.

## Deployment (Phase 6)

- **Web → Vercel:** root directory `apps/web`, env `NEXT_PUBLIC_API_URL=https://<api>.onrender.com`.
- **API → Render (free web service):** build `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @mg/api build`, start `node apps/api/dist/server.js`, health check `/health`, env `DATABASE_URL`, `CORS_ORIGINS=https://<web>.vercel.app`, `NODE_ENV=production`. Migrations: `node apps/api/dist/migrate.js`.
- **DB → Supabase**, **pose → browser**, **STT → Deepgram**. No Redis/queues/K8s.
- Render free instances sleep; the first request can take ~30–60 s. The UI shows a "waking up" state rather than failing.

## Known computer-vision limitations

Single-camera 2D landmarks cannot reliably judge hip turnout, rotation, weight placement, pointe/foot articulation, épaulement or artistry. Those corrections stay `detector = null`. Even the three seeded candidates (knee alignment, heel lift, shoulder elevation) are **candidates** until validated on real footage in Phase 3; any that prove unreliable revert to `null`.

## Privacy decisions

- MediaPipe runs **in the browser**. Uploaded video and webcam frames are **not** sent to our backend.
- Audio (Phase 2) goes to Deepgram for transcription only; our API does not store or log audio.
- No credentials in the browser bundle — only `NEXT_PUBLIC_API_URL`.
- No child data is needed for this demo.

## Roadmap

1. ✅ Foundation
2. ✅ Voice + Deepgram adapter + hybrid retrieval (live STT verification requires credentials)
3. ✅ Uploaded video + browser MediaPipe + deterministic detectors and event intervals (real ballet validation outstanding)
4. ✅ Live webcam on the same pose engine (actual webcam verification blocked by camera permission)
5. Admin CRUD + UI polish + latency/debug panel
6. Vercel + Render + Supabase deployment, end-to-end verification
