# Phase 2 implementation and verification

## Scope and baseline

Inspected README, architecture, SQL, repositories/mapping, shared DTOs, routes, UI and test setup before editing. Working tree was clean at local commit `4b2e98e`. Phase 1 was confirmed in code and then against an isolated PostgreSQL 16 + pgvector database: 9 exercises, 29 corrections, 3 valid geometric detector candidates. GIN/HNSW indexes, nullable 384-dimensional vectors, alias/search-document triggers, embedding invalidation, RLS, structured logs and curriculum routes were retained.

No schema migration, alternate correction dataset, pose-engine change, video or live-camera implementation was introduced.

## Files changed

- `packages/shared/src/voice.ts`, `voice.test.ts`, `index.ts`: strict control-message and binary-frame contracts, search/normalization/timing DTOs.
- `apps/api/src/search/{normalize,rrf,embedding,backfill,service}.ts`: deterministic DB-driven normalization, PostgreSQL FTS and cosine candidates, RRF, swappable local E5 provider and guarded incremental backfill.
- `apps/api/src/voice/deepgram.ts`, `src/routes/voice.ts`: direct streaming API adapter, final-utterance assembly/deduplication, WebSocket lifecycle and typed search route.
- `apps/api/src/{app,env,server}.ts`: dependency wiring and explicit environment flags.
- `apps/api/scripts/{embed,measure-embedding}.ts`, `tsup.config.ts`: CLI backfill, memory measurement and production backfill entrypoint.
- `apps/api/test/{search,search.integration,deepgram}.test.ts`: deterministic/ranking/protocol behavior, real SQL/model tests and mocked external Deepgram boundary.
- `apps/web/src/components/VoiceClassroom.tsx`, `src/app/voice/page.tsx`, `src/app/page.tsx`: classroom voice capture, transcript/results, type fallback, technical timings and current home-screen status.
- Root/API package manifests, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: WebSocket, ONNX/Transformers dependencies and commands; native ONNX install allowed explicitly.
- Environment examples, README and architecture documentation.

## Protocol and retrieval

See [architecture](architecture.md#phase-2-protocol-and-runtime) for message fields, recording limits and timing definitions. Direct Deepgram API avoids tying the project to SDK-specific event wrappers. Current official docs support [Nova-3 multilingual keyterms](https://deepgram.com/learn/deepgram-expands-nova-3-with-10-new-languages-and-multilingual-keyterm-prompting), [streaming results](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) and [CloseStream](https://developers.deepgram.com/docs/close-stream).

Normalization uses live exercise aliases, longest whole-phrase matches, accent/hyphen folding and deterministic English/German body/error terms. Exercise matches restrict candidates; empty restricted results retry globally. Both input paths call the same `SearchService` and return the existing correction DTOs.

FTS uses simple + English configurations and OR-ed meaningful terms to avoid requiring every conversational filler token. Vector SQL uses only the provider's model identity. RRF uses k=60, 30 candidates per list and up to five returned corrections. Debug ranks are omitted unless enabled on the server. This is ranking, not calibrated confidence; returned cards can include other corrections for the same exercise.

E5 uses [Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small), q8 ONNX, 384 dimensions, query/passage prefixes, mean pooling, L2 normalization and tokenizer truncation. Backfill checks both `embedding IS NULL` and unchanged `searchable_text` in the update. Existing trigger invalidation handles later edits.

## Observed verification

Date: 2026-10-01. Node 22.23.3, pnpm 10.28.0, macOS ARM64, isolated Docker pgvector/PostgreSQL 16 on port 55432.

- Dependency install completed, including native ONNX runtime.
- Typecheck, ESLint, Prettier check and production API/Next.js builds passed. Initial sandbox builds failed on Turbopack worker port binding; a clean-cache build outside that restriction passed.
- Full suite: **115 tests passed**, including real database and E5 tests (no skips in the verification run).
- Unit tests cover normalization variants and ambiguous aliases, binary/control protocol validation, RRF, final-segment assembly and duplicate suppression.
- Real PostgreSQL tests cover all five requested queries, existing curriculum/search triggers, FTS-only mode, genuinely unavailable local E5 cache fallback, debug omission, actual hybrid ranks and backfill's concurrent-text-edit guard.
- External-boundary tests cover Deepgram interim/final behavior, duplicate final events, connection failure/disconnect, malformed messages, empty stopped streams and final-segment draining. No simulated production speech or correction results are shipped.
- `pnpm db:embed`: 29 examined / 29 updated; second run: 0 examined / 0 updated.
- API and production web started successfully. Browser typed English knee query returned “Knees over toes”; German shoulder query returned “Shoulders down, neck long”, both through real hybrid retrieval.
- Existing curriculum loaded in the browser with 3/29 camera coverage. No browser runtime/console errors observed during these checks.

Representative real PostgreSQL query checks:

| Query                        | Detected exercise | Expected result verified      |
| ---------------------------- | ----------------- | ----------------------------- |
| common mistakes in demi plie | demi_plie         | Nonempty exercise corrections |
| knees in during plie         | demi_plie         | knees_inward first            |
| shoulders in port de bras    | port_de_bras      | shoulders_raised first        |
| Schultern beim port de bras  | port_de_bras      | shoulders_raised first        |
| heels coming up in plie      | demi_plie         | heels_lift first              |

## Memory observations

Real measurement command: `EMBEDDING_ALLOW_DOWNLOAD=true pnpm --filter @mg/api embedding:measure`.

| Measurement                               |        Observed |
| ----------------------------------------- | --------------: |
| Baseline process RSS                      |        75.6 MiB |
| RSS / process peak after first q8 query   |       619.8 MiB |
| Initial load + download + first inference |          56.1 s |
| Output dimension / L2 norm                | 384 / 0.9999998 |
| Backfill process RSS after 29 rows        |       608.2 MiB |
| No-op backfill RSS (model never loaded)   |        84.1 MiB |

This is a macOS process measurement, not a Render Linux load test or a guarantee about peak memory under concurrent HTTP/voice traffic. It exceeds a 512 MiB budget before allowing for the full API workload. `EMBEDDING_ENABLED=false` is therefore the default. FTS needs no model. Before enabling E5 on Render, measure on the actual target; use a larger memory tier or implement a remote `EmbeddingProvider` if needed. A provider change must use compatible corpus/query vectors or deliberately re-embed; backfill never overwrites populated vectors automatically.

## Unverified external dependencies

No `DEEPGRAM_API_KEY` was configured. Live microphone-to-Deepgram transcription, actual multilingual recognition quality, provider latency, and browser audio-format acceptance by Deepgram remain unverified. Missing-key behavior and the external adapter failure paths are tested. No Render/Vercel/Supabase deployment was requested or attempted.

## Remaining Phase 3 work

Browser-only uploaded-video decoding, MediaPipe pose extraction, shared pose-engine rules/debounce, mapping rule events to these same correction records, and validation of the three geometric detector candidates on real footage. Live camera remains Phase 4. Neither was started.
