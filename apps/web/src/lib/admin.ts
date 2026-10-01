import { ApiErrorBodySchema, MutationResponseSchema, HealthResponseSchema } from '@mg/shared';
import { config } from './config';

export async function adminRequest(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  token: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/admin${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      method === 'GET'
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
    throw new Error(
      error.success ? error.data.error.message : 'Admin request failed. Please retry.',
    );
  }
  const parsed =
    method === 'GET'
      ? HealthResponseSchema.safeParse(value)
      : MutationResponseSchema.safeParse(value);
  if (!parsed.success)
    throw new Error('The API response was incomplete. Reload the curriculum before retrying.');
  return parsed.data;
}
