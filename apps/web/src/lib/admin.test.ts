import { afterEach, expect, it, vi } from 'vitest';
import { adminRequest } from './admin';
afterEach(() => vi.unstubAllGlobals());
it('uses memory-supplied authorization without browser credential persistence', async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000001' })),
  );
  vi.stubGlobal('fetch', fetcher);
  await adminRequest('/exercises', 'POST', 'test-token', { name: 'Test' });
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('/admin/exercises'),
    expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      body: '{"name":"Test"}',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    }),
  );
});
it('shows API errors and does not automatically repeat an ambiguous write', async () => {
  const fetcher = vi.fn(async () => {
    throw new Error('network');
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(adminRequest('/corrections/id', 'DELETE', 'token')).rejects.toThrow(
    'check whether the change was applied',
  );
  expect(fetcher).toHaveBeenCalledOnce();
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Admin token is missing or invalid.',
            requestId: 'test',
          },
        }),
        { status: 401 },
      ),
  );
  await expect(adminRequest('/status', 'GET', 'wrong')).rejects.toThrow('token');
});
it('maps non-JSON and incomplete success responses to actionable errors', async () => {
  vi.stubGlobal('fetch', async () => new Response('<html>Unavailable</html>', { status: 502 }));
  await expect(adminRequest('/exercises', 'POST', 'token')).rejects.toThrow('unreadable');
  vi.stubGlobal('fetch', async () => new Response('{}'));
  await expect(adminRequest('/exercises', 'POST', 'token')).rejects.toThrow('incomplete');
});

it('uses cookie credentials and a preflight header for demo writes, never a bearer token', async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000001' })),
  );
  vi.stubGlobal('fetch', fetcher);
  await adminRequest('/exercises', 'POST', '', { name: 'Demo' });
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('/admin/exercises'),
    expect.objectContaining({
      credentials: 'include',
      headers: { 'x-demo-admin': '1', 'content-type': 'application/json' },
    }),
  );
});

it('confirms cookie round-trip before unlocking and handles blocked cookies honestly', async () => {
  const { unlockDemoSession } = await import('./admin');
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ enabled: true, active: true, expiresAt: Date.now() + 1000 })),
  );
  vi.stubGlobal('fetch', fetcher);
  expect((await unlockDemoSession()).active).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls).toEqual([
    [
      expect.stringContaining('/admin/demo-session'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'x-demo-admin': '1' },
      }),
    ],
    [
      expect.stringContaining('/admin/demo-session'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: { 'x-demo-admin': '1' },
      }),
    ],
  ]);
  vi.stubGlobal(
    'fetch',
    async () => new Response(JSON.stringify({ enabled: true, active: false, expiresAt: null })),
  );
  await expect(unlockDemoSession()).rejects.toThrow('did not retain');
});

it('sends logout to the API, rejects disabled/expired access, and does not persist secrets', async () => {
  const { demoSessionRequest, AdminRequestError } = await import('./admin');
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ enabled: true, active: false, expiresAt: null })),
  );
  vi.stubGlobal('fetch', fetcher);
  expect((await demoSessionRequest('logout')).active).toBe(false);
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('/admin/demo-session/logout'),
    expect.objectContaining({ method: 'POST', credentials: 'include' }),
  );
  for (const status of [401, 503]) {
    vi.stubGlobal('fetch', async () => new Response('{}', { status }));
    await expect(demoSessionRequest('unlock')).rejects.toBeInstanceOf(AdminRequestError);
  }
});
