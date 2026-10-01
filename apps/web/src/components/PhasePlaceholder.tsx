import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

/**
 * Honest placeholder for modes that are not implemented yet.
 * No fake transcripts, no fake detections.
 */
export function PhasePlaceholder(props: {
  eyebrow: string;
  title: string;
  phase: number;
  summary: string;
  pipeline: string[];
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-10 px-6 py-10 sm:px-10">
      <PageHeader eyebrow={props.eyebrow} title={props.title} />
      <section className="rounded-2xl border border-line bg-panel p-8 sm:p-12">
        <p className="inline-block rounded-full border border-warn/40 px-4 py-1 text-sm font-semibold tracking-widest text-warn uppercase">
          Not built yet · Phase {props.phase}
        </p>
        <p className="mt-6 max-w-3xl text-2xl leading-snug text-ink sm:text-3xl">{props.summary}</p>
        <ol className="mt-10 flex flex-wrap items-center gap-3 text-base text-ink-muted sm:text-lg">
          {props.pipeline.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="rounded-lg bg-panel-raised px-3 py-2">{step}</span>
              {i < props.pipeline.length - 1 ? (
                <span aria-hidden className="text-ink-faint">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        {props.children}
      </section>
    </main>
  );
}
