'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ReadinessResponseSchema } from '@mg/shared';
import { fetchJson } from '@/lib/api';
import { config } from '@/lib/config';

type State =
  | { kind: 'checking' }
  | { kind: 'ok'; dbMs: number | null }
  | { kind: 'db_down' }
  | { kind: 'backend_down'; message: string };

/** Shared readiness check: visiting a page wakes the API without a keep-alive loop. */
export function BackendStatus() {
  const pathname = usePathname();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    const ctrl = new AbortController();
    let lastCheck = 0;
    let pending = false;
    async function check() {
      if (pending || ctrl.signal.aborted) return;
      pending = true;
      lastCheck = Date.now();
      setState({ kind: 'checking' });
      try {
        const r = await fetchJson(config.apiUrl, '/health/ready', ReadinessResponseSchema, {
          signal: ctrl.signal,
          timeoutMs: 90_000,
        });
        if (ctrl.signal.aborted) return;
        if (r.ok) setState({ kind: 'ok', dbMs: r.data.database_latency_ms });
        else if (r.kind === 'api_error' && r.status === 503) setState({ kind: 'db_down' });
        else setState({ kind: 'backend_down', message: r.message });
      } catch {
        // Unmount/navigation cancels the request.
      } finally {
        pending = false;
      }
    }
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60_000) {
        void check();
      }
    }
    void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ctrl.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname, attempt]);

  const view = {
    checking: { dot: 'bg-warn', label: 'Connecting · waking API if asleep…' },
    ok: { dot: 'bg-ok', label: 'Backend + database online' },
    db_down: { dot: 'bg-warn', label: 'Backend online · database unavailable' },
    backend_down: { dot: 'bg-danger', label: 'Backend unavailable' },
  }[state.kind];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
        <span className={`h-2.5 w-2.5 rounded-full ${view.dot}`} aria-hidden />
        <span title={state.kind === 'backend_down' ? state.message : undefined}>{view.label}</span>
      </span>
      {state.kind === 'checking' ? (
        <span className="text-ink-faint">Cold starts can take about a minute.</span>
      ) : (
        <button
          type="button"
          className="rounded-full border border-line px-3 py-1.5 text-ink hover:bg-panel-raised focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {state.kind === 'ok' ? 'Check connection' : 'Wake / retry services'}
        </button>
      )}
    </div>
  );
}
