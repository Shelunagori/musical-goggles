'use client';
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
    <section className="space-y-7">
      <p className="rounded-2xl border border-ok/40 bg-panel p-6 text-xl font-semibold text-ok">
        Camera analysis runs locally in your browser.
      </p>
      {catalogLoading && (
        <p role="status">Loading curriculum detectors… A sleeping API may take up to a minute.</p>
      )}
      {catalogError && (
        <div role="alert" className="text-danger">
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
        </div>
      )}
      <div className="flex flex-wrap items-end gap-5">
        <div className="min-w-64 flex-1">
          <label htmlFor="live-exercise" className="mb-3 block text-xl font-semibold">
            Analyze as
          </label>
          <select
            id="live-exercise"
            className="w-full rounded-xl border border-line bg-panel p-4 text-2xl"
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
          className="rounded-xl bg-accent px-7 py-4 text-xl font-bold text-stage disabled:opacity-40"
        >
          Start camera
        </button>
        <button
          onClick={() => session.current?.stop()}
          disabled={!busy}
          className="rounded-xl border border-line px-7 py-4 text-xl disabled:opacity-40"
        >
          Stop camera
        </button>
      </div>
      <p className="text-lg text-ink-muted">
        Use a fixed, level camera facing one dancer. Keep ears, shoulders, hips, knees and ankles
        visible. Exercise selection is manual. These experimental 2D cues do not establish correct
        ballet technique.
      </p>
      {needsCalibration && (
        <p className="rounded-xl border border-warn/50 p-5 text-xl">
          Before moving: face the camera, relax your shoulders and hold still for 1.5 seconds. Keep
          ears and shoulders visible. Calibration restarts each session; if it cannot finish within
          30 seconds, reposition and retry.
        </p>
      )}
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video
          ref={video}
          muted
          playsInline
          className="block min-h-48 w-full"
          aria-label="Local camera preview"
        />
        <canvas
          ref={canvas}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      </div>
      <label className="text-lg">
        <input
          type="checkbox"
          className="mr-2"
          checked={overlay}
          onChange={(event) => setOverlay(event.target.checked)}
        />
        Pose overlay
      </label>
      <div
        role={state === 'error' ? 'alert' : 'status'}
        className={state === 'error' ? 'rounded-xl border border-danger p-5 text-danger' : ''}
      >
        <p className="text-2xl font-semibold capitalize">{state.replace('_', ' ')}</p>
        {message && <p className="mt-2 text-xl">{message}</p>}
      </div>
      <section
        aria-label="Current corrections"
        aria-live="polite"
        className="rounded-2xl border border-line bg-panel p-7"
      >
        <h2 className="text-2xl font-semibold">Current detection</h2>
        <p className="mt-3 text-lg text-ink-muted">
          {busy ? liveSignal(frame) : 'Camera analysis is inactive.'}
        </p>
        {corrections.length ? (
          corrections.map((correction) => (
            <article key={correction.id} className="mt-6 border-t border-line pt-6">
              <p className="text-2xl text-accent">{correction.errorName}</p>
              <h3 className="mt-3 text-4xl font-bold sm:text-6xl">{correction.cuePhrase}</h3>
              <p className="mt-4 text-2xl">{correction.correction}</p>
            </article>
          ))
        ) : (
          <p className="mt-5 text-2xl">
            {state === 'calibrating'
              ? 'Waiting for a relaxed shoulder baseline.'
              : 'No active correction.'}
          </p>
        )}
      </section>
      <details className="rounded-xl border border-line p-5">
        <summary className="cursor-pointer text-xl">Technical details</summary>
        <dl className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-3">
          {[
            [
              'Processing FPS',
              metrics.elapsedMs ? ((metrics.frames * 1000) / metrics.elapsedMs).toFixed(1) : '—',
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
              needsCalibration ? (frame?.calibrated ? 'Ready' : 'Not established') : 'Not required',
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
          Visibility is not correction certainty. Sessions stop after ten minutes or when this tab
          is hidden; start again to recalibrate. No frames are uploaded, stored or logged. Worker
          network policy blocks MediaPipe telemetry.
        </p>
      </details>
    </section>
  );
}
