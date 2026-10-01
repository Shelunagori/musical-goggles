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
import Link from 'next/link';
import { supportsRule } from '@mg/pose-engine';
import { Disclosure } from './Disclosure';
import { StateMessage } from './StateMessage';

const COLD_START_HINT_MS = 4_000;
// Render's free tier sleeps; first request can take ~30–60 s.
const TIMEOUT_MS = 75_000;

type Load =
  { status: 'loading'; slow: boolean } | { status: 'done'; result: ApiResult<CurriculumResponse> };

export function CurriculumView() {
  const [load, setLoad] = useState<Load>({ status: 'loading', slow: false });
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState('');

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
        <Link href="/admin" className="underline">
          Open admin to create the first exercise.
        </Link>
      </StateMessage>
    );
  }

  const visible = exercises.filter((e) =>
    [e.name, e.frenchTerm, e.germanTerm, ...e.aliases.map((a) => a.alias)].some((term) =>
      term?.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
    ),
  );
  const selected = visible.find((e) => e.id === selectedId) ?? visible[0];
  const implemented = exercises
    .flatMap((e) => e.corrections)
    .filter((c) => c.detector && supportsRule(c.detector.rule)).length;
  return (
    <div className="space-y-6">
      <section aria-label="Curriculum summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [exercises.length, 'Exercises'],
          [coverage.total, 'Correction records'],
          [implemented, 'Camera-ready records'],
          [coverage.cameraDetectable, 'Detector metadata records'],
        ].map(([value, label]) => (
          <div key={label} className="stat-card">
            <p className="text-3xl font-medium tracking-tight text-accent">{value}</p>
            <p className="mt-2 text-xs text-ink-muted">{label}</p>
          </div>
        ))}
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="surface space-y-4 p-4 lg:sticky lg:top-28" aria-label="Browse exercises">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-ink-muted">
              Find an exercise
            </span>
            <input
              type="search"
              className="form-control"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Name or language alias"
            />
          </label>
          <div className="flex flex-col gap-1">
            {visible.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                aria-pressed={selected?.id === e.id}
                className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${selected?.id === e.id ? 'bg-accent/12 text-accent ring-1 ring-inset ring-accent/20' : 'text-ink-muted hover:bg-panel-raised'}`}
              >
                <span>{e.name}</span>
                <span className="font-mono text-xs text-ink-faint">{e.corrections.length}</span>
              </button>
            ))}
          </div>
          <Link href="/admin" className="button-secondary w-full">
            Manage curriculum →
          </Link>
        </aside>
        <div className="min-w-0 space-y-4">
          {selected ? (
            <ExerciseSection key={selected.id} exercise={selected} />
          ) : (
            <StateMessage title="No matching exercises">
              Try another name or clear the search field.
            </StateMessage>
          )}
          <Disclosure title={`${dataset.label} · about this curriculum`}>
            <p>{dataset.notice}</p>
            <p>
              Camera-ready records use experimental knee-alignment or shoulder-elevation rules. Heel
              lift has metadata only and is not implemented. This is not validated ballet technique
              assessment.
            </p>
          </Disclosure>
        </div>
      </div>
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
    <section aria-labelledby={`ex-${e.slug}`} className="surface overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/70 p-5 sm:p-6">
        <div>
          <h2 id={`ex-${e.slug}`} className="font-editorial text-3xl font-normal sm:text-4xl">
            {e.name}
          </h2>
          {terms.length ? (
            <p className="mt-2 text-sm text-ink-muted">{terms.join('   ·   ')}</p>
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
    <li className="grid gap-3 p-5 sm:p-6 2xl:grid-cols-[1fr_auto] 2xl:items-center">
      <div>
        <p className="text-xs font-medium text-ink-faint">{c.errorName}</p>
        <p className="mt-2 text-xl font-medium text-ink sm:text-2xl">{c.cuePhrase}</p>
        <p className="mt-2 text-sm text-ink-muted">{c.correction}</p>
        {c.detectorIssue ? (
          <p className="mt-2 font-mono text-sm text-danger">{c.detectorIssue}</p>
        ) : null}
      </div>
      <div className="2xl:text-right">
        {c.camera === 'supported' && c.detector ? (
          <>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium ${supportsRule(c.detector.rule) ? 'border-ok/50 text-ok' : 'border-warn/50 text-warn'}`}
            >
              {supportsRule(c.detector.rule) ? 'Camera · experimental' : 'Metadata only'}
            </span>
            <p className="mt-2 font-mono text-[10px] text-ink-faint">
              {c.detector.rule} · threshold {c.detector.threshold}
            </p>
          </>
        ) : (
          <span className="chip">Voice / text only</span>
        )}
      </div>
    </li>
  );
}
