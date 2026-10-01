import Link from 'next/link';

export function PageHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
      <div>
        {eyebrow ? (
          <p className="text-sm font-semibold tracking-[0.3em] text-ink-faint uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">{title}</h1>
      </div>
      <Link
        href="/"
        className="rounded-lg border border-line px-4 py-2 text-base text-ink-muted hover:border-ink-faint hover:text-ink"
      >
        ← Classroom
      </Link>
    </header>
  );
}
