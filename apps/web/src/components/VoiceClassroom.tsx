'use client';
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
    <section className="space-y-8">
      <div className="flex flex-wrap items-center gap-5">
        <button
          className="rounded-xl bg-accent px-8 py-5 text-2xl font-bold text-stage disabled:opacity-50"
          disabled={state === 'connecting'}
          onClick={() => (recording ? stopRecording.current() : void start())}
        >
          {recording ? 'Stop microphone' : 'Ask by voice'}
        </button>
        <span role="status" className="text-xl capitalize text-ink-muted">
          <StatusBadge state={state} />
          {recording && state !== 'listening' ? ' · microphone on' : ''}
        </span>
      </div>
      <p className="text-ink-muted">
        Speak in English, German or French. Audio is streamed to Deepgram for transcription and is
        not saved by this app.
      </p>
      <div
        aria-live="polite"
        className="min-h-32 rounded-2xl border border-line bg-panel p-8 text-3xl font-medium leading-relaxed md:text-5xl"
      >
        {transcript || 'Ask about an exercise or a correction.'}
      </div>
      {error && (
        <StateMessage tone="danger" title="Unable to continue">
          {error}
        </StateMessage>
      )}
      <details className="rounded-xl border border-line p-5">
        <summary className="cursor-pointer text-xl font-semibold">Type instead</summary>
        <form
          className="mt-5 flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void typedSearch();
          }}
        >
          <label className="w-full text-ink-muted" htmlFor="voice-query">
            Ask the same curriculum search
          </label>
          <input
            id="voice-query"
            required
            maxLength={1000}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Knees in during plié"
            className="min-w-0 flex-1 rounded-lg border border-line bg-stage p-4 text-2xl"
          />
          <button
            disabled={!query.trim() || state === 'searching'}
            className="rounded-lg bg-ink px-6 py-4 text-xl font-bold text-stage disabled:opacity-50"
          >
            Search
          </button>
        </form>
      </details>
      {result && (
        <div className="space-y-5">
          <p className="text-ink-muted">
            {result.query.detectedExercise?.name ?? 'All exercises'} ·{' '}
            {result.mode === 'hybrid' ? 'Hybrid retrieval' : 'Full-text retrieval'} · DEMO DATA
          </p>
          {!result.results.length && (
            <StateMessage title="No matching corrections">
              Try naming an exercise and body part.
            </StateMessage>
          )}
          {result.results.map(({ correction, exerciseName }) => (
            <article key={correction.id} className="rounded-2xl border border-line bg-panel p-8">
              <p className="mb-3 text-xl text-accent">
                {exerciseName} · {correction.errorName}
              </p>
              <h2 className="text-4xl font-bold md:text-5xl">{correction.cuePhrase}</h2>
              <p className="mt-5 text-2xl leading-relaxed">{correction.correction}</p>
            </article>
          ))}
          <TechnicalPanel>
            <p className="mt-4">Normalized: {result.query.normalizedQuery}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
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
    </section>
  );
}
