'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CurriculumResponseSchema,
  type CorrectionDto,
  type CurriculumResponse,
  type ExerciseDto,
} from '@mg/shared';
import { fetchJson, type ApiResult } from '@/lib/api';
import { config } from '@/lib/config';
import { StateMessage } from './StateMessage';

const COLD_START_HINT_MS = 4_000;
// Render's free tier sleeps; first request can take ~30–60 s.
const TIMEOUT_MS = 75_000;

type Load =
  { status: 'loading'; slow: boolean } | { status: 'done'; result: ApiResult<CurriculumResponse> };

export function CurriculumView() {
  const [load, setLoad] = useState<Load>({ status: 'loading', slow: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const slowTimer = setTimeout(
      () => setLoad((l) => (l.status === 'loading' ? { ...l, slow: true } : l)),
      COLD_START_HINT_MS,
    );
    fetchJson(config.apiUrl, '/curriculum', CurriculumResponseSchema, {
      signal: ctrl.signal,
      timeoutMs: TIMEOUT_MS,
    })
      .then((result) => setLoad({ status: 'done', result }))
      .catch(() => undefined) // aborted on unmount
      .finally(() => clearTimeout(slowTimer));
    return () => {
      ctrl.abort();
      clearTimeout(slowTimer);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading', slow: false });
    setAttempt((a) => a + 1);
  }, []);

  if (load.status === 'loading') {
    return (
      <StateMessage title="Loading curriculum…">
        {load.slow
          ? 'Still waiting for the backend — a sleeping free-tier server can take up to a minute to wake.'
          : null}
      </StateMessage>
    );
  }

  const { result } = load;
  if (!result.ok) return <FailureState result={result} onRetry={retry} />;

  const { exercises, coverage, dataset } = result.data;
  if (exercises.length === 0) {
    return (
      <StateMessage tone="warn" title="The curriculum is empty">
        The database is reachable but has no exercises. Run{' '}
        <code className="font-mono">pnpm db:seed</code> to load the demo data.
      </StateMessage>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-warn/40 bg-panel p-6">
          <p className="text-sm font-bold tracking-[0.3em] text-warn uppercase">{dataset.label}</p>
          <p className="mt-2 text-lg text-ink-muted">{dataset.notice}</p>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-6 lg:min-w-96">
          <p className="text-sm font-semibold tracking-[0.2em] text-ink-faint uppercase">
            Camera-detectable corrections
          </p>
          <p className="mt-2 font-mono text-5xl font-semibold">
            {coverage.cameraDetectable} <span className="text-ink-faint">/ {coverage.total}</span>
          </p>
          <p className="mt-2 text-base text-ink-muted">
            The rest need richer movement models or future trained computer-vision models.
          </p>
        </div>
      </section>

      <p className="text-base text-ink-faint">
        Read-only view. Create / edit / delete arrives with the admin screen (Phase 5).
      </p>

      {exercises.map((e) => (
        <ExerciseSection key={e.id} exercise={e} />
      ))}
    </div>
  );
}

function FailureState({
  result,
  onRetry,
}: {
  result: Extract<ApiResult<unknown>, { ok: false }>;
  onRetry: () => void;
}) {
  const title =
    result.code === 'DATABASE_UNAVAILABLE'
      ? 'Curriculum database unavailable'
      : result.kind === 'unreachable'
        ? 'Backend unavailable'
        : result.kind === 'timeout'
          ? 'Backend did not respond in time'
          : 'Could not load the curriculum';
  const detail = [
    result.code,
    result.status ? `HTTP ${result.status}` : null,
    result.requestId ? `request ${result.requestId}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <StateMessage tone="danger" title={title} detail={detail || undefined}>
      <p>{result.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-lg border border-line bg-panel-raised px-5 py-2 text-base text-ink hover:border-ink-faint"
      >
        Try again
      </button>
    </StateMessage>
  );
}

function ExerciseSection({ exercise: e }: { exercise: ExerciseDto }) {
  const terms = [e.frenchTerm && `FR ${e.frenchTerm}`, e.germanTerm && `DE ${e.germanTerm}`].filter(
    Boolean,
  );
  return (
    <section aria-labelledby={`ex-${e.slug}`} className="rounded-3xl border border-line bg-panel">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line p-6 sm:p-8">
        <div>
          <h2 id={`ex-${e.slug}`} className="text-4xl font-semibold tracking-tight">
            {e.name}
          </h2>
          {terms.length ? (
            <p className="mt-2 text-lg text-ink-muted">{terms.join('   ·   ')}</p>
          ) : null}
        </div>
        <div className="flex gap-2 text-sm text-ink-muted">
          <span className="rounded-full border border-line px-3 py-1 capitalize">{e.level}</span>
          <span className="rounded-full border border-line px-3 py-1">
            {e.category.replaceAll('_', ' ')}
          </span>
        </div>
      </header>
      {e.corrections.length === 0 ? (
        <p className="p-8 text-lg text-ink-faint">No corrections for this exercise yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {e.corrections.map((c) => (
            <CorrectionRow key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CorrectionRow({ c }: { c: CorrectionDto }) {
  return (
    <li className="grid gap-4 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="text-2xl font-medium">{c.errorName}</p>
        <p className="mt-2 text-xl font-bold tracking-wide uppercase">{c.cuePhrase}</p>
        <p className="mt-2 text-lg text-ink-muted">{c.correction}</p>
        {c.detectorIssue ? (
          <p className="mt-2 font-mono text-sm text-danger">{c.detectorIssue}</p>
        ) : null}
      </div>
      <div className="md:text-right">
        {c.camera === 'supported' && c.detector ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-ok/50 px-4 py-1.5 text-base font-semibold text-ok">
              Camera: supported
            </span>
            <p className="mt-2 font-mono text-sm text-ink-faint">
              {c.detector.rule} · threshold {c.detector.threshold}
            </p>
          </>
        ) : (
          <span className="inline-flex rounded-full border border-line px-4 py-1.5 text-base text-ink-faint">
            Camera: not supported
          </span>
        )}
      </div>
    </li>
  );
}
