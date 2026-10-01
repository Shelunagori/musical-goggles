# Phase 6 — deployment preparation and observed verification

Date: 2026-10-01. Starting Phase 5 commit: `9b61320d3812a9992f3a9955c1efe6c29abbcd29` (`feat: add curriculum admin and UI polish`).

**Deployment preparation and local production verification are complete. Public deployment and deployed end-to-end verification are blocked on target access/configuration, not completed.** No Phase 7 work, new product features, paid provider, commit or push was performed.

## Remote status

| Target                 | Actual evidence / remaining requirement                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase               | User identified project name `musical-goggles`. Two connected project-list calls returned only `Shelunagori's Project` (inactive), `ecommerce-ai-ops-agent`, and `careloop`. No reference/SQL connection for `musical-goggles` is available. No unrelated remote DB was modified. Need project URL/reference and session-pooler credentials configured privately. |
| Render                 | No Render connector, CLI, API credential or identified service was available. Free-service Blueprint prepared; no service created or public URL verified.                                                                                                                                                                                                         |
| Vercel                 | Connected `list_teams` returned an empty list; no linked `.vercel` project, CLI login or deployment token found. Need intended account/project access. No frontend deployed.                                                                                                                                                                                      |
| Deepgram               | No key configured locally. Real missing-key WebSocket error verified; no real microphone/STT or deployed WSS test claimed.                                                                                                                                                                                                                                        |
| URLs / deployed search | No verified public demo/API URLs. Intended initial search mode is FTS-only; there is no observed deployed mode or production latency.                                                                                                                                                                                                                             |

The user was asked for the existing Supabase reference (or clarification if it must be created) and hosting targets. Exact local migration and hosting setup instructions are in [deployment.md](deployment.md). Do not substitute another application's Supabase project or invent deployment URLs.

## Audit and changes

Before editing, inspected environment parsing/examples, API/server/pool startup, production web configuration, HTTP CORS, WebSocket URL/origin checks, migration/seed runner, liveness/readiness, token guards, worker paths/model URLs and response headers. The short plan was shared before modifications.

Deployment fixes and preparation:

- Production frontend requires an explicit valid HTTP(S) API origin and rejects credentials, query strings, paths and remote HTTP. HTTPS becomes WSS in the existing voice implementation. Explicit localhost remains available for local production smoke builds.
- Production API requires explicit `CORS_ORIGINS`; malformed origins, paths and wildcards are rejected. Existing exact-origin HTTP CORS and WebSocket rejection behavior remain.
- Readiness now resolves required curriculum tables/columns and permissions instead of merely `select 1`. Empty migrated databases can remain ready; the separate seed audit validates baseline content.
- API error serialization drops raw DB messages/rows/connection strings while retaining safe error codes. Request IDs, route, status and duration remain; typed retrieval now logs mode and timings without query contents. Startup logs expose boolean capabilities only.
- `render.yaml` records the free plan, root workspace build, start/health commands, explicit origins, private DB setting, generated admin credential and disabled E5. No paid dependency or auto-deploy introduced. Blueprint has been reviewed against current documentation, but has not been accepted by Render's authenticated validator.
- Read-only `pnpm db:verify [--baseline]` audits existing schema/seed. No SQL migration, seed or detector contract was changed.
- README/environment reference/architecture and deployment instructions updated.

Changed source/config groups: API `app.ts`, `env.ts`, `server.ts`, `routes/voice.ts` (logging only), `curriculum/repository.ts` (readiness only), `scripts/verify-db.ts`, package/build scripts and deployment/env tests; web `next.config.ts`, `lib/config.ts`, `lib/api-url.ts` and tests; root scripts, `.env.example`, `render.yaml` and docs. Search ranking, EmbeddingProvider, voice protocol/STT adapter, pose-engine, media lifecycle/worker and admin CRUD architecture remain unchanged.

## Local verification

macOS ARM64, Node 22.23.3, pnpm 10.28.0, existing local PostgreSQL/pgvector container on 55432. Built API ran with `NODE_ENV=production`, `HOST=0.0.0.0`, injected `PORT=4100`, explicit localhost origin, temporary test-only admin token and embeddings disabled. Web ran from the production build on 3100.

Passed:

- `pnpm install --frozen-lockfile` (with CI mode and normal cache permissions).
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- `TEST_DATABASE_URL=... TEST_E5=true pnpm test`: **184 passed, zero skipped** (taxonomy 23, shared 12, pose-engine 23, web 45, API 81). Final rerun after logger changes passed.
- `NEXT_PUBLIC_API_URL=http://localhost:4100 pnpm build`: API and all six frontend routes built. Initial sandbox build failed because Turbopack could not bind its internal worker port; retry required moving generated `.next` cache and building with the required execution permission. No source workaround or bundler change.
- Fresh temporary database: existing migration → seed → `db:verify --baseline` → migration rerun, which correctly skipped the applied migration. Temporary database removed afterward.
- Existing demo audit before/after: 9 exercises, 29 aliases, 29 corrections, 3 detector records; vector/unaccent in `extensions`; vector(384), GIN/HNSW, five enabled search/update triggers, all three taxonomy tables with RLS and no policies. `term_aliases` absent as expected.
- Production HTTP liveness/readiness/curriculum 200; against a reachable DB with no curriculum schema, liveness stayed 200 while readiness returned 503. No writes made to that DB.
- Allowed admin preflight returned exact-origin CORS plus Authorization/Content-Type support. Automated checks reject foreign WebSocket Origin, exercise the real missing-key `STT_UNAVAILABLE` path and close idle sockets on app shutdown.
- Sending SIGTERM to the running production API closed an open real WebSocket and the process exited 0 after shutdown/pool close.

## Retrieval, admin and browser

All five representative queries returned real taxonomy records with `mode: "fts"`. Local HTTP durations observed in one warm sample were 10.0, 7.2, 4.2, 3.7 and 3.9 ms respectively; API internal total timing was 2.7–7.5 ms. These are local diagnostic timings, **not Render/Vercel latency or a benchmark**.

1. `common mistakes in demi plie`
2. `knees in during plie` → Knees over toes
3. `shoulders in port de bras` → Shoulders down, neck long
4. `Schultern beim port de bras` → Shoulders down, neck long
5. `heels coming up in plie` → Keep heels connected

Built voice UI typed fallback displayed the German query's real correction cards and “Full-text retrieval”. The browser automation's native-details click did not expand the form; the local smoke check explicitly opened the details element before submitting. No UI code was changed and this does not establish a new keyboard/accessibility audit.

Real production HTTP CRUD created a uniquely named temporary exercise/alias/correction, retrieved it immediately, edited/retrieved the revised cue, checked NULL embedding, deleted the correction and checked its absence. An initial diagnostic DELETE incorrectly sent Content-Type without a body and received 400; the proper body-free request passed (the real admin client already omits that header). Removed only the temporary exercise afterward and rechecked the seed baseline. Existing full CRUD integration tests also passed. This was local HTTP verification, not deployed admin/browser CRUD verification.

All six routes rendered with one main landmark and no horizontal overflow at 1280 and 390 px. Homepage and narrow admin screenshots were visually inspected; browser error collection was empty. No new UI design work was done.

## Media and privacy

- Real MediaPipe inference on a clearly labeled blank ~2.1-second diagnostic WebM completed locally with a no-person warning and no false event cards. The worker loaded Next chunks, jsDelivr WASM and the pinned Google Storage model.
- Worker-aware browser network capture recorded only eight asset GET requests, no non-GET requests and no runtime exceptions. Actual worker response returned the intended CSP, nosniff, Referrer-Policy and camera/microphone Permissions-Policy.
- A blank clip does **not** validate skeleton tracking, real ballet accuracy or timeline intervals. Detector/cancellation/taxonomy regression suites passed; no real-person clip, deployed worker, deployed cancellation/timeline or Vercel asset behavior has been verified this phase.
- Actual webcam start was attempted from localhost (a secure context); it ended with “Camera permission denied” and an inactive state. No camera frames, skeleton, repeated real start/stop or deployed HTTPS camera test was possible. No synthetic result was substituted for webcam verification.
- Local FTS-only API RSS after searches/CRUD was 62,592 KiB (~61 MiB). This is not Linux/Render evidence. E5 remains disabled; its earlier ~620 MiB measurement does not fit the documented 512 MB free-service allocation. No hosted provider is already available/configured.
- Static browser output contained no API test-token/DB-URI markers or `DEEPGRAM_API_KEY`, `DATABASE_URL`, `ADMIN_API_TOKEN` identifiers. One emitted `.map` contained no sources; no secret markers found anywhere in static output. No real hosting secrets were available to scan. Browser production source maps are not enabled in Next configuration.
- Logs contained request IDs/routes/durations/search timings and no test credential markers. A regression test injects sensitive error details and asserts they are absent from output. Admin Authorization remains redacted; no audio/video/frame bodies are logged.

## Remaining manual actions and limits

1. Provide access/reference for `musical-goggles`; configure its session-pooler `DATABASE_URL` and TLS CA privately. Apply existing migrations/seed and run the audit using the runbook if direct SQL access here remains unavailable.
2. Identify/connect the intended Render free service and Vercel project/account. Configure server secrets, public API origin and exact frontend CORS origin; deploy the prepared code. No automatic paid provisioning.
3. Supply `DEEPGRAM_API_KEY` server-side if live voice is needed. Otherwise retain real typed fallback and document STT unavailable.
4. Execute the runbook's acceptance sequence on actual HTTPS/WSS URLs, record production cold/warm latency, inspect production bundles/network/logs, and replace pending statuses only with observed evidence.
5. Complete real webcam/real-person clip checks on a device granting permission. Diagnostic clips/unit fixtures do not establish real ballet or child-safety validation.

The demo still uses a single-operator admin token, last-write-wins editing, public retrieval/STT routes without per-user quotas, and experimental two-dimensional detectors. No claim of comprehensive ballet correction, trained ballet CV, production validation on children, live Deepgram success or deployed hybrid search is made. Temporary verification services/browser were stopped; no diagnostic rows remain.
