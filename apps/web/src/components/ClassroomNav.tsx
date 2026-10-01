'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const links = [
  ['/', 'Classroom'],
  ['/voice', 'Voice'],
  ['/video', 'Video'],
  ['/live', 'Live camera'],
  ['/curriculum', 'Curriculum'],
  ['/admin', 'Admin'],
] as const;
export function ClassroomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 py-3 sm:px-6">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? 'page' : undefined}
            className={`rounded-lg px-4 py-3 text-base font-medium ${pathname === href ? 'bg-panel-raised text-accent' : 'text-ink-muted hover:bg-panel-raised hover:text-ink'}`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
