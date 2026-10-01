import { expect, it } from 'vitest';
import {
  VoiceAudioFrameSchema,
  VoiceClientMessageSchema,
  VoiceServerMessageSchema,
  SearchRequestSchema,
} from './voice';
it('validates the strict client protocol', () => {
  for (const message of [
    { type: 'start', mimeType: 'audio/webm;codecs=opus' },
    { type: 'stop' },
    { type: 'ping' },
  ])
    expect(VoiceClientMessageSchema.safeParse(message).success).toBe(true);
  for (const message of [
    { type: 'start' },
    { type: 'audio', data: 'secret' },
    { type: 'stop', extra: 1 },
    { type: 'start', mimeType: 'video/webm' },
  ])
    expect(VoiceClientMessageSchema.safeParse(message).success).toBe(false);
});
it('validates server states and rejects malformed payloads', () => {
  expect(
    VoiceServerMessageSchema.safeParse({ type: 'transcript', text: 'plié', final: false }).success,
  ).toBe(true);
  expect(
    VoiceServerMessageSchema.safeParse({ type: 'transcript', text: 123, final: true }).success,
  ).toBe(false);
  expect(VoiceServerMessageSchema.safeParse({ type: 'results', data: {} }).success).toBe(false);
  expect(SearchRequestSchema.safeParse({ query: '   ' }).success).toBe(false);
  expect(SearchRequestSchema.safeParse({ query: 'a'.repeat(1001) }).success).toBe(false);
});

it('validates binary audio without accepting text or empty/oversized frames', () => {
  expect(VoiceAudioFrameSchema.safeParse(new Uint8Array([1])).success).toBe(true);
  for (const value of ['', new Uint8Array(), new Uint8Array(262145)])
    expect(VoiceAudioFrameSchema.safeParse(value).success).toBe(false);
});
