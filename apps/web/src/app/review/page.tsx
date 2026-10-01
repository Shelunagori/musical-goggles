import Link from 'next/link';
import { Disclosure } from '@/components/Disclosure';
import { ArrowIcon, BookIcon, CameraIcon, FilmIcon, MicIcon } from '@/components/icons';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'How it works · musical-goggles',
  description:
    'A plain-language look inside the AI Ballet Classroom: tools, analysis, retrieval, privacy and honest limitations.',
};
const sections = [
  ['foundation', 'One curriculum'],
  ['retrieval', 'Voice & text'],
  ['movement', 'Movement analysis'],
  ['stack', 'The toolkit'],
  ['privacy', 'Privacy & control'],
  ['validation', 'What is verified'],
  ['deployment', 'Deployment'],
] as const;
function ReviewSection({
  id,
  number,
  title,
  intro,
  children,
}: {
  id: string;
  number: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="review-section">
      <div>
        <p className="eyebrow">{number} / Inside the classroom</p>
        <h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted sm:text-base">
          {intro}
        </p>
      </div>
      {children}
    </section>
  );
}
function Steps({ steps }: { steps: [string, string][] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {steps.map(([title, text], i) => (
        <li key={title} className="surface flex gap-4 p-5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-aqua/25 text-xs text-aqua">
            {i + 1}
          </span>
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export default function ReviewPage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <header className="surface relative overflow-hidden p-6 sm:p-10">
        <div
          className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full border border-accent/10"
          aria-hidden
        />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <p className="eyebrow">The product, explained</p>
          <span className="chip">Engineering review · prototype</span>
        </div>
        <h1 className="mt-5 text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
          Understand <em className="font-editorial font-normal text-accent">every cue.</em>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-muted">
          What we use, how we analyze movement, and where the feedback comes from. A simple guide to
          the AI Ballet Classroom — including what it cannot tell you.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="button-primary">
            Explore the classroom <ArrowIcon />
          </Link>
          <a href="#movement" className="button-secondary">
            See how analysis works
          </a>
        </div>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <nav
          aria-label="Review sections"
          className="flex flex-wrap gap-1 rounded-xl border border-line/60 p-2 lg:sticky lg:top-28 lg:flex-col lg:border-0 lg:p-0"
        >
          <p className="mb-3 hidden px-3 text-[10px] tracking-widest text-ink-faint uppercase lg:block">
            A look inside
          </p>
          {sections.map(([id, label], i) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-lg px-3 py-2.5 text-xs text-ink-muted transition-colors hover:bg-panel-raised hover:text-accent"
            >
              <span className="mr-3 font-mono text-ink-faint">0{i + 1}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 space-y-14 pb-8">
          <ReviewSection
            id="foundation"
            number="01"
            title="Different ways in. The same language out."
            intro="A taxonomy is simply an organized library. Here it stores exercises, common mistakes, short classroom cues and fuller correction instructions. Voice, video and camera all use those same records."
          >
            <div className="surface p-5 sm:p-7">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  [MicIcon, 'Voice / text'],
                  [FilmIcon, 'Local video'],
                  [CameraIcon, 'Live camera'],
                ].map(([Icon, label]) => {
                  const Symbol = Icon as typeof MicIcon;
                  return (
                    <div
                      key={String(label)}
                      className="rounded-xl border border-line bg-stage/40 p-3"
                    >
                      <Symbol className="mx-auto mb-2 h-6 w-6 text-accent" />
                      <p className="text-xs text-ink-muted">{String(label)}</p>
                    </div>
                  );
                })}
              </div>
              <div className="py-3 text-center text-aqua" aria-hidden>
                ↓
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-aqua/25 bg-aqua/5 p-5">
                <BookIcon className="h-7 w-7 shrink-0 text-aqua" />
                <div>
                  <h3 className="font-medium">One correction library</h3>
                  <p className="mt-1 text-xs text-ink-muted">
                    The record ID connects every input to the same teaching cue.
                  </p>
                </div>
              </div>
            </div>
            <div className="correction-card">
              <p className="eyebrow text-ink-faint">
                Illustrative seeded record · not a live detection
              </p>
              <p className="mt-4 text-xs text-accent">Demi-plié / Knees collapsing inward</p>
              <h3 className="mt-2 font-editorial text-3xl text-ink">“Knees over toes”</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                A voice question can retrieve this record. The knee-alignment rule can also point to
                its ID. The interface takes the correction words from the database, not from a
                second copy hidden in the camera code.
              </p>
            </div>
          </ReviewSection>
          <ReviewSection
            id="retrieval"
            number="02"
            title="From a question to a useful correction."
            intro="The app retrieves existing curriculum content. It does not ask a chat model to invent a ballet correction. Typing and speaking lead to the same search service."
          >
            <Steps
              steps={[
                [
                  'Hear the question',
                  'The browser microphone sends small audio chunks through our API to Deepgram Nova-3 for transcription. English, German and French are supported by the configured multilingual mode.',
                ],
                [
                  'Wait for a complete phrase',
                  'Interim words appear as you speak. Only finalized utterances trigger a search; repeated final transcripts are suppressed.',
                ],
                [
                  'Recognize ballet language',
                  'Deterministic rules normalize accents, aliases and common wording: “plie” becomes plié terminology; “Schultern” maps to shoulders.',
                ],
                [
                  'Find the matching records',
                  'PostgreSQL searches the curriculum text. When a compatible embedding provider is enabled, semantic matches are combined with text matches. The result cards show the actual retrieval mode.',
                ],
              ]}
            />
            <Disclosure title="What does hybrid search mean?">
              <p>
                Text search matches words. Semantic search compares numerical representations of
                meaning, called embeddings. Reciprocal Rank Fusion combines the positions of results
                in both lists rather than comparing incompatible raw scores. A confidently
                recognized exercise narrows the search, with a broader fallback if needed.
              </p>
              <p>
                The optional multilingual-e5-small model uses 384-dimensional vectors, query/passage
                prefixes, mean pooling and L2 normalization. It is behind a swappable
                EmbeddingProvider interface. If unavailable or disabled, real full-text search still
                works. The initial deployment configuration keeps local E5 disabled because its
                measured memory use was about 620 MiB.
              </p>
            </Disclosure>
            <p className="text-xs leading-relaxed text-ink-faint">
              Deepgram needs a server-side key. Real microphone-to-Deepgram verification is still
              pending. Type instead works without it.
            </p>
          </ReviewSection>
          <ReviewSection
            id="movement"
            number="03"
            title="Points first. Geometry next. Words last."
            intro="MediaPipe is a general-purpose pose model. It estimates body landmarks — points such as shoulders, hips, knees and ankles. Our own small set of geometric rules checks those points. It is not a trained ballet assessment model."
          >
            <Steps
              steps={[
                [
                  'Choose the context',
                  'You choose an exercise and either a local clip or camera. The app does not classify which ballet movement you are doing.',
                ],
                [
                  'Measure in the browser',
                  'A browser worker runs MediaPipe Pose Landmarker Lite, targeting 10 samples per second. Video and camera use the same processing pipeline.',
                ],
                [
                  'Check visibility and persistence',
                  'The engine considers landmark visibility, normalizes distances by body size, and waits for a sustained geometric change. Unclear or missing poses are not treated as correct technique.',
                ],
                [
                  'Resolve a curriculum cue',
                  'A triggered rule points to a correction ID. The browser looks up the current curriculum record and displays its cue. Video also records local intervals you can click to revisit.',
                ],
              ]}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="surface surface-pad">
                <span className="chip text-aqua">Implemented · experimental</span>
                <h3 className="mt-4 text-lg font-medium">Knee alignment</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Looks for the knee moving inward relative to the hip–ankle alignment in a
                  front-facing view. It needs visible joints and a suitable camera angle.
                </p>
              </article>
              <article className="surface surface-pad">
                <span className="chip text-aqua">Implemented · experimental</span>
                <h3 className="mt-4 text-lg font-medium">Shoulder elevation</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Compares shoulder position with a relaxed baseline. Begin with 1.5 seconds of
                  stillness; calibration starts again for a new live session.
                </p>
              </article>
            </div>
            <Disclosure title="Sampling, calibration and session limits">
              <p>
                Frames are scaled to a maximum 960 px input, with one frame in flight. Shoulder
                calibration can time out after 30 seconds. Video clips are limited to five minutes;
                live sessions to ten minutes. Stop, navigation or hiding the live tab releases
                camera tracks. Recorded processing speed excludes model download.
              </p>
              <p>
                Thresholds and persistence come from validated detector metadata. Landmark
                visibility measures how well points are seen; it is not the probability that a
                ballet correction is right. Heel lift has seeded metadata but no implemented
                detector. Hip turnout, weight placement, foot articulation and artistry are outside
                this prototype.
              </p>
            </Disclosure>
          </ReviewSection>
          <ReviewSection
            id="stack"
            number="04"
            title="A focused toolkit, with clear jobs."
            intro="One web app, one API and one database. Each part does a specific job; no autonomous agent or generated coaching text is involved."
          >
            <div className="surface overflow-hidden">
              <dl className="divide-y divide-line/70">
                {[
                  [
                    'Next.js 16 + React 19',
                    'The interface, browser controls and responsive pages. TypeScript and Tailwind keep the UI consistent.',
                  ],
                  [
                    'MediaPipe Tasks Vision',
                    'Estimates pose landmarks locally in a browser worker. Shared TypeScript geometry evaluates the supported rules.',
                  ],
                  [
                    'Fastify 5 + WebSocket',
                    'Serves the curriculum, accepts search/admin requests, and connects browser audio to Deepgram.',
                  ],
                  [
                    'PostgreSQL + pgvector',
                    'The single source of curriculum truth, full-text search and optional semantic vectors. SQL queries use node-postgres.',
                  ],
                  [
                    'Zod + Pino + Vitest',
                    'Validate data and messages, log safe operational metadata, and test the system.',
                  ],
                ].map(([tool, job]) => (
                  <div key={tool} className="grid gap-2 p-5 sm:grid-cols-[220px_1fr]">
                    <dt className="text-sm font-semibold text-accent">{tool}</dt>
                    <dd className="text-sm leading-relaxed text-ink-muted">{job}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </ReviewSection>
          <ReviewSection
            id="privacy"
            number="05"
            title="Know what leaves the device."
            intro="Local media analysis and cloud speech recognition have different privacy boundaries. The interface keeps that distinction visible."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="surface surface-pad">
                <h3 className="text-lg font-medium text-aqua">Stays in your browser</h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
                  <li>Selected videos and webcam frames</li>
                  <li>Pose landmarks and movement events</li>
                  <li>Local playback and skeleton overlays</li>
                </ul>
              </article>
              <article className="surface surface-pad">
                <h3 className="text-lg font-medium text-accent">Uses a network connection</h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
                  <li>Voice audio → API → Deepgram</li>
                  <li>Questions and curriculum requests → API</li>
                  <li>Pose runtime/model downloads → asset providers</li>
                </ul>
              </article>
            </div>
            <Disclosure title="Admin access, updates and safe logging">
              <p>
                Admin is protected by a server-side token entered interactively. The browser holds
                it only in page memory and clears it on lock or reload. This is a single-operator
                demo gate, not a multi-user permission system.
              </p>
              <p>
                Validated forms create/edit exercises and corrections and delete corrections. Text
                search updates immediately through database triggers. New embeddings stay NULL until
                a separate backfill; retrieval-text edits invalidate old vectors. Reload video/live
                pages after edits to refresh their curriculum snapshot.
              </p>
              <p>
                Logs contain request IDs, route names, timings and safe error codes. The API does
                not store or log raw audio, videos, frames or admin tokens. Worker network
                restrictions block MediaPipe telemetry. Public retrieval/STT routes do not provide
                per-user quotas.
              </p>
            </Disclosure>
          </ReviewSection>
          <ReviewSection
            id="validation"
            number="06"
            title="A working prototype. An honest boundary."
            intro="Software checks show that the pieces work together. They do not establish the accuracy or safety of ballet coaching."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="surface surface-pad">
                <p className="eyebrow text-ok">Observed in local verification</p>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
                  <li>Real PostgreSQL retrieval and curriculum editing</li>
                  <li>Shared taxonomy mapping and deterministic rule tests</li>
                  <li>MediaPipe loading and inference on a blank diagnostic clip</li>
                  <li>Missing-key errors, origin checks and privacy checks</li>
                </ul>
              </article>
              <article className="surface surface-pad">
                <p className="eyebrow text-warn">Still requires verification</p>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
                  <li>Real ballet movement accuracy and broader camera views</li>
                  <li>Real microphone → Deepgram flow with credentials</li>
                  <li>Real webcam capture on a device granting permission</li>
                  <li>End-to-end behavior on deployed HTTPS services</li>
                </ul>
              </article>
            </div>
            <p className="rounded-xl border border-warn/25 bg-warn/5 p-4 text-sm leading-relaxed text-warn">
              No claim of full ballet correction, a ballet-trained vision model, or production
              validation on children. A qualified teacher remains essential.
            </p>
          </ReviewSection>
          <ReviewSection
            id="deployment"
            number="07"
            title="Designed to travel. Not yet verified live."
            intro="Deployment preparation targets Vercel for the frontend, Render free for the API, and Supabase for PostgreSQL. Preparation is not proof of a successful public deployment."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Vercel', 'Web experience'],
                ['Render', 'API + voice connection'],
                ['Supabase', 'Curriculum + search'],
              ].map(([host, job]) => (
                <div key={host} className="stat-card">
                  <h3 className="text-lg font-medium">{host}</h3>
                  <p className="mt-2 text-xs text-ink-muted">{job}</p>
                  <span className="mt-4 inline-block text-[10px] font-medium tracking-widest text-warn uppercase">
                    Target · unverified
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">
              The prepared demo defaults to full-text search. No hosted embedding provider is
              configured. Render may need time to wake from sleep; the UI reports waiting/errors and
              offers typed retrieval. Check the mode on actual result cards rather than assuming
              semantic search is active.
            </p>
            <div className="flex flex-wrap gap-3 border-t border-line pt-5">
              <Link href="/voice" className="button-primary">
                Ask your first question <ArrowIcon />
              </Link>
              <Link href="/curriculum" className="button-secondary">
                Explore the curriculum
              </Link>
            </div>
          </ReviewSection>
        </div>
      </div>
    </main>
  );
}
