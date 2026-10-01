'use client';
import { Disclosure } from './Disclosure';
import { CameraIcon } from './icons';
import { TechnicalPanel } from './TechnicalPanel';
import { StatusBadge } from './StatusBadge';
import { StateMessage } from './StateMessage';
import { useEffect, useRef, useState } from 'react';
import { CurriculumResponseSchema, type ExerciseDto } from '@mg/shared';
import { config } from '@/lib/config';
import { fetchJson } from '@/lib/api';
import { detectorBindings } from '@/lib/pose/taxonomy';
import { LiveCameraSession, emptyLiveMetrics, type CameraState } from '@/lib/pose/live-camera';
import { liveCorrections, liveSignal } from '@/lib/pose/live-view';
import { drawOverlay } from '@/lib/pose/overlay';
import type { FrameAnalysis } from '@/lib/pose/protocol';

export function LiveClassroom() {
  const [exercises, setExercises] = useState<ExerciseDto[]>([]);
  const [exerciseId, setExerciseId] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CameraState>('idle');
  const [message, setMessage] = useState('Choose an exercise, then start the camera.');
  const [frame, setFrame] = useState<FrameAnalysis | null>(null);
  const [metrics, setMetrics] = useState(emptyLiveMetrics);
  const [overlay, setOverlay] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const session = useRef<LiveCameraSession | null>(null);
  const generation = useRef(0);
  const busy = ['requesting', 'loading_model', 'calibrating', 'analyzing'].includes(state);
  const exercise = exercises.find((item) => item.id === exerciseId);
  const bindings = exercise ? detectorBindings(exercise) : [];
  const needsCalibration = bindings.some(
    (binding) => binding.detector.rule === 'shoulder_elevation',
  );
  const corrections = liveCorrections(exercise, frame);

  useEffect(() => {
    const abort = new AbortController();
    fetchJson(config.apiUrl, '/curriculum', CurriculumResponseSchema, {
      signal: abort.signal,
      timeoutMs: 75_000,
    })
      .then((result) => {
        if (abort.signal.aborted) return;
        setCatalogLoading(false);
        if (!result.ok) {
          setCatalogError(result.message);
          return;
        }
        const supported = result.data.exercises.filter((item) => detectorBindings(item).length);
        setExercises(supported);
        setExerciseId(supported[0]?.id ?? '');
        if (!supported.length)
          setCatalogError('No exercises currently have supported camera detectors.');
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setCatalogLoading(false);
          setCatalogError('Curriculum could not be loaded. Please retry.');
        }
      });
    return () => abort.abort();
  }, [attempt]);
  useEffect(
    () => () => {
      generation.current++;
      session.current?.stop();
    },
    [],
  );
  useEffect(() => {
    if (canvas.current && video.current)
      drawOverlay(
        canvas.current,
        overlay ? (frame?.landmarks ?? []) : [],
        video.current.videoWidth || 640,
        video.current.videoHeight || 360,
      );
  }, [frame, overlay]);

  function start() {
    if (!video.current || !bindings.length || busy) return;
    generation.current++;
    session.current?.stop();
    const run = generation.current;
    setFrame(null);
    setMetrics(emptyLiveMetrics());
    session.current = new LiveCameraSession(video.current, {
      onState: (next, text) => {
        if (run === generation.current) {
          setState(next);
          setMessage(text ?? '');
        }
      },
      onFrame: (next, latest) => {
        if (run === generation.current) {
          setFrame(next);
          setMetrics(latest);
        }
      },
    });
    void session.current.start(bindings);
  }
  return (
    <section className="space-y-4">
      {catalogLoading && (
        <StateMessage title="Loading curriculum…">
          A sleeping API may take up to a minute.
        </StateMessage>
      )}
      {catalogError && (
        <StateMessage tone="danger" title="Curriculum unavailable">
          {catalogError}{' '}
          <button
            className="underline"
            onClick={() => {
              setCatalogError('');
              setCatalogLoading(true);
              setAttempt((value) => value + 1);
            }}
          >
            Retry curriculum
          </button>
        </StateMessage>
      )}
      <div className="workspace-grid">
        <div className="preview-column surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="eyebrow">Camera studio</p>
            <span className="chip text-aqua">Local processing</span>
          </div>
          <div className="preview-stage">
            <span className="preview-label">Live preview · unmirrored</span>
            {!busy && !frame && (
              <div className="preview-empty">
                <CameraIcon />
                <h2 className="text-xl font-medium">Your private practice space</h2>
                <p className="max-w-xs text-sm text-ink-muted">
                  Select an exercise and start your camera when you’re ready.
                </p>
              </div>
            )}
            <video
              ref={video}
              muted
              playsInline
              className="block h-full w-full object-contain"
              aria-label="Local camera preview"
            />
            <canvas
              ref={canvas}
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="col-span-2">
                <label htmlFor="live-exercise" className="mb-2 block text-sm font-semibold">
                  Analyze as
                </label>
                <select
                  id="live-exercise"
                  className="form-control"
                  value={exerciseId}
                  disabled={busy || !exercises.length}
                  onChange={(event) => {
                    setExerciseId(event.target.value);
                    setFrame(null);
                    setMetrics(emptyLiveMetrics());
                  }}
                >
                  {exercises.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={start}
                disabled={busy || !bindings.length}
                className="button-primary"
              >
                Start camera
              </button>
              <button
                onClick={() => session.current?.stop()}
                disabled={!busy}
                className="button-secondary"
              >
                Stop camera
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-h-11 items-center text-xs text-ink-muted">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={overlay}
                  onChange={(event) => setOverlay(event.target.checked)}
                />
                Pose overlay
              </label>
              <p className="privacy-note text-xs">No frames leave this device.</p>
            </div>
          </div>
        </div>
        <div className="insight-column">
          <div
            role={state === 'error' ? 'alert' : 'status'}
            className={`surface p-5 ${state === 'error' ? 'border-danger/50 text-danger' : ''}`}
          >
            <StatusBadge state={state} />
            {message && <p className="mt-3 text-sm leading-relaxed">{message}</p>}
          </div>
          {needsCalibration && (
            <p className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm leading-relaxed text-warn">
              Before moving: face the camera, relax your shoulders and hold still for 1.5 seconds.
              Keep ears and shoulders visible. Calibration restarts each session; if it cannot
              finish within 30 seconds, reposition and retry.
            </p>
          )}
          <Disclosure title="Feedback · current corrections" open>
            <div aria-label="Current corrections" aria-live="polite">
              <h2 className="text-sm font-medium text-ink">Current detection</h2>
              <p className="mt-2 text-sm text-ink-muted">
                {busy ? liveSignal(frame) : 'Camera analysis is inactive.'}
              </p>
              {corrections.length ? (
                corrections.map((correction) => (
                  <article key={correction.id} className="correction-card mt-4">
                    <p className="text-xs text-accent">{correction.errorName}</p>
                    <h3 className="correction-cue">{correction.cuePhrase}</h3>
                    <p className="mt-3 text-base leading-relaxed text-ink-muted">
                      {correction.correction}
                    </p>
                  </article>
                ))
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-base text-ink-muted">
                  {state === 'calibrating'
                    ? 'Waiting for a relaxed shoulder baseline.'
                    : 'No active correction.'}
                </p>
              )}
            </div>
          </Disclosure>
          <TechnicalPanel>
            <dl className="metrics-grid">
              {[
                [
                  'Processing FPS',
                  metrics.elapsedMs
                    ? ((metrics.frames * 1000) / metrics.elapsedMs).toFixed(1)
                    : '—',
                ],
                [
                  'Mean inference',
                  metrics.frames ? `${(metrics.inferenceMs / metrics.frames).toFixed(1)} ms` : '—',
                ],
                [
                  'Mean detector evaluation',
                  metrics.frames ? `${(metrics.detectorMs / metrics.frames).toFixed(2)} ms` : '—',
                ],
                ['Analyzed frames', metrics.frames],
                ['Skipped sampling slots', metrics.skipped],
                [
                  'Minimum landmark visibility',
                  frame?.evaluations.length
                    ? Math.min(...frame.evaluations.map((item) => item.quality)).toFixed(2)
                    : '—',
                ],
                ['Active correction records', corrections.length],
                [
                  'Calibration',
                  needsCalibration
                    ? frame?.calibrated
                      ? 'Ready'
                      : 'Not established'
                    : 'Not required',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="text-2xl">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-ink-muted">
              {frame?.evaluations
                .map((item) => `${item.rule} (${item.side}): ${item.status}`)
                .join(' · ') || 'No current detector measurements.'}
            </p>
            <p className="mt-4 text-ink-muted">
              10 Hz target, one in-flight frame, maximum 960 px input. FPS excludes model loading.
              Visibility is not correction certainty. Sessions stop after ten minutes or when this
              tab is hidden; start again to recalibrate. No frames are uploaded, stored or logged.
              Worker network policy blocks MediaPipe telemetry.
            </p>
          </TechnicalPanel>
          <Disclosure title="Studio guide · setup & privacy">
            <p className="text-sm text-ink-muted">
              Use a fixed, level camera facing one dancer. Keep ears, shoulders, hips, knees and
              ankles visible. Exercise selection is manual. These experimental 2D cues do not
              establish correct ballet technique.
            </p>
            <p>
              Camera analysis runs locally in your browser. Stopping, leaving the page or hiding the
              tab releases camera tracks. Only model assets and the curriculum are downloaded.
            </p>
          </Disclosure>
        </div>
      </div>
    </section>
  );
}
