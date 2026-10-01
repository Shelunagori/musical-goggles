import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { BackendStatus } from '@/components/BackendStatus';
import { ArrowIcon, CameraIcon, FilmIcon, MicIcon } from '@/components/icons';

interface Mode {
  href: string;
  index: string;
  title: string;
  line: string;
  phase: number;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const MODES: Mode[] = [
  {
    href: '/voice',
    index: '01',
    title: 'Ask by Voice',
    line: '“What should I watch for during demi-plié?”',
    phase: 2,
    Icon: MicIcon,
  },
  {
    href: '/video',
    index: '02',
    title: 'Analyze Video',
    line: 'Upload a clip. Pose is analysed in your browser.',
    phase: 3,
    Icon: FilmIcon,
  },
  {
    href: '/live',
    index: '03',
    title: 'Live Analysis',
    line: 'Camera feed with real-time correction cues.',
    phase: 4,
    Icon: CameraIcon,
  },
];

export default function ClassroomHome() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-7xl flex-col px-6 py-10 sm:px-10 lg:py-14">
      <header>
        <p className="text-lg font-semibold tracking-[0.35em] text-ink-muted uppercase sm:text-xl">
          musical-goggles
        </p>
        <h1 className="mt-3 text-6xl leading-none font-bold tracking-tight sm:text-8xl lg:text-9xl">
          AI CLASSROOM
        </h1>
        <p className="mt-6 max-w-3xl text-xl text-ink-muted sm:text-2xl">
          One correction taxonomy. Voice, video and live camera all resolve to the same correction
          records.
        </p>
      </header>

      <nav aria-label="Classroom modes" className="mt-12 grid flex-1 gap-5 md:grid-cols-3 lg:mt-16">
        {MODES.map(({ href, index, title, line, phase, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-64 flex-col justify-between rounded-3xl border border-line bg-panel p-8 transition-colors hover:border-ink-faint hover:bg-panel-raised lg:min-h-80 lg:p-10"
          >
            <div className="flex items-start justify-between text-ink-muted">
              <Icon className="h-12 w-12 text-ink" />
              <span className="font-mono text-lg">{index}</span>
            </div>
            <div>
              <h2 className="text-4xl font-semibold tracking-tight lg:text-5xl">{title}</h2>
              <p className="mt-3 text-lg text-ink-muted">{line}</p>
              <p className="mt-6 flex items-center justify-between text-sm font-semibold tracking-widest text-warn/90 uppercase">
                <span>Phase {phase} · not built yet</span>
                <ArrowIcon className="text-ink-muted transition-transform group-hover:translate-x-1" />
              </p>
            </div>
          </Link>
        ))}
      </nav>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <Link
          href="/curriculum"
          className="text-lg font-medium text-ink underline-offset-4 hover:underline"
        >
          Curriculum →
        </Link>
        <BackendStatus />
      </footer>
    </main>
  );
}
