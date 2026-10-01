'use client';

import { useEffect, useState } from 'react';
import { ReadinessResponseSchema } from '@mg/shared';
import { fetchJson } from '@/lib/api';
import { config } from '@/lib/config';

type State =
  | { kind: 'checking' }
  | { kind: 'ok'; dbMs: number | null }
  | { kind: 'db_down' }
  | { kind: 'backend_down'; message: string };

/** Small footer indicator. Uses /health/ready so a down database is distinguishable from a down API. */
export function BackendStatus() {
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    const ctrl = new AbortController();
    fetchJson(config.apiUrl, '/health/ready', ReadinessResponseSchema, {
      signal: ctrl.signal,
      timeoutMs: 60_000,
    })
      .then((r) => {
        if (r.ok) setState({ kind: 'ok', dbMs: r.data.database_latency_ms });
        else if (r.kind === 'api_error' && r.status === 503) setState({ kind: 'db_down' });
        else setState({ kind: 'backend_down', message: r.message });
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const view = {
    checking: { dot: 'bg-ink-faint', label: 'Checking backend…' },
    ok: { dot: 'bg-ok', label: 'Backend + database online' },
    db_down: { dot: 'bg-warn', label: 'Backend online · database unavailable' },
    backend_down: { dot: 'bg-danger', label: 'Backend unavailable' },
  }[state.kind];

  return (
    <span
      className="inline-flex items-center gap-2 text-sm text-ink-muted"
      role="status"
      aria-live="polite"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${view.dot}`} aria-hidden />
      <span title={state.kind === 'backend_down' ? state.message : undefined}>{view.label}</span>
    </span>
  );
}
