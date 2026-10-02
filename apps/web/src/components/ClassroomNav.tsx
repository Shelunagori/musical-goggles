'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BackendStatus } from './BackendStatus';
const links = [
  ['/', 'Classroom'],
  ['/voice', 'Voice'],
  ['/video', 'Video'],
  ['/live', 'Live camera'],
  ['/curriculum', 'Curriculum'],
  ['/admin', 'Admin'],
  ['/review', 'Review'],
] as const;
export function ClassroomNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-stage/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          aria-label="musical-goggles classroom"
          className="flex shrink-0 items-center gap-3"
        >
          <span className="brand-mark" aria-hidden>
            m
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide">musical-goggles</span>
            <span className="block text-[10px] tracking-[.18em] text-ink-faint uppercase">
              AI Ballet Classroom
            </span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="flex w-full flex-wrap gap-1 lg:w-auto">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className={`rounded-full px-3.5 py-2.5 text-xs font-medium transition-colors sm:text-sm ${pathname === href ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/25' : 'text-ink-muted hover:bg-panel-raised hover:text-ink'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mx-auto max-w-[1440px] px-5 pb-3 sm:px-8 lg:px-12">
        <BackendStatus />
      </div>
    </header>
  );
}
