'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CurriculumResponseSchema,
  type ExerciseDto,
  type ExerciseInput,
  type CorrectionInput,
} from '@mg/shared';
import { fetchJson } from '@/lib/api';
import {
  adminRequest,
  AdminRequestError,
  demoSessionRequest,
  unlockDemoSession,
} from '@/lib/admin';
import { config } from '@/lib/config';
import { StateMessage } from './StateMessage';
import { CorrectionForm, ExerciseForm } from './AdminForms';

type Editor =
  { kind: 'exercise'; id?: string } | { kind: 'correction'; exerciseId: string; id?: string };
export function CurriculumAdmin() {
  const [token, setToken] = useState('');
  const [demoEnabled, setDemoEnabled] = useState<boolean | null>(null);
  const [demoExpiresAt, setDemoExpiresAt] = useState<number | null>(null);
  const [accessError, setAccessError] = useState('');
  const unlocked = Boolean(token || demoExpiresAt);
  const [exercises, setExercises] = useState<ExerciseDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const requests = useRef(new AbortController());
  const selected = exercises.find((exercise) => exercise.id === selectedId);
  const load = useCallback(async () => {
    setLoading(true);
    const signal = requests.current.signal;
    try {
      const response = await fetchJson(config.apiUrl, '/curriculum', CurriculumResponseSchema, {
        signal,
        timeoutMs: 75_000,
      });
      if (!response.ok) throw new Error(response.message);
      setExercises(response.data.exercises);
      setSelectedId((id) =>
        response.data.exercises.some((e) => e.id === id)
          ? id
          : (response.data.exercises[0]?.id ?? ''),
      );
      return true;
    } catch (err) {
      if (!signal.aborted)
        setError(err instanceof Error ? err.message : 'Curriculum could not load.');
      return false;
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    requests.current = new AbortController();
    void load();
    void checkDemo(requests.current.signal);
    return () => requests.current.abort();
  }, [load]);
  useEffect(() => {
    if (editor) heading.current?.focus();
  }, [editor]);
  useEffect(() => {
    if (!demoExpiresAt) return;
    const timer = setTimeout(
      () => {
        setDemoExpiresAt(null);
        setEditor(null);
        setDeleting(null);
        setNotice('Demo session expired. Unlock demo admin again to continue.');
      },
      Math.max(0, demoExpiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [demoExpiresAt]);
  async function checkDemo(signal: AbortSignal) {
    setAccessError('');
    try {
      const session = await demoSessionRequest('status', signal);
      if (signal.aborted) return;
      setDemoEnabled(session.enabled);
      setDemoExpiresAt(session.active ? session.expiresAt : null);
    } catch {
      if (!signal.aborted)
        setAccessError('Could not check demo access. Retry when the API is ready.');
    }
  }
  async function unlockDemo() {
    setBusy(true);
    setError('');
    try {
      const session = await unlockDemoSession(requests.current.signal);
      setDemoExpiresAt(session.expiresAt);
      setNotice('Demo admin active. This session lasts up to 45 minutes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock demo admin.');
    } finally {
      setBusy(false);
    }
  }
  async function lock() {
    setBusy(true);
    setError('');
    try {
      if (demoExpiresAt) await demoSessionRequest('logout', requests.current.signal);
      setToken('');
      setDemoExpiresAt(null);
      setEditor(null);
      setDeleting(null);
      setNotice('Admin locked.');
    } catch {
      setError(
        'Logout could not be confirmed. Retry Lock admin; the session may still be active until it expires.',
      );
    } finally {
      setBusy(false);
    }
  }
  function handleWriteError(err: unknown, fallback: string) {
    if (err instanceof AdminRequestError && (err.status === 401 || err.status === 403)) {
      setToken('');
      setDemoExpiresAt(null);
      setEditor(null);
      setDeleting(null);
    }
    setError(err instanceof Error ? err.message : fallback);
  }
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = String(new FormData(event.currentTarget).get('token') ?? '');
    setBusy(true);
    setError('');
    try {
      await adminRequest('/status', 'GET', candidate, undefined, requests.current.signal);
      setToken(candidate);
      setNotice('Admin unlocked for this page only.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock admin.');
    } finally {
      setBusy(false);
    }
  }
  async function save(input: ExerciseInput | CorrectionInput) {
    if (!editor || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const path =
        editor.kind === 'exercise'
          ? `/exercises${editor.id ? `/${editor.id}` : ''}`
          : editor.id
            ? `/corrections/${editor.id}`
            : `/exercises/${editor.exerciseId}/corrections`;
      const saved = await adminRequest(
        path,
        editor.id ? 'PUT' : 'POST',
        token,
        input,
        requests.current.signal,
      );
      if (editor.kind === 'exercise' && 'id' in saved) setSelectedId(saved.id);
      setEditor(null);
      setNotice(
        'Saved. Text search is available immediately. Reload classroom modes to load the updated curriculum.',
      );
      await load();
    } catch (err) {
      handleWriteError(err, 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await adminRequest(
        `/corrections/${deleting}`,
        'DELETE',
        token,
        undefined,
        requests.current.signal,
      );
      setDeleting(null);
      setNotice('Correction deleted from the shared curriculum.');
      await load();
    } catch (err) {
      handleWriteError(err, 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }
  function edit(value: Editor) {
    setEditor(value);
    setDeleting(null);
    setError('');
    setNotice('');
  }
  return (
    <section className="space-y-5">
      {error && (
        <StateMessage tone="danger" title="Action could not be completed">
          {error}
        </StateMessage>
      )}
      {notice && <StateMessage tone="success" title={notice} />}
      <div className="admin-layout">
        <aside className="admin-sidebar surface surface-pad" aria-label="Admin controls">
          <div>
            <p className="eyebrow">Workspace access</p>
            <h2 className="mt-2 text-xl font-medium">
              {demoExpiresAt
                ? 'Demo admin active'
                : token
                  ? 'Ready to edit'
                  : 'Unlock your curriculum'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Shared records. One place to keep every classroom mode consistent.
            </p>
          </div>
          {(demoEnabled || demoExpiresAt) && (
            <p className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm text-warn">
              Demo admin — changes affect the shared demo curriculum.
            </p>
          )}
          {!unlocked && demoEnabled === null && !accessError && (
            <p role="status" className="text-sm text-ink-muted">
              Checking demo access…
            </p>
          )}
          {accessError && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-warn">
                {accessError}
              </p>
              <button
                className="button-secondary"
                onClick={() => void checkDemo(requests.current.signal)}
              >
                Retry access check
              </button>
            </div>
          )}
          {!unlocked && demoEnabled && (
            <button
              className="button-primary w-full"
              disabled={busy}
              onClick={() => void unlockDemo()}
            >
              {busy ? 'Checking…' : 'Unlock demo admin'}
            </button>
          )}
          {!unlocked ? (
            <details className="disclosure" open={demoEnabled === false}>
              <summary>Private admin · manual token</summary>
              <form onSubmit={(event) => void unlock(event)} className="disclosure-body space-y-4">
                <label className="grid gap-2">
                  <span>Admin token</span>
                  <input
                    name="token"
                    type="password"
                    autoComplete="off"
                    required
                    minLength={32}
                    maxLength={256}
                    className="form-control"
                  />
                </label>
                <p className="text-sm text-ink-muted">
                  Use the token configured on your API server. It stays in page memory and is
                  cleared on reload or lock.
                </p>
                <button disabled={busy} className="button-primary">
                  {busy ? 'Checking…' : 'Unlock admin'}
                </button>
              </form>
            </details>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                disabled={busy || Boolean(editor)}
                className="button-primary"
                onClick={() => edit({ kind: 'exercise' })}
              >
                Create exercise
              </button>
              <button disabled={busy} className="button-secondary" onClick={() => void lock()}>
                Lock admin
              </button>
            </div>
          )}
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <label className="grid min-w-0 flex-1 gap-2">
              <span>Exercise</span>
              <select
                className="form-control"
                value={selectedId}
                disabled={busy || loading || Boolean(editor)}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setDeleting(null);
                }}
              >
                {!exercises.length && <option value="">No exercises</option>}
                {exercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button-secondary"
              disabled={busy || loading || Boolean(editor)}
              onClick={() => {
                setError('');
                void load();
              }}
            >
              Reload curriculum
            </button>
          </div>
          <div className="rounded-xl border border-aqua/20 bg-aqua/5 p-4 text-xs leading-relaxed text-ink-muted">
            <p className="mb-1 font-medium text-aqua">One change, every mode.</p>Text search updates
            immediately. Reload video and camera to use the latest records.
          </div>
        </aside>
        <div className="min-w-0 space-y-4">
          {loading && (
            <StateMessage title="Loading curriculum…">
              A sleeping API may take up to a minute.
            </StateMessage>
          )}
          {!loading && !exercises.length && (
            <StateMessage title="No exercises yet">
              Unlock admin and create the first exercise.
            </StateMessage>
          )}
          {editor && unlocked ? (
            <section className="surface surface-pad">
              <h2 ref={heading} tabIndex={-1} className="mb-5 text-2xl font-medium">
                {editor.id ? 'Edit' : 'Create'} {editor.kind}
              </h2>
              {editor.kind === 'exercise' ? (
                <ExerciseForm
                  key={`exercise:${editor.id ?? 'new'}`}
                  exercise={exercises.find((e) => e.id === editor.id)}
                  busy={busy}
                  onSave={(input) => void save(input)}
                  onCancel={() => setEditor(null)}
                />
              ) : (
                <CorrectionForm
                  key={`correction:${editor.id ?? 'new'}`}
                  correction={exercises
                    .find((e) => e.id === editor.exerciseId)
                    ?.corrections.find((c) => c.id === editor.id)}
                  busy={busy}
                  onSave={(input) => void save(input)}
                  onCancel={() => setEditor(null)}
                />
              )}
            </section>
          ) : (
            selected && (
              <section className="surface surface-pad space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="font-editorial text-3xl font-normal">{selected.name}</h2>
                  {unlocked && (
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => edit({ kind: 'exercise', id: selected.id })}
                      >
                        Edit exercise
                      </button>
                      <button
                        className="button-primary"
                        disabled={busy}
                        onClick={() => edit({ kind: 'correction', exerciseId: selected.id })}
                      >
                        Create correction
                      </button>
                    </div>
                  )}
                </div>
                {!selected.corrections.length && (
                  <StateMessage title="No corrections yet">
                    Add a correction to make this exercise available to retrieval.
                  </StateMessage>
                )}
                <ul className="space-y-3">
                  {selected.corrections.map((correction) => (
                    <li
                      key={correction.id}
                      className="rounded-xl border border-line/70 bg-stage/40 p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-medium text-ink-faint">
                            {correction.errorName}
                          </h3>
                          <p className="mt-2 text-xl font-medium text-accent">
                            {correction.cuePhrase}
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                            {correction.correction}
                          </p>
                          <p className="mt-3 text-xs text-ink-faint">
                            {correction.hasEmbedding
                              ? 'Embedding available'
                              : 'Embedding pending backfill'}{' '}
                            ·{' '}
                            {correction.detector?.rule.replaceAll('_', ' ') ?? 'No camera detector'}
                          </p>
                        </div>
                        {unlocked && (
                          <div className="flex gap-3">
                            <button
                              className="button-secondary"
                              disabled={busy}
                              aria-label={`Edit ${correction.errorName}`}
                              onClick={() =>
                                edit({
                                  kind: 'correction',
                                  exerciseId: selected.id,
                                  id: correction.id,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              className="button-secondary text-danger"
                              disabled={busy}
                              aria-label={`Delete ${correction.errorName}`}
                              onClick={() => setDeleting(correction.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      {deleting === correction.id && (
                        <div role="alert" className="mt-5 space-y-4 border-t border-danger/50 pt-5">
                          <p>
                            Delete “{correction.errorName}” from voice, video and camera? This
                            cannot be undone.
                          </p>
                          <div className="flex gap-3">
                            <button
                              className="button-secondary text-danger"
                              disabled={busy}
                              onClick={() => void remove()}
                            >
                              {busy ? 'Deleting…' : 'Confirm delete'}
                            </button>
                            <button
                              className="button-secondary"
                              disabled={busy}
                              onClick={() => setDeleting(null)}
                            >
                              Keep correction
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          )}
        </div>
      </div>
    </section>
  );
}
