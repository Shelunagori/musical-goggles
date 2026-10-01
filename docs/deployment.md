# Phase 6 deployment runbook

This deploys the existing demo. It adds no hosted embedding provider, media upload service, or new product features. Public deployment is pending target account/service selection; see [observed verification](phase6-verification.md).

## 1. Database: Supabase

Use a **dedicated demo project**, not another application's database. Obtain the Session pooler URI (IPv4, port 5432) from the project's Connect panel. The persistent Render API and migration runner can use it. Do not use the transaction pooler for migrations: the existing runner uses a session advisory lock. Copy the actual host/username from Supabase, URL-encode password characters, and omit `sslmode`/`sslcert`/`sslrootcert` URI options so they do not override the explicit `pg` SSL configuration. Set `DATABASE_SSL=require`; set `DATABASE_SSL_CA` to the project's PEM CA for verified TLS. Without CA the existing client encrypts transport but does not authenticate the certificate chain.

From the repository root, on a machine that can reach Supabase:

```sh
corepack enable
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
# Edit the ignored apps/api/.env with the demo DATABASE_URL, DATABASE_SSL=require
# and DATABASE_SSL_CA. Do not paste real secrets into commands or commit them.
pnpm db:migrate
pnpm db:seed
pnpm db:verify --baseline
```

Use the repository runner consistently. It records migrations in `public.schema_migrations`; do not mix it with `supabase db push` (which tracks a different migration ledger). If the schema was already applied with the Supabase CLI, reconcile history first rather than blindly reapplying. Never use `db:reset` on the deployed demo. Seed is an upsert and can overwrite edits to seeded entries: use it for initial setup only.

`db:verify` is read-only. It checks vector/unaccent in `extensions`, vector(384), GIN/HNSW indexes, enabled search/update triggers, RLS with no taxonomy policies, valid detector metadata, and populated search documents. `--baseline` also requires 9 exercises, 29 corrections, 3 metadata-bearing corrections. The existing normalizer keeps body/error aliases in code; there is no `term_aliases` table. After intentional curriculum edits, omit `--baseline`.

If this environment cannot connect, run exactly these commands locally and retain the verification output. A connector listing projects is not proof of SQL connectivity or migrations applied. Never put DB credentials or Supabase service-role keys in Vercel/browser configuration.

## 2. API: Render free web service

Use the repository-root `render.yaml` as a Blueprint, or copy its settings into an existing service after checking the target. It explicitly selects the free plan and disables automatic deployment. It does not create a paid database, run migrations on startup, or enable E5.

- Root directory: repository root, not `apps/api` (workspace packages and SQL must remain available).
- Node: 22.23.3; pnpm: packageManager-pinned 10.28.0 via Corepack.
- Build: `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm --filter @mg/api build`
- Start: `node apps/api/dist/server.js`
- Health check: `/health` (DB-independent liveness).
- Readiness: `/health/ready` checks the required curriculum tables/columns and access. An empty but migrated curriculum is ready; `db:verify --baseline` separately checks seed data.
- `HOST=0.0.0.0`; let Render inject `PORT`.

| API variable               | Demo value / source                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | `production`                                                                                             |
| `DATABASE_URL`             | Supabase session pooler secret                                                                           |
| `DATABASE_SSL`             | `require`                                                                                                |
| `DATABASE_SSL_CA`          | Project CA PEM, recommended for certificate verification                                                 |
| `DATABASE_POOL_MAX`        | `5`                                                                                                      |
| `CORS_ORIGINS`             | Exact stable Vercel HTTPS origin, no trailing slash; comma-separated if necessary                        |
| `ADMIN_API_TOKEN`          | Random 32–256 character secret; Blueprint generates one, or generate locally with `openssl rand -hex 32` |
| `DEEPGRAM_API_KEY`         | Optional server-only Deepgram key; absent means typed retrieval only                                     |
| `EMBEDDING_ENABLED`        | `false`                                                                                                  |
| `EMBEDDING_ALLOW_DOWNLOAD` | `false`                                                                                                  |
| `SEARCH_DEBUG`             | `false`                                                                                                  |
| `LOG_LEVEL`                | `info`                                                                                                   |

Run migrations/seed from the connected local machine before testing readiness. Compiled CLI equivalents after API build: `node apps/api/dist/migrate.js`, `node apps/api/dist/seed.js`, `node apps/api/dist/verify-db.js --baseline` with real environment variables injected. Production intentionally does not load `.env`.

Render accepts HTTP and WebSocket traffic on the same injected port. Public clients use `https://<actual-api-host>` and `wss://<actual-api-host>/voice`. Do not invent a URL before Render assigns it. SIGTERM closes Fastify/WebSockets then the DB pool. Existing sessions do not survive deployments; users restart recording/camera as appropriate. Free services can sleep and take about a minute to wake; load curriculum or use typed search first. Voice has a 20-second connection timeout and offers retry/typed fallback rather than claiming successful STT during a cold start.

## 3. Frontend: Vercel

Import the monorepo into the intended Vercel account:

1. Framework: Next.js; Root Directory: `apps/web`.
2. Include source files outside the Root Directory so `packages/*` are available.
3. Node 22.x; install command `pnpm install --frozen-lockfile`; build command `pnpm build` from `apps/web`; leave the Next.js output directory default.
4. Set **only** `NEXT_PUBLIC_API_URL=https://<actual-api-host>` for Production (and Preview only if previews are intentionally permitted by API CORS).
5. Deploy, record the stable Vercel origin, then set that exact origin in Render `CORS_ORIGINS` and restart/redeploy the API.

The public API origin is baked in at build time. Changing it requires a frontend rebuild. Missing/invalid production configuration fails rather than silently targeting localhost. Local production smoke builds can explicitly set `NEXT_PUBLIC_API_URL=http://localhost:4100`.

Do not set `DATABASE_URL`, `DEEPGRAM_API_KEY`, `ADMIN_API_TOKEN`, or Supabase service credentials on the frontend. Admin users enter the token interactively; it remains in memory and goes only to the API's Authorization header. Lock/reload clears it. No token cookies or localStorage.

HTTP CORS grants only configured origins, never `*`. A disallowed origin receives no allow-origin header; CORS is not authentication. WebSocket upgrades explicitly reject a mismatched browser Origin with 403. Non-browser clients without Origin remain allowed as before; the public search/STT endpoint is a demo, not a per-user authenticated/quota-controlled service. Add only specific preview origins if needed; do not allow every `*.vercel.app` site. Local development uses `http://localhost:3000` separately.

## 4. Browser assets, permissions and privacy

The worker uses Next's bundled `new Worker(new URL(..., import.meta.url))` path. Keep `next.config.ts` response headers on `/_next/static/*`: the worker's CSP allows only same-origin, the pinned jsDelivr Tasks Vision 1.0.1 WASM directory, and the pinned Google Storage Lite model directory. It blocks telemetry destinations. These assets require internet access; a download failure is shown as an error. No path or pose-engine changes are needed for Vercel.

There is no strict document-wide CSP in this demo; the existing targeted worker CSP is intentional and must be verified on the actual worker response after deployment. Permissions-Policy restricts camera/microphone to self and disables geolocation. HTTPS provides a secure context but cannot override host/browser permission denial.

Video files use local blob URLs; webcam frames and detector events remain local. Voice audio passes through Render to Deepgram when configured. The API does not store or log raw audio, frames, videos, admin credentials or query bodies. Request IDs, route templates, duration, safe error codes and search timings are logged. Browser production source maps are not enabled; API source maps remain server-side.

## 5. Search mode

Initial intended deployment: **FTS-only** (`EMBEDDING_ENABLED=false`). The UI says Full-text retrieval and `/search` returns `mode: "fts"`. Existing DB vectors do not activate semantic query inference. The q8 E5 local measurement was about 620 MiB RSS; Render free is documented at 512 MB, so do not enable local inference without target-host evidence. No memory-safe hosted provider is currently implemented/configurable. The `EmbeddingProvider` interface and vector(384) remain unchanged for future work; do not mix embedding spaces. Backfill stays an explicit operation on a suitable machine.

## 6. Deployment acceptance checks

Set public non-secret URLs in your shell, then run:

```sh
export API_URL='https://<actual-api-host>'
export WEB_URL='https://<actual-web-host>'
curl --fail-with-body "$API_URL/health"
curl --fail-with-body "$API_URL/health/ready"
curl --fail-with-body "$API_URL/curriculum"
curl --fail-with-body -H 'Content-Type: application/json' \
  --data '{"query":"Schultern beim port de bras"}' "$API_URL/search"
curl -i -X OPTIONS -H "Origin: $WEB_URL" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type' "$API_URL/admin/exercises"
curl -i -H 'Origin: https://unlisted.example' "$API_URL/health"
```

Record cold/warm HTTP durations, request IDs, response mode and search metrics; local timings are not production latency. Verify all six routes at desktop and 390 px widths in the order landing → voice/typed → video → live → curriculum → admin.

- Typed queries: `common mistakes in demi plie`, `knees in during plie`, `shoulders in port de bras`, `Schultern beim port de bras`, `heels coming up in plie`.
- Admin: unlock; create a uniquely named temporary exercise/alias/correction; retrieve it immediately; edit cue; retrieve revised cue; delete correction. There is no exercise-delete UI. Remove only the recorded temporary exercise ID afterward via a parameterized SQL delete or the SQL editor with the exact ID and slug, then run `db:verify --baseline`. Do not leave test data or reseed over user edits.
- Voice: with `DEEPGRAM_API_KEY`, speak using a real microphone and verify interim/final messages, suppression of duplicates and correction results over WSS. Without a key, verify `STT_UNAVAILABLE` and typed fallback. Synthetic transcripts are not STT verification.
- Video: use a clearly labeled diagnostic clip if ballet footage is unavailable. Inspect worker/model requests, CSP, skeleton, intervals/seeking, cancellation and absence of media POSTs. A blank clip can verify model loading/no-person handling but cannot validate skeleton accuracy or event intervals.
- Live: attempt actual camera permission/start/stop/restart from HTTPS; verify skeleton/detectors/cards and released tracks. Record permission denial honestly; synthetic landmarks do not verify real webcam capture.
- Security: inspect static chunks/source-map URLs for secret **values** without printing those values. Inspect Network for HTTPS/WSS destinations, Authorization only to the API, no uploaded frames/videos, and blocked worker telemetry. Check API logs for safe metadata only.

## References

Checked against [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Render WebSockets](https://render.com/docs/websocket), [Render free-service limits](https://render.com/docs/free), [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), and [Vercel monorepos](https://vercel.com/docs/monorepos). Recheck platform settings when deploying; no public success is inferred from local checks.
