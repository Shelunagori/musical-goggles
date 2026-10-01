import WebSocket from 'ws';
import { z } from 'zod';

const ResultSchema = z.object({
  type: z.literal('Results'),
  is_final: z.boolean(),
  speech_final: z.boolean().optional(),
  start: z.number(),
  duration: z.number(),
  channel: z.object({ alternatives: z.array(z.object({ transcript: z.string() })) }),
});
export interface SpeechEvents {
  ready(): void;
  transcript(text: string, final: boolean): void;
  utterance(text: string): void;
  error(code: string, message: string): void;
  closed(): void;
}
export interface SpeechStream {
  audio(data: Buffer): void;
  stop(): void;
  close(): void;
}
export type SpeechFactory = (events: SpeechEvents) => SpeechStream;

/** Suppress retransmitted segments and repeated utterances within one recording. */
export class FinalTranscripts {
  private segments = new Set<string>();
  private utterances = new Set<string>();
  private pending: string[] = [];
  add(text: string, segmentId: string, speechFinal: boolean): string | null {
    if (text.trim() && !this.segments.has(segmentId)) {
      this.segments.add(segmentId);
      this.pending.push(text.trim());
    }
    return speechFinal ? this.flush() : null;
  }
  flush(): string | null {
    const text = this.pending.join(' ').trim();
    this.pending = [];
    const key = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    if (!key || this.utterances.has(key)) return null;
    this.utterances.add(key);
    return text;
  }
}

export function deepgramFactory(key?: string): SpeechFactory {
  return (events) => {
    if (!key) {
      queueMicrotask(() =>
        events.error('STT_UNAVAILABLE', 'Deepgram is not configured. Use Type instead.'),
      );
      return { audio() {}, stop() {}, close() {} };
    }
    const url = new URL('wss://api.deepgram.com/v1/listen');
    for (const [k, v] of Object.entries({
      model: 'nova-3',
      language: 'multi',
      interim_results: 'true',
      endpointing: '500',
      utterance_end_ms: '1000',
      smart_format: 'true',
    }))
      url.searchParams.set(k, v);
    for (const term of [
      'plié',
      'demi-plié',
      'tendu',
      'dégagé',
      'rond de jambe',
      'port de bras',
      'relevé',
      'passé',
      'retiré',
      'grand battement',
    ])
      url.searchParams.append('keyterm', term);
    const ws = new WebSocket(url, {
      headers: { Authorization: `Token ${key}` },
      handshakeTimeout: 10_000,
      maxPayload: 1024 * 1024,
    });
    const finals = new FinalTranscripts();
    let stopping = false;
    let failed = false;
    let receivedText = false;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const fail = (code: string, message: string) => {
      if (!failed) {
        failed = true;
        events.error(code, message);
      }
    };
    const flush = () => {
      const text = finals.flush();
      if (text) events.utterance(text);
    };
    const keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN && !stopping)
        ws.send(JSON.stringify({ type: 'KeepAlive' }));
    }, 4000);
    ws.on('open', () => events.ready());
    ws.on('message', (raw) => {
      let value: unknown;
      try {
        value = JSON.parse(raw.toString());
      } catch {
        fail('STT_PROTOCOL', 'Invalid speech service response.');
        return;
      }
      const parsed = ResultSchema.safeParse(value);
      if (parsed.success) {
        const r = parsed.data;
        const text = r.channel.alternatives[0]?.transcript ?? '';
        if (text.trim()) {
          receivedText = true;
          events.transcript(text, r.is_final);
        }
        if (r.is_final) {
          const utterance = finals.add(text, `${r.start}:${r.duration}`, r.speech_final ?? false);
          if (utterance) events.utterance(utterance);
          clearTimeout(flushTimer);
          // A finalized segment may arrive without endpointing; never search interim tokens.
          flushTimer = setTimeout(flush, 1500);
        }
      } else if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type === 'UtteranceEnd') flush();
        else if (value.type === 'Error') fail('STT_FAILED', 'Speech service rejected the stream.');
        else if (value.type === 'Results') fail('STT_PROTOCOL', 'Malformed speech result.');
      }
    });
    ws.on('error', () =>
      fail('STT_CONNECTION', 'Could not connect to the speech service. Use Type instead.'),
    );
    ws.on('close', () => {
      clearInterval(keepAlive);
      clearTimeout(flushTimer);
      clearTimeout(closeTimer);
      if (stopping) {
        flush();
        if (!receivedText) fail('EMPTY_TRANSCRIPT', 'No speech was recognized. Please try again.');
      } else fail('STT_DISCONNECTED', 'Speech service disconnected. Please try again.');
      events.closed();
    });
    return {
      audio(data) {
        if (ws.readyState !== WebSocket.OPEN || stopping) return;
        if (ws.bufferedAmount > 1024 * 1024) {
          fail('STT_BACKPRESSURE', 'Speech connection is too slow. Please retry.');
          ws.close();
          return;
        }
        ws.send(data);
      },
      stop() {
        stopping = true;
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
        else ws.close();
        closeTimer = setTimeout(() => ws.terminate(), 5000);
      },
      close() {
        stopping = true;
        clearInterval(keepAlive);
        clearTimeout(flushTimer);
        clearTimeout(closeTimer);
        ws.terminate();
      },
    };
  };
}
