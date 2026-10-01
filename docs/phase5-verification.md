# Phase 5 — curriculum admin and UI polish

Implemented and verified locally on 2026-10-01 from Phase 4 commit `b0060a8`. No deployment, new AI feature, voice transport change, pose-engine change or embedding-strategy change was made.

## Changed files

| Area                     | Files                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared contracts         | `packages/shared/src/admin.ts`, `admin.test.ts`, `api.ts`, `index.ts`                                                                                 |
| API CRUD                 | `apps/api/src/admin/repository.ts`, `apps/api/src/routes/admin.ts`, `apps/api/test/admin.integration.test.ts`                                         |
| API wiring/configuration | `apps/api/src/app.ts`, `env.ts`, `errors.ts`, `server.ts`, `apps/api/.env.example`                                                                    |
| Admin UI/client          | `apps/web/src/app/admin/page.tsx`, `apps/web/src/components/AdminForms.tsx`, `CurriculumAdmin.tsx`, `apps/web/src/lib/admin.ts`, `admin.test.ts`      |
| Shared UI                | `apps/web/src/components/ClassroomNav.tsx`, `StatusBadge.tsx`, `TechnicalPanel.tsx`, `StateMessage.tsx`                                               |
| Classroom presentation   | `apps/web/src/components/CurriculumView.tsx`, `VoiceClassroom.tsx`, `VideoClassroom.tsx`, `LiveClassroom.tsx`                                         |
| Layout/pages             | `apps/web/src/app/layout.tsx`, `globals.css`, `page.tsx`, `not-found.tsx`, `voice/page.tsx`, `video/page.tsx`, `live/page.tsx`, `curriculum/page.tsx` |
| Documentation            | `README.md`, `docs/architecture.md`, this report                                                                                                      |

No dependency, lockfile, SQL migration, taxonomy schema, MediaPipe worker, detector, temporal filter, E5 provider or retrieval-ranking change.

## CRUD behavior

Admin supports create/edit exercise, create/edit correction and delete correction. Exercises include multilingual aliases; corrections preserve stable IDs when edited. Exercise deletion and moving corrections between exercises are not exposed.

`ADMIN_API_TOKEN` (32–256 characters) must be configured server-side. Every `/admin` route is guarded; absent configuration returns 503, wrong/missing token 401. The admin screen validates the token before enabling forms and holds it only in page memory. Lock/reload clears it. Authorization is redacted by the existing logger. No database credentials reach the browser.

Shared strict Zod schemas validate all writes. Detector editing uses a structured rule/threshold/persistence form, with null as the default. Unknown detector fields, invalid ranges and submitted vectors/search columns are rejected. Heel lift remains metadata-only. Client and API validation both run. Duplicate slugs/aliases return useful errors; missing records return 404.

Parameterized SQL writes use a transaction. Exercise and alias updates either both succeed or roll back. Alias synchronization avoids deleting/reinserting unchanged terms. Existing database triggers immediately maintain FTS; new embeddings remain NULL until backfill. Detector-only changes and unchanged exercise/alias saves preserve vectors, while retrieval-text edits invalidate them. The trigger approach was checked against the existing migration and [Supabase's Postgres trigger documentation](https://supabase.com/docs/guides/database/postgres/triggers); no trigger behavior was changed.

Delete requires a separate confirmation in the UI. Failed validation keeps the form values. Failed requests show actionable messages. Ambiguous network failures instruct a reload to check whether the write applied; no automatic mutation retries occur.

## UI and accessibility

- One responsive navigation bar connects classroom, voice, video, live camera, curriculum and admin; the active page uses `aria-current`.
- Large classroom transcripts/cues remain; admin uses denser labeled forms.
- Shared status colors, loading/error/empty/success messages and collapsed technical-panel presentation.
- Completed video with no measurements uses a warning rather than a fatal-error heading.
- Improved muted-text contrast, visible focus rings, a skip-to-content link and focusable main landmarks.
- Editor opening focuses its heading. Native form controls, fieldset legends, validation and confirm/cancel buttons support keyboard operation.
- Curriculum badges distinguish implemented camera prototypes from metadata-only checks, preserving API coverage semantics.
- No animation was added. Reduced-motion support remains.

## Verification

Environment: macOS ARM64, Node 22.23.3, pnpm 10.28.0, local PostgreSQL/pgvector with the seeded taxonomy, cached E5, production API at port 4100 and web at 3100.

Passed locked install, typecheck, lint, format check, **173 tests without skips**, and API/web production builds. New tests include strict write schemas, authorization, disabled admin, actual database CRUD, transactional rollback, uniqueness/validation/not-found responses, immediate FTS, vector preservation/invalidation, deleted-record retrieval, and client handling of ambiguous/non-JSON responses. Database tests use real SQL/search logic; they do not mock the CRUD repository or ranking.

Manual browser checks:

1. Unlocked admin with a temporary local test token.
2. Created `Phase Five Demo`, added an English alias, then renamed it `Phase Five Demo Revised`.
3. Created a correction with a knee-alignment detector through the form; threshold zero failed validation, 0.05 / 300 ms saved successfully.
4. Edited the cue and confirmed `Embedding pending backfill` in admin.
5. Queried the new alias and error through the real voice page's typed fallback. The revised exercise/cue appeared immediately from PostgreSQL.
6. Video and live selectors both included the newly added supported exercise. A separate check used its actual API DTO and the real pose engine with synthetic landmarks; video interval lookup and the live lookup returned the same correction ID and revised cue. This was a taxonomy/engine check, not real-camera validation.
7. Tested Keep correction, then Confirm delete. The correction disappeared from admin/search; the exercise showed the empty state. Search can still return other related records through the existing global fallback.
8. Removed only the temporary test exercise afterward. The database returned to 9 exercises / 29 corrections; the deleted correction ID is absent from retrieval.
9. All six routes fit a 390 px viewport without horizontal overflow; desktop admin was visually inspected. Every route has one main landmark. Admin form inspection found zero unlabeled controls.
10. Tab focused the skip link; Enter moved focus to main. Opening an editor focused its heading. The technical panel toggled using a native Space key event and started collapsed. The automation helper's Enter command navigated unexpectedly; the native browser-level Space check succeeded without app changes.
11. Uploaded video still ran the real MediaPipe worker on an explicitly blank 2.1-second diagnostic WebM, completing 22 samples with zero false detections and a no-person message. Worker-aware network capture saw only asset GETs and no uploads/runtime exceptions.
12. Live camera showed an actionable permission-denied state. Browser console/runtime checks found no application errors.

## Known limitations and stop condition

- A shared admin token is a single-operator demo gate; no per-user roles, audit history or token rotation UI. Use HTTPS outside localhost.
- Concurrent edits use last successful write wins; there is no revision conflict UI or undo. Exercise deletion is not implemented.
- Active video/live pages retain their loaded taxonomy snapshot. Reload them after admin changes; typed search reads current database data immediately.
- Real Deepgram STT remains unverified because no key is available. Actual webcam capture remains blocked by browser/host permission; real ballet detector validation is still outstanding. Synthetic fixtures/blank clips are explicitly diagnostic and are never presented as real movement verification.
- No screen-reader audit or broad device/browser matrix was performed; keyboard, labels, focus and responsive behavior received basic checks.

Phase 5 stops here. Deployment and further features were not started. No commit or push was made. Temporary verification servers and the browser were stopped after checks.
