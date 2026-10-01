import Link from 'next/link';
import { BackendStatus } from '@/components/BackendStatus';
import { ArrowIcon, CameraIcon, FilmIcon, MicIcon, BookIcon } from '@/components/icons';
const modes = [
  {
    href: '/voice',
    title: 'Ask the curriculum',
    label: 'Voice & text',
    description: 'A question in your words. A cue from your curriculum.',
    Icon: MicIcon,
    tone: 'text-accent',
  },
  {
    href: '/video',
    title: 'Study the movement',
    label: 'Video studio',
    description: 'Explore a local clip, frame by frame, with geometric feedback.',
    Icon: FilmIcon,
    tone: 'text-aqua',
  },
  {
    href: '/live',
    title: 'Practice in the moment',
    label: 'Live camera',
    description: 'See local pose measurements alongside classroom cues.',
    Icon: CameraIcon,
    tone: 'text-rose',
  },
  {
    href: '/curriculum',
    title: 'One shared language',
    label: 'Curriculum',
    description: 'Browse the correction records connecting every mode.',
    Icon: BookIcon,
    tone: 'text-warn',
  },
];
export default function ClassroomHome() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <section className="grid items-center gap-6 py-3 lg:grid-cols-[1.2fr_1fr] lg:py-5">
        <div>
          <p className="eyebrow">Movement meets understanding</p>
          <h1 className="mt-5 text-5xl leading-[1.06] font-medium tracking-[-.045em] sm:text-6xl xl:text-7xl">
            A more thoughtful
            <br />
            way to <em className="font-editorial font-normal text-accent">practice.</em>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Your AI Ballet Classroom. Bring a question, a video, or a live view — and work with one
            shared language of correction.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/voice" className="button-primary">
              Enter the classroom <ArrowIcon />
            </Link>
            <Link href="/review" className="button-secondary">
              How it works
            </Link>
          </div>
          <p className="mt-5 text-xs text-ink-faint">
            An experimental teaching companion. Always guided by human expertise.
          </p>
        </div>
        <div className="hero-art surface overflow-hidden" aria-hidden="true">
          <span className="absolute top-5 left-5 font-mono text-[10px] tracking-[.2em] text-ink-faint uppercase">
            The art of alignment
          </span>
          <svg viewBox="0 0 440 350" fill="none">
            <ellipse cx="225" cy="178" rx="145" ry="118" stroke="#c5b9f4" strokeOpacity=".12" />
            <ellipse
              cx="225"
              cy="178"
              rx="93"
              ry="151"
              transform="rotate(35 225 178)"
              stroke="#89dbd4"
              strokeOpacity=".2"
            />
            <path
              d="M63 273C116 209 183 76 272 61C340 50 341 128 261 159C167 196 153 264 190 310"
              stroke="#c5b9f4"
              strokeWidth="2"
            />
            <path
              d="M108 79C151 185 194 196 310 233C375 254 319 308 240 299"
              stroke="#89dbd4"
              strokeWidth="1.5"
            />
            <path
              d="M210 102C233 146 226 207 197 247M145 164C204 161 249 175 284 127M200 241L263 308M200 241L157 309"
              stroke="#e6b6cd"
              strokeOpacity=".8"
              strokeWidth="1.5"
            />
            <circle cx="206" cy="88" r="12" stroke="#e6b6cd" strokeOpacity=".8" />
            <circle cx="218" cy="176" r="5" fill="#89dbd4" />
            <circle cx="200" cy="241" r="3" fill="#c5b9f4" />
          </svg>
          <div className="absolute right-5 bottom-5 left-5 flex justify-between border-t border-line/70 pt-3 text-[10px] tracking-widest text-ink-faint uppercase">
            <span>Voice · Video · Camera</span>
            <span>One curriculum</span>
          </div>
        </div>
      </section>
      <section aria-labelledby="modes-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="modes-heading" className="section-title">
            Choose your studio
          </h2>
          <span className="text-xs text-ink-faint">
            Different inputs. Consistent correction records.
          </span>
        </div>
        <nav aria-label="Classroom modes" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modes.map(({ href, title, label, description, Icon, tone }, i) => (
            <Link href={href} key={href} className="surface mode-card flex flex-col p-5 sm:p-6">
              <div className={`mb-7 flex items-center justify-between ${tone}`}>
                <Icon className="h-7 w-7" />
                <span className="font-mono text-[10px] text-ink-faint">0{i + 1}</span>
              </div>
              <p className={`mb-2 text-[10px] font-semibold tracking-widest uppercase ${tone}`}>
                {label}
              </p>
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">{description}</p>
              <span className="mt-6 flex items-center justify-between border-t border-line/70 pt-4 text-xs text-ink-muted">
                Open studio
                <ArrowIcon className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </nav>
      </section>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line/70 pt-5 text-xs text-ink-faint">
        <p>Video & camera stay on your device. Voice uses Deepgram.</p>
        <BackendStatus />
      </footer>
    </main>
  );
}
