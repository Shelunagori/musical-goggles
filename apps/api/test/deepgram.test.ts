import type { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const boundary = vi.hoisted(() => ({ socket: undefined as unknown, url: '' }));
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class Socket extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    sent: unknown[] = [];
    constructor(url: URL) {
      super();
      boundary.socket = this;
      boundary.url = url.toString();
    }
    send(data: unknown) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
      this.emit('close');
    }
    terminate() {
      this.close();
    }
  }
  return { default: Socket };
});
import { deepgramFactory } from '../src/voice/deepgram';
function setup() {
  const events = {
    ready: vi.fn(),
    transcript: vi.fn(),
    utterance: vi.fn(),
    error: vi.fn(),
    closed: vi.fn(),
  };
  const stream = deepgramFactory('test-server-key')(events);
  const socket = boundary.socket as EventEmitter & { sent: unknown[]; close(): void };
  return { events, stream, socket };
}
function result(text: string, final: boolean, speechFinal = false) {
  return Buffer.from(
    JSON.stringify({
      type: 'Results',
      start: 0,
      duration: 1,
      is_final: final,
      speech_final: speechFinal,
      channel: { alternatives: [{ transcript: text }] },
    }),
  );
}
describe('Deepgram boundary', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it('requests multilingual Nova-3 with keyterms, suppresses interim searches and duplicate finals', () => {
    const { events, stream, socket } = setup();
    const url = new URL(boundary.url);
    expect(url.searchParams.get('model')).toBe('nova-3');
    expect(url.searchParams.get('language')).toBe('multi');
    expect(url.searchParams.getAll('keyterm')).toContain('plié');
    expect(boundary.url).not.toContain('test-server-key');
    socket.emit('open');
    expect(events.ready).toHaveBeenCalledOnce();
    socket.emit('message', result('knees', false));
    expect(events.utterance).not.toHaveBeenCalled();
    socket.emit('message', result('knees in plie', true, true));
    socket.emit('message', result('knees in plie', true, true));
    expect(events.utterance).toHaveBeenCalledExactlyOnceWith('knees in plie');
    stream.close();
  });
  it.each(['error', 'close'])('reports connection %s without fabricating results', (event) => {
    const { events, stream, socket } = setup();
    socket.emit(event);
    expect(events.error).toHaveBeenCalledOnce();
    expect(events.utterance).not.toHaveBeenCalled();
    stream.close();
  });
  it('reports malformed results and empty stopped streams', () => {
    const first = setup();
    first.socket.emit('message', Buffer.from('{broken'));
    expect(first.events.error).toHaveBeenCalledWith('STT_PROTOCOL', expect.any(String));
    first.stream.close();
    const second = setup();
    second.stream.stop();
    second.socket.close();
    expect(second.events.error).toHaveBeenCalledWith('EMPTY_TRANSCRIPT', expect.any(String));
  });
  it('flushes finalized segments on stop and sends CloseStream after audio', () => {
    const { events, stream, socket } = setup();
    stream.audio(Buffer.from([1, 2]));
    socket.emit('message', result('port de bras', true));
    stream.stop();
    socket.close();
    expect(events.utterance).toHaveBeenCalledWith('port de bras');
    expect(socket.sent[1]).toBe(JSON.stringify({ type: 'CloseStream' }));
    expect(events.error).not.toHaveBeenCalled();
  });
});
