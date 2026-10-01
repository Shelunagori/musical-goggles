import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import {
  SearchRequestSchema,
  VoiceAudioFrameSchema,
  MAX_AUDIO_FRAME_BYTES,
  VoiceClientMessageSchema,
  VoiceServerMessageSchema,
  type VoiceServerMessage,
} from '@mg/shared';
import { AppError } from '../errors';
import type { SearchService } from '../search/service';
import type { SpeechFactory, SpeechStream } from '../voice/deepgram';

export async function voiceRoutes(
  app: FastifyInstance,
  search: SearchService,
  speechFactory: SpeechFactory,
  origins: string[],
) {
  await app.register(websocket, { options: { maxPayload: MAX_AUDIO_FRAME_BYTES } });
  app.post('/search', async (request) => {
    const parsed = SearchRequestSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError('BAD_REQUEST', 'Query must contain 1–1000 characters.', 400);
    const data = await search.search(parsed.data.query);
    request.log.info(
      {
        search_mode: data.mode,
        search_ms: data.metrics.searchMs,
        normalization_ms: data.metrics.normalizationMs,
        total_ms: data.metrics.totalMs,
        result_count: data.results.length,
      },
      'typed retrieval completed',
    );
    return data;
  });
  app.get(
    '/voice',
    {
      websocket: true,
      preValidation: async (request) => {
        if (request.headers.origin && !origins.includes(request.headers.origin))
          throw new AppError('BAD_REQUEST', 'Origin not allowed', 403);
      },
    },
    (socket, request) => {
      let stream: SpeechStream | undefined;
      let state: 'idle' | 'connecting' | 'listening' | 'stopping' = 'idle';
      let pending: Promise<void> = Promise.resolve();
      let startedAt = performance.now();
      let lastAudioAt = startedAt;
      let lastSpeechAt = startedAt;
      let searches = 0;
      const send = (message: VoiceServerMessage) => {
        if (socket.readyState === 1)
          socket.send(JSON.stringify(VoiceServerMessageSchema.parse(message)));
      };
      const fail = (code: string, message: string) => {
        send({ type: 'error', code, message });
        stream?.close();
        socket.close(1000);
      };
      const deadline = setTimeout(
        () => fail('SESSION_TIMEOUT', 'Recording limit reached. Start a new recording.'),
        120_000,
      );
      const silence = setInterval(() => {
        if (state === 'listening' && performance.now() - lastSpeechAt > 30_000)
          fail('SILENCE', 'No speech was recognized. Please try again or type a question.');
      }, 1000);
      socket.on('close', () => {
        clearTimeout(deadline);
        clearInterval(silence);
        stream?.close();
      });
      socket.on('error', () => {
        stream?.close();
      });
      socket.on('message', (raw, binary) => {
        if (binary) {
          if (state !== 'listening') {
            fail('BAD_STATE', 'Start recording before sending audio.');
            return;
          }
          const bytes = Array.isArray(raw)
            ? Buffer.concat(raw)
            : Buffer.isBuffer(raw)
              ? raw
              : Buffer.from(raw);
          if (!VoiceAudioFrameSchema.safeParse(bytes).success) {
            fail('BAD_AUDIO', 'Invalid audio frame size.');
            return;
          }
          lastAudioAt = performance.now();
          stream?.audio(bytes);
          return;
        }
        let value: unknown;
        try {
          value = JSON.parse(raw.toString());
        } catch {
          fail('BAD_MESSAGE', 'Expected a JSON control message.');
          return;
        }
        const parsed = VoiceClientMessageSchema.safeParse(value);
        if (!parsed.success) {
          fail('BAD_MESSAGE', 'Invalid voice message.');
          return;
        }
        if (parsed.data.type === 'ping') {
          socket.pong();
          return;
        }
        if (parsed.data.type === 'stop') {
          if (state !== 'listening') {
            fail('BAD_STATE', 'No active recording.');
            return;
          }
          state = 'stopping';
          stream?.stop();
          return;
        }
        if (state !== 'idle') {
          fail('BAD_STATE', 'Recording already started.');
          return;
        }
        state = 'connecting';
        startedAt = performance.now();
        stream = speechFactory({
          ready() {
            if (socket.readyState !== 1) return;
            state = 'listening';
            send({ type: 'ready' });
          },
          transcript(text, final) {
            lastSpeechAt = performance.now();
            send({ type: 'transcript', text, final });
          },
          utterance(text) {
            if (socket.readyState !== 1) return;
            if (text.length > 1000) {
              fail('QUERY_TOO_LONG', 'Please ask a shorter question.');
              return;
            }
            if (++searches > 20) {
              fail('SESSION_LIMIT', 'Please start a new recording.');
              return;
            }
            lastSpeechAt = performance.now();
            const sttMs = performance.now() - lastAudioAt;
            pending = pending.then(async () => {
              if (socket.readyState !== 1) return;
              send({ type: 'transcript', text, final: true });
              send({ type: 'searching' });
              try {
                const data = await search.search(text);
                data.metrics.sttMs = sttMs;
                data.metrics.totalMs += sttMs;
                send({ type: 'results', data });
                send({ type: 'metrics', data: data.metrics });
                request.log.info(
                  { stt_ms: sttMs, search_ms: data.metrics.searchMs },
                  'voice retrieval completed',
                );
              } catch {
                fail('SEARCH_FAILED', 'Search is unavailable. Please try again.');
              }
            });
          },
          error: fail,
          closed() {
            void pending.finally(() => socket.close(1000));
          },
        });
      });
    },
  );
}
