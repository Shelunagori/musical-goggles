import { expect, it } from 'vitest';
import { apiUrl } from './api-url';

it('requires an explicit production API and permits explicit localhost smoke builds', () => {
  expect(apiUrl(undefined, false)).toBe('http://localhost:4000');
  expect(apiUrl('http://localhost:4100/', true)).toBe('http://localhost:4100');
  expect(apiUrl('https://demo.onrender.com/', true)).toBe('https://demo.onrender.com');
  expect(() => apiUrl(undefined, true)).toThrow('Set NEXT_PUBLIC_API_URL');
});
it.each([
  'http://remote.example',
  'wss://remote.example',
  'https://user:secret@example.com',
  'https://example.com/api',
  'https://example.com?key=secret',
  'https://example.com#secret',
  '*',
])('rejects unsafe production configuration without printing its value: %s', (value) => {
  expect(() => apiUrl(value, true)).toThrow('HTTP(S) origin');
  try {
    apiUrl(value, true);
  } catch (error) {
    expect(String(error)).not.toContain('secret');
  }
});
