'use client';
import { useEffect, useRef, useState } from 'react';
import { CurriculumResponseSchema, type ExerciseDto } from '@mg/shared';
import type { DetectionEvent } from '@mg/pose-engine';
import { config } from '@/lib/config';
import { fetchJson } from '@/lib/api';
import { detectorBindings } from '@/lib/pose/taxonomy';
import { analyzeVideo, type AnalysisSummary } from '@/lib/pose/video-analysis';
import { drawOverlay } from '@/lib/pose/overlay';
import type { FrameAnalysis } from '@/lib/pose/protocol';

const timeLabel = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')}:${((ms / 1000) % 60).toFixed(1).padStart(4, '0')}`;
const EMPTY_METRICS: AnalysisSummary = {
  analyzedFrames: 0,
  elapsedMs: 0,
  inferenceMs: 0,
  detectorMs: 0,
  measurableFrames: 0,
  noPersonFrames: 0,
};
type Status = 'idle' | 'loading_model' | 'analyzing' | 'complete' | 'cancelled' | 'error';
export function VideoClassroom() {
  const [exercises, setExercises] = useState<ExerciseDto[]>([]);
  const [exerciseId, setExerciseId] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [currentMs, setCurrentMs] = useState(0);
  const [frame, setFrame] = useState<FrameAnalysis | null>(null);
  const [overlay, setOverlay] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frames = useRef<FrameAnalysis[]>([]);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const busy = status === 'loading_model' || status === 'analyzing';
  const exercise = exercises.find((e) => e.id === exerciseId);
  const bindings = exercise ? detectorBindings(exercise) : [];
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
        const supported = result.data.exercises.filter((e) => detectorBindings(e).length);
        setExercises(supported);
        setExerciseId(supported[0]?.id ?? '');
        if (!supported.length)
          setCatalogError('No exercises currently have supported video detectors.');
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [attempt]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
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

  function reset() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    video.current?.pause();
    frames.current = [];
    setFrame(null);
    setEvents([]);
    setMetrics(EMPTY_METRICS);
    setProgress(0);
    setError('');
    setStatus('idle');
    setCurrentMs(0);
    if (video.current && ready) video.current.currentTime = 0;
  }
  function choose(file: File | undefined) {
    if (!file) return;
    reset();
    setReady(false);
    setUrl('');
    setFilename('');
    if (
      (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) ||
      file.size === 0
    ) {
      setError('Choose a nonempty video file, such as MP4 or WebM.');
      setStatus('error');
      return;
    }
    setFilename(file.name);
    setUrl(URL.createObjectURL(file));
  }
  function cancel() {
    generation.current++;
    controller.current?.abort();
    video.current?.pause();
    const last = frames.current.at(-1)?.timestampMs ?? 0;
    setEvents((previous) =>
      previous.map((e) => (e.endMs === null ? { ...e, endMs: last, endReason: 'cancelled' } : e)),
    );
    setStatus('cancelled');
  }
  async function start() {
    if (!video.current || !ready || !bindings.length) return;
    reset();
    const run = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setStatus('loading_model');
    try {
      const result = await analyzeVideo(
        video.current,
        bindings,
        abort.signal,
        (next, pct, stats) => {
          if (run !== generation.current) return;
          frames.current.push({ ...next, events: [] });
          setFrame(next);
          setCurrentMs(next.timestampMs);
          setEvents(next.events);
          setProgress(pct);
          setMetrics(stats);
          setStatus('analyzing');
        },
      );
      if (run !== generation.current) return;
      setEvents(result.events);
      setMetrics(result.metrics);
      setStatus('complete');
      if (result.metrics.noPersonFrames === result.metrics.analyzedFrames)
        setError('No person was detected. Use a well-lit clip with one person fully visible.');
      else if (result.metrics.measurableFrames === 0)
        setError(
          'No reliable detector measurements: check framing, landmark visibility and the relaxed shoulder baseline.',
        );
    } catch (err) {
      if (run !== generation.current) return;
      setError(err instanceof Error ? err.message : 'Video analysis failed.');
      setStatus('error');
      const last = frames.current.at(-1)?.timestampMs ?? 0;
      setEvents((previous) =>
        previous.map((e) =>
          e.endMs === null ? { ...e, endMs: last, endReason: 'tracking_lost' } : e,
        ),
      );
    }
  }
  function syncPlayback() {
    if (busy || !video.current) return;
    const ms = video.current.currentTime * 1000;
    setCurrentMs(ms);
    const sample = frames.current.findLast((f) => f.timestampMs <= ms);
    setFrame(sample && ms - sample.timestampMs < 250 ? sample : null);
  }
  const active = events.filter(
    (e) => currentMs >= e.startMs && (e.endMs === null || currentMs < e.endMs),
  );
  const activeIds = new Set(active.map((e) => e.correctionId));
  const currentCorrections = exercise?.corrections.filter((c) => activeIds.has(c.id)) ?? [];
  const signalMessage = !frame
    ? 'No sampled pose at this time.'
    : frame.poseStatus === 'multiple_people'
      ? 'Multiple people detected — use a clip with one dancer.'
      : frame.poseStatus === 'no_person'
        ? 'No person detected in this frame.'
        : frame.evaluations.some((e) => e.status === 'calibrating')
          ? 'Calibrating shoulders — remain relaxed and still for 1.5 seconds.'
          : frame.evaluations.every((e) => e.status === 'insufficient_confidence')
            ? 'Insufficient landmark visibility or unsupported camera angle.'
            : frame.evaluations.some((e) => e.status === 'insufficient_confidence')
              ? 'One side has insufficient visibility; only visible measurements are evaluated.'
              : 'Pose is measurable. Warnings require sustained geometry.';
  return (
    <section className="space-y-7">
      <div className="rounded-2xl border border-ok/40 bg-panel p-6">
        <p className="text-xl font-semibold text-ok">Your video stays on this device.</p>
        <p className="mt-2 text-ink-muted">
          Frames are analyzed in a browser worker. No video or frame is uploaded or stored on our
          server. Only the pose model and curriculum are downloaded.
        </p>
      </div>
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
              setAttempt((a) => a + 1);
            }}
          >
            Retry curriculum
          </button>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <label
          className="rounded-xl border-2 border-dashed border-line p-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            choose(event.dataTransfer.files[0]);
          }}
        >
          <span className="mb-3 block text-xl font-semibold">Choose or drop a local video</span>
          <input
            type="file"
            accept="video/*"
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
            className="w-full text-lg"
          />
          <span className="mt-3 block text-sm text-ink-muted">
            MP4 or WebM recommended · maximum 5 minutes
          </span>
        </label>
        <div>
          <label className="mb-3 block text-xl font-semibold" htmlFor="video-exercise">
            Analyze as
          </label>
          <select
            id="video-exercise"
            className="w-full rounded-lg border border-line bg-panel p-4 text-2xl"
            value={exerciseId}
            disabled={busy || !exercises.length}
            onChange={(event) => {
              reset();
              setExerciseId(event.target.value);
            }}
          >
            {exercises.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <p className="mt-3 text-ink-muted">
            Manual exercise context. No movement classification or ballet score.
          </p>
        </div>
      </div>
      <p className="text-lg text-ink-muted">
        Use a fixed, level, front-facing camera with one dancer’s ears, shoulders, hips, knees and
        ankles visible. For port de bras, begin with at least 1.5 seconds of still, relaxed
        shoulders. These geometric cues are a prototype, not an authoritative assessment of
        technique.
      </p>
      <p className="text-ink-muted">
        Available: knee alignment and calibrated shoulder elevation. Heel-lift detection is
        unavailable because this view cannot reliably separate heel motion from foot rotation and
        camera perspective.
      </p>
      {url && (
        <div>
          <p className="mb-3 break-all text-ink-muted">{filename}</p>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={video}
              src={url}
              controls={!busy}
              muted
              playsInline
              className="block w-full"
              onLoadedMetadata={() => {
                const duration = video.current?.duration ?? 0;
                if (!Number.isFinite(duration) || duration <= 0 || duration > 300) {
                  setError('Choose a playable video up to 5 minutes long.');
                  setReady(false);
                  setStatus('error');
                } else {
                  setReady(true);
                  setError('');
                }
              }}
              onError={() => {
                controller.current?.abort();
                setReady(false);
                setError('Unsupported or corrupt video. Try a playable MP4 (H.264) or WebM file.');
                setStatus('error');
              }}
              onTimeUpdate={syncPlayback}
              onSeeked={syncPlayback}
            />
            <canvas
              ref={canvas}
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button
          disabled={!ready || !bindings.length || busy}
          onClick={() => void start()}
          className="rounded-xl bg-accent px-7 py-4 text-xl font-bold text-stage disabled:opacity-40"
        >
          Start analysis
        </button>
        {busy && (
          <button onClick={cancel} className="rounded-xl border border-line px-7 py-4 text-xl">
            Stop analysis
          </button>
        )}
        <button onClick={reset} className="rounded-xl border border-line px-7 py-4 text-xl">
          Reset analysis
        </button>
        <label className="text-lg">
          <input
            type="checkbox"
            checked={overlay}
            onChange={(event) => setOverlay(event.target.checked)}
            className="mr-2"
          />
          Pose overlay
        </label>
      </div>
      <div aria-live="polite">
        <p className="text-xl capitalize">
          {status.replace('_', ' ')}
          {status === 'cancelled' ? ' — partial results retained.' : ''}
        </p>
        {busy && (
          <p className="text-ink-muted">
            {status === 'loading_model'
              ? 'Loading MediaPipe and its model; first use needs a download.'
              : `${metrics.analyzedFrames} frames analyzed`}
          </p>
        )}
      </div>
      <progress
        value={progress}
        max={1}
        aria-label="Analysis progress"
        className="h-3 w-full accent-accent"
      />
      {error && (
        <p role="alert" className="rounded-xl border border-danger p-5 text-xl text-danger">
          {error}
        </p>
      )}
      <section
        className="rounded-2xl border border-line bg-panel p-7"
        aria-label="Current corrections"
      >
        <h2 className="text-2xl font-semibold">At {timeLabel(currentMs)}</h2>
        <p className="mt-3 text-ink-muted">{signalMessage}</p>
        {currentCorrections.length ? (
          currentCorrections.map((c) => (
            <article key={c.id} className="mt-6 border-t border-line pt-6">
              <p className="text-xl text-accent">{c.errorName}</p>
              <h3 className="mt-2 text-4xl font-bold">{c.cuePhrase}</h3>
              <p className="mt-4 text-2xl">{c.correction}</p>
            </article>
          ))
        ) : (
          <p className="mt-5 text-2xl">
            No active warning. This does not establish correct technique.
          </p>
        )}
      </section>
      <section aria-label="Detection timeline">
        <h2 className="mb-4 text-3xl font-semibold">Detection timeline</h2>
        {!events.length && (
          <p className="text-ink-muted">
            {metrics.analyzedFrames
              ? 'No sustained detector events in analyzed frames.'
              : 'Analyze a clip to create a timeline.'}{' '}
            Unmeasurable frames are not treated as alignment OK.
          </p>
        )}
        <ol className="space-y-3">
          {events.map((event) => {
            const correction = exercise?.corrections.find((c) => c.id === event.correctionId);
            return (
              <li key={event.id}>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (video.current) {
                      video.current.pause();
                      video.current.currentTime = event.startMs / 1000;
                    }
                  }}
                  className={`w-full rounded-xl border p-5 text-left disabled:opacity-70 ${active.some((e) => e.id === event.id) ? 'border-accent bg-panel-raised' : 'border-line bg-panel'}`}
                >
                  <span className="font-mono text-lg">
                    {timeLabel(event.startMs)}–
                    {event.endMs === null ? 'active' : timeLabel(event.endMs)}
                  </span>
                  <span className="ml-5 text-xl font-semibold">
                    {correction?.errorName ?? 'Correction unavailable'} · {event.side}
                  </span>
                  {event.endReason === 'tracking_lost' && (
                    <span className="ml-3 text-warn">Tracking lost</span>
                  )}
                  {event.endReason === 'cancelled' && (
                    <span className="ml-3 text-warn">Cancelled</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <details className="rounded-xl border border-line p-5">
        <summary className="cursor-pointer text-xl">Technical details</summary>
        <dl className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-3">
          {[
            ['Analyzed frames', metrics.analyzedFrames],
            [
              'Processing FPS',
              metrics.elapsedMs
                ? ((metrics.analyzedFrames * 1000) / metrics.elapsedMs).toFixed(1)
                : '—',
            ],
            [
              'Mean MediaPipe inference',
              metrics.analyzedFrames
                ? `${(metrics.inferenceMs / metrics.analyzedFrames).toFixed(1)} ms`
                : '—',
            ],
            [
              'Mean detector evaluation',
              metrics.analyzedFrames
                ? `${(metrics.detectorMs / metrics.analyzedFrames).toFixed(2)} ms`
                : '—',
            ],
            ['Generated events', events.length],
            ['Measurable frames', metrics.measurableFrames],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-ink-muted">
          10 Hz media-time sampling; one in-flight frame, maximum 960 px input. Processing FPS
          includes decoding and excludes model download. Landmark visibility is not a probability
          that a correction is needed.
        </p>
      </details>
    </section>
  );
}
