import type { ReactNode } from 'react';

const TONES = {
  info: 'border-line text-ink-muted',
  warn: 'border-warn/50 text-warn',
  danger: 'border-danger/50 text-danger',
} as const;

export function StateMessage(props: {
  tone?: keyof typeof TONES;
  title: string;
  children?: ReactNode;
  detail?: string;
}) {
  const tone = TONES[props.tone ?? 'info'];
  return (
    <div
      role={props.tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-2xl border bg-panel p-8 ${tone}`}
    >
      <p className="text-2xl font-semibold">{props.title}</p>
      {props.children ? <div className="mt-3 text-lg text-ink-muted">{props.children}</div> : null}
      {props.detail ? (
        <p className="mt-4 font-mono text-sm text-ink-faint">{props.detail}</p>
      ) : null}
    </div>
  );
}
