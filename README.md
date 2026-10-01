# musical-goggles · AI Classroom

A focused technical prototype: **one structured ballet correction taxonomy powering three input modes** — voice questions, uploaded video and live camera. All three resolve to the **same correction records**.

> **Status: Phase 1 (foundation).** Monorepo, schema, seed, API, classroom + curriculum UI. Voice, video and camera screens are honest placeholders until their phases land. Nothing is mocked.

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

### Deepgram setup (Phase 2)

Create an API key at console.deepgram.com and set `DEEPGRAM_API_KEY` in the **API** environment only. Not used yet.

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

`GET /health` → `{"status":"ok"}` · `GET /health/ready` · `GET /curriculum` · `GET /exercises/:slug`. Details in the architecture doc.

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
2. Voice + Deepgram + hybrid retrieval (pgvector + tsvector, RRF)
3. Uploaded video + MediaPipe + detector engine + debounced events
4. Live webcam on the same pose engine
5. Admin CRUD + UI polish + latency/debug panel
6. Vercel + Render + Supabase deployment, end-to-end verification
