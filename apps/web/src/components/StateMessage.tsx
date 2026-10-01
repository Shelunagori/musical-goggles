import type { ReactNode } from 'react';

const TONES = {
  info: 'border-line text-ink-muted',
  success: 'border-ok/50 text-ok',
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
      className={`rounded-2xl border bg-panel/70 p-4 sm:p-5 ${tone}`}
    >
      <p className="text-base font-semibold">{props.title}</p>
      {props.children ? <div className="mt-2 text-sm text-ink-muted">{props.children}</div> : null}
      {props.detail ? (
        <p className="mt-4 font-mono text-sm text-ink-faint">{props.detail}</p>
      ) : null}
    </div>
  );
}
