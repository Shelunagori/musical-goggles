# Premium classroom UI redesign

## Design system

Midnight backgrounds, layered glass-like navy surfaces, lavender primary actions, aqua supporting accents, and restrained ballet-rose details. Green, amber and coral retain distinct success, warning and error meanings. Editorial serif accents complement a readable system sans-serif; no external font request is required. Shared tokens define cards, buttons, form fields, chips, spacing and focus outlines. Reduced-motion preferences disable decorative motion.

## Page changes

- Classroom: compact editorial hero, original decorative ballet line illustration, clear entry points and four mode cards.
- Voice: microphone/transcript workspace beside curriculum results, visible typed fallback and collapsed diagnostics.
- Video/live: two columns from 1024px, sticky preview and controls on the left, feedback on the right. Desktop preview height is capped relative to the viewport. Feedback is initially open; timeline, diagnostics and setup/privacy guidance use native, keyboard-accessible disclosures. On phones the columns stack. Existing media controls, overlays, progress, errors and privacy notices remain available.
- Curriculum: real summary counts, searchable exercise selector, one exercise's corrections at a time, compact capability badges and collapsible dataset notes.
- Admin: access and exercise selection sidebar with a structured editor/content panel; existing validated forms, detector fields and deletion confirmation remain intact.
- Review: new `/review` guide covering the shared taxonomy, speech retrieval, pose measurements, tools, privacy, verification and deployment limitations. The supplied review site informed its anchored case-study structure; all technical explanations describe this repository.

## Functionality boundary

No API, shared protocol, taxonomy package, pose-engine, database migration, embedding provider, dependency or deployment changes. Existing voice/video/live/admin state and event-handler code before the returned UI remains unchanged. Curriculum filtering is local presentation state. Media refs and canvas/video alignment are preserved.

## Verification

- Typecheck, lint, formatting and both production builds passed.
- Full regression suite: 184 tests passed, with local PostgreSQL and E5 integration enabled; zero skipped.
- Seven routes checked at 1440, 1024, 390 and 320px: no horizontal overflow, one main landmark and one H1 each, no runtime exceptions.
- Native accordion keyboard interaction verified; diagnostics initially collapsed. Focus styling, labels, status semantics and reduced-motion rules retained.
- Real typed search returned curriculum corrections for German terminology. A correction created and edited through the admin UI appeared immediately in typed search with its updated cue.
- Real admin exercise creation/editing and correction creation/editing/deletion succeeded. Temporary verification data was removed; original seed records retained.
- Actual browser MediaPipe analysis completed on a generated blank diagnostic clip and reported no person detected. Worker-aware network capture contained only GET requests and no uploaded video.
- Camera permission rejection displayed an actionable error.

## Limitations

No human ballet recording or real webcam session was available for this UI verification. Spoken Deepgram transcription was not retested. The blank clip validates execution and empty-state handling, not movement accuracy. This was browser-assisted functional/visual verification, not a formal assistive-technology accessibility audit. No deployment, commit or push performed.

## Changed files

- `apps/web/src/app/admin/page.tsx`
- `apps/web/src/app/curriculum/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/live/page.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/video/page.tsx`
- `apps/web/src/app/voice/page.tsx`
- `apps/web/src/components/ClassroomNav.tsx`
- `apps/web/src/components/CurriculumAdmin.tsx`
- `apps/web/src/components/CurriculumView.tsx`
- `apps/web/src/components/LiveClassroom.tsx`
- `apps/web/src/components/PageHeader.tsx`
- `apps/web/src/components/StateMessage.tsx`
- `apps/web/src/components/StatusBadge.tsx`
- `apps/web/src/components/TechnicalPanel.tsx`
- `apps/web/src/components/VideoClassroom.tsx`
- `apps/web/src/components/VoiceClassroom.tsx`
- `apps/web/src/components/icons.tsx`
- `apps/web/src/components/Disclosure.tsx`
- `apps/web/src/app/review/page.tsx`
- `docs/ui-redesign.md`
