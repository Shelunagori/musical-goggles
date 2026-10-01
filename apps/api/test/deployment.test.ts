import { once } from 'node:events';
import { Writable } from 'node:stream';
import pino from 'pino';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { buildApp, buildLoggerOptions } from '../src/app';
import { FakeRepo } from './fixtures';
import { SearchService } from '../src/search/service';
import pg from 'pg';

it('logs useful metadata without raw error details, bodies or authorization', async () => {
  let output = '';
  const logger = pino(
    buildLoggerOptions('info', false) as pino.LoggerOptions,
    new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    }),
  );
  const app = await buildApp({
    repo: new FakeRepo(
      { exercises: [], corrections: [] },
      Object.assign(new Error('postgres://user:secret@example.com/db'), {
        code: 'ECONNREFUSED',
        detail: 'sensitive row',
      }),
    ),
    corsOrigins: ['https://demo.example'],
    logger,
  });
  try {
    await app.inject({
      url: '/curriculum',
      headers: { authorization: 'Bearer secret-token', 'x-request-id': 'privacy-check' },
    });
    await app.inject('/health/ready');
    expect(output).toContain('privacy-check');
    expect(output).toContain('duration_ms');
    expect(output).toContain('ECONNREFUSED');
    expect(output).not.toMatch(/secret|sensitive row|postgres:\/\//);
  } finally {
    await app.close();
  }
});

it('enforces browser WebSocket origins, reports missing STT and closes sockets on shutdown', async () => {
  // No database queries occur: this exercises the actual WebSocket/missing-key boundary.
  const pool = new pg.Pool({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' });
  const app = await buildApp({
    repo: new FakeRepo({ exercises: [], corrections: [] }),
    corsOrigins: ['https://demo.example'],
    search: new SearchService(pool),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  const url = `ws://127.0.0.1:${address.port}/voice`;
  const sockets: WebSocket[] = [];
  try {
    const rejected = new WebSocket(url, { origin: 'https://other.example' });
    sockets.push(rejected);
    rejected.on('error', () => {});
    const [, response] = await once(rejected, 'unexpected-response');
    expect(response.statusCode).toBe(403);
    rejected.terminate();
    const socket = new WebSocket(url, { origin: 'https://demo.example' });
    sockets.push(socket);
    await once(socket, 'open');
    const message = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'start', mimeType: 'audio/webm;codecs=opus' }));
    const [data] = await message;
    expect(JSON.parse(String(data))).toMatchObject({ type: 'error', code: 'STT_UNAVAILABLE' });
    const idle = new WebSocket(url, { origin: 'https://demo.example' });
    sockets.push(idle);
    await once(idle, 'open');
    const closed = once(idle, 'close');
    await app.close();
    await closed;
  } finally {
    sockets.forEach((socket) => socket.terminate());
    await app.close();
    await pool.end();
  }
});
