'use client';
import { MicIcon } from './icons';
import { TechnicalPanel } from './TechnicalPanel';
import { StatusBadge } from './StatusBadge';
import { StateMessage } from './StateMessage';

import { useEffect, useRef, useState } from 'react';
import {
  ApiErrorBodySchema,
  SearchResponseSchema,
  VoiceServerMessageSchema,
  type SearchResponse,
} from '@mg/shared';
import { config } from '@/lib/config';

type State =
  'idle' | 'connecting' | 'listening' | 'transcribing' | 'searching' | 'result' | 'error';
export function VoiceClassroom() {
  const [state, setState] = useState<State>('idle');
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const stopRecording = useRef<() => void>(() => {});
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      cleanup.current();
    },
    [],
  );

  async function start() {
    cleanup.current();
    const run = ++generation.current;
    setState('connecting');
    setError('');
    setTranscript('');
    setResult(null);
    let media: MediaStream | undefined;
    let socket: WebSocket | undefined;
    let recorder: MediaRecorder | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let stopping = false;
    let failed = false;
    let gotResult = false;
    let sends = Promise.resolve();
    const dispose = () => {
      disposed = true;
      clearTimeout(timer);
      if (recorder?.state === 'recording') recorder.stop();
      media?.getTracks().forEach((t) => t.stop());
      socket?.close();
    };
    cleanup.current = dispose;
    const fail = (message: string) => {
      if (run !== generation.current || disposed) return;
      failed = true;
      setError(message);
      setState('error');
      setRecording(false);
      dispose();
    };
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('Microphone recording is not supported here. Use Type instead.');
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed || run !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mimeType) throw new Error('No supported audio format. Use Type instead.');
      recorder = new MediaRecorder(media, { mimeType });
      const url = new URL(`${config.apiUrl}/voice`);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      timer = setTimeout(
        () => fail('Connection timed out. The API may be waking up; please try again.'),
        20_000,
      );
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'start', mimeType }));
      socket.onerror = () => fail('Could not connect to the voice service. Use Type instead.');
      socket.onclose = () => {
        if (disposed || run !== generation.current) return;
        if (!failed && !gotResult)
          fail(
            stopping
              ? 'No result received. Try again or type a question.'
              : 'Voice connection closed. Please try again.',
          );
        else {
          setRecording(false);
          dispose();
        }
      };
      recorder.ondataavailable = (event) => {
        sends = sends
          .then(async () => {
            if (!event.data.size || disposed) return;
            const bytes = await event.data.arrayBuffer();
            if (disposed || socket?.readyState !== WebSocket.OPEN) return;
            if (socket.bufferedAmount > 1024 * 1024) {
              fail('Connection too slow for audio. Use Type instead.');
              return;
            }
            socket.send(bytes);
          })
          .catch(() => fail('Audio could not be sent. Please retry.'));
      };
      recorder.onerror = () => fail('Microphone recording failed. Use Type instead.');
      recorder.onstop = () => {
        media?.getTracks().forEach((t) => t.stop());
        void sends.then(() => {
          if (!disposed && socket?.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: 'stop' }));
        });
      };
      stopRecording.current = () => {
        stopping = true;
        setRecording(false);
        setState('transcribing');
        if (recorder?.state === 'recording') recorder.stop();
      };
      socket.onmessage = (event) => {
        if (disposed || run !== generation.current) return;
        let value: unknown;
        try {
          value = JSON.parse(String(event.data));
        } catch {
          fail('Invalid voice response.');
          return;
        }
        const parsed = VoiceServerMessageSchema.safeParse(value);
        if (!parsed.success) {
          fail('Unexpected voice response.');
          return;
        }
        const message = parsed.data;
        switch (message.type) {
          case 'ready':
            clearTimeout(timer);
            try {
              recorder?.start(250);
              setRecording(true);
              setState('listening');
            } catch {
              fail('Could not start microphone recording. Use Type instead.');
            }
            break;
          case 'transcript':
            setTranscript(message.text);
            setState(message.final ? 'transcribing' : 'listening');
            break;
          case 'searching':
            setState('searching');
            break;
          case 'results':
            gotResult = true;
            setResult(message.data);
            setState('result');
            break;
          case 'error':
            fail(message.message);
            break;
          case 'metrics':
            break;
        }
      };
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Microphone unavailable.');
    }
  }

  async function typedSearch() {
    cleanup.current();
    setRecording(false);
    const run = ++generation.current;
    const controller = new AbortController();
    cleanup.current = () => controller.abort();
    setState('searching');
    setError('');
    setTranscript(query.trim());
    setResult(null);
    try {
      const response = await fetch(`${config.apiUrl}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ApiErrorBodySchema.safeParse(body);
        throw new Error(parsed.success ? parsed.data.error.message : 'Search request failed.');
      }
      const data = SearchResponseSchema.parse(body);
      if (run === generation.current) {
        setResult(data);
        setState('result');
      }
    } catch (err) {
      if (run === generation.current && !controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Search unavailable.');
        setState('error');
      }
    }
  }

  return (
    <section className="workspace-grid">
      <div className="preview-column space-y-4">
        <div className="surface surface-pad space-y-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Start a conversation</p>
            <span className="text-xs text-ink-faint">EN / DE / FR</span>
          </div>
          <div className="flex items-center gap-4 py-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
              <MicIcon className="h-7 w-7" />
            </span>
            <div>
              <h2 className="section-title">A question. A teaching cue.</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Name an exercise and what you’re noticing.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="button-primary min-h-14 px-6 text-base"
              disabled={state === 'connecting'}
              onClick={() => (recording ? stopRecording.current() : void start())}
            >
              <MicIcon className="h-5 w-5" />
              {recording ? 'Stop microphone' : 'Ask by voice'}
            </button>
            <span role="status" className="text-xs capitalize text-ink-muted">
              <StatusBadge state={state} />
              {recording && state !== 'listening' ? ' · microphone on' : ''}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ink-faint">
            Speak in English, German or French. Audio streams to Deepgram for transcription and is
            not saved by this app.
          </p>
          <p className="eyebrow text-ink-faint">Your words</p>
          <div
            aria-live="polite"
            className="min-h-36 rounded-2xl border border-line/80 bg-stage/50 p-5 text-2xl font-medium leading-relaxed sm:text-3xl"
          >
            {transcript || 'Ask about an exercise or a correction.'}
          </div>
          {error && (
            <StateMessage tone="danger" title="Unable to continue">
              {error}
            </StateMessage>
          )}
        </div>
        <details className="disclosure" open>
          <summary>Type instead</summary>
          <form
            className="flex flex-wrap gap-3 border-t border-line/70 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void typedSearch();
            }}
          >
            <label className="w-full text-xs text-ink-faint" htmlFor="voice-query">
              Ask the same curriculum search
            </label>
            <input
              id="voice-query"
              required
              maxLength={1000}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Knees in during plié"
              className="form-control flex-1"
            />
            <button disabled={!query.trim() || state === 'searching'} className="button-primary">
              Search
            </button>
          </form>
        </details>
      </div>
      <div className="insight-column">
        <div className="flex items-center justify-between">
          <h2 className="section-title">From the curriculum</h2>
          <span className="chip">Shared records</span>
        </div>
        {!result && (
          <div className="surface flex min-h-64 flex-col justify-center p-7">
            <p className="font-editorial text-3xl italic text-accent">
              Clarity starts with a question.
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
              Your matching correction cards will appear here. Try asking “knees in during plié” by
              voice or text.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <span className="chip">Exercise</span>
              <span className="chip">Correction</span>
              <span className="chip">Classroom cue</span>
            </div>
          </div>
        )}
        {result && (
          <div className="space-y-5">
            <p className="text-xs leading-relaxed text-ink-muted">
              {result.query.detectedExercise?.name ?? 'All exercises'} ·{' '}
              {result.mode === 'hybrid' ? 'Hybrid retrieval' : 'Full-text retrieval'} · DEMO DATA
            </p>
            {!result.results.length && (
              <StateMessage title="No matching corrections">
                Try naming an exercise and body part.
              </StateMessage>
            )}
            {result.results.map(({ correction, exerciseName }) => (
              <article key={correction.id} className="correction-card">
                <p className="mb-3 text-xs font-medium text-accent">
                  {exerciseName} · {correction.errorName}
                </p>
                <h2 className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
                  {correction.cuePhrase}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-ink-muted">
                  {correction.correction}
                </p>
              </article>
            ))}
            <TechnicalPanel>
              <p className="mt-4">Normalized: {result.query.normalizedQuery}</p>
              <dl className="metrics-grid">
                {Object.entries(result.metrics).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-ink-muted">
                      {
                        (
                          {
                            sttMs: 'STT delivery',
                            normalizationMs: 'Normalization',
                            searchMs: 'Search',
                            totalMs: 'Total',
                          } as Record<string, string>
                        )[key]
                      }
                    </dt>
                    <dd className="text-2xl">
                      {value === null ? 'Not used' : `${Math.round(value)} ms`}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-ink-muted">
                STT delivery measures final transcript arrival after the latest audio chunk; total
                adds retrieval time and excludes speaking duration.
              </p>
            </TechnicalPanel>
          </div>
        )}
      </div>
    </section>
  );
}
