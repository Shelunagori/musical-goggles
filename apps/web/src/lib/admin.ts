import {
  ApiErrorBodySchema,
  MutationResponseSchema,
  HealthResponseSchema,
  DemoSessionResponseSchema,
} from '@mg/shared';
import type { z } from 'zod';
import { config } from './config';

export class AdminRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  token: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const sessionRequest = path.startsWith('/demo-session');
  const timeout = AbortSignal.timeout(sessionRequest ? 75_000 : 30_000);
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/admin${path}`, {
      method,
      credentials: token ? 'omit' : 'include',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : { 'x-demo-admin': '1' }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      sessionRequest
        ? 'Could not confirm demo access. Check the API and retry; no curriculum change was requested.'
        : method === 'GET'
          ? 'Could not reach admin. Check the API and try again.'
          : 'The save response was interrupted. Reload the curriculum to check whether the change was applied before retrying.',
    );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(
      'The API returned an unreadable response. Reload the curriculum to check its current state.',
    );
  }
  if (!response.ok) {
    const error = ApiErrorBodySchema.safeParse(value);
    throw new AdminRequestError(
      error.success ? error.data.error.message : 'Admin request failed. Please retry.',
      response.status,
    );
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new Error('The API response was incomplete. Reload the curriculum before retrying.');
  return parsed.data;
}

export function adminRequest(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  token: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  return request(
    method === 'GET' ? HealthResponseSchema : MutationResponseSchema,
    path,
    method,
    token,
    body,
    signal,
  );
}
export function demoSessionRequest(action: 'status' | 'unlock' | 'logout', signal?: AbortSignal) {
  return request(
    DemoSessionResponseSchema,
    `/demo-session${action === 'logout' ? '/logout' : ''}`,
    action === 'status' ? 'GET' : 'POST',
    '',
    undefined,
    signal,
  );
}

export async function unlockDemoSession(signal?: AbortSignal) {
  await demoSessionRequest('unlock', signal);
  const confirmed = await demoSessionRequest('status', signal);
  if (!confirmed.active)
    throw new Error(
      'The browser did not retain the demo cookie. Allow cookies for this API or use a supported browser. Admin remains locked.',
    );
  return confirmed;
}
