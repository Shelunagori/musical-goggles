import type { z } from 'zod';
import { ApiErrorBodySchema, type ApiErrorCode } from '@mg/shared';

export type ApiFailureKind = 'unreachable' | 'timeout' | 'api_error' | 'bad_response';

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: ApiFailureKind;
      message: string;
      code?: ApiErrorCode;
      requestId?: string;
      status?: number;
    };

export interface FetchJsonOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch + validate against the shared contract. Never throws: every failure
 * becomes a typed result the UI can render as a specific, honest state.
 */
export async function fetchJson<S extends z.ZodType>(
  baseUrl: string,
  path: string,
  schema: S,
  { timeoutMs = 15_000, signal, fetchImpl = fetch }: FetchJsonOptions = {},
): Promise<ApiResult<z.infer<S>>> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}${path}`, {
      signal: combined,
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    if (timeout.aborted) {
      return {
        ok: false,
        kind: 'timeout',
        message: `The backend did not answer within ${Math.round(timeoutMs / 1000)} s.`,
      };
    }
    if (signal?.aborted) throw err; // caller cancelled (e.g. unmount) — let them ignore it
    return { ok: false, kind: 'unreachable', message: `Cannot reach the backend at ${baseUrl}.` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      kind: 'bad_response',
      status: res.status,
      message: `Backend returned non-JSON (HTTP ${res.status}).`,
    };
  }

  if (!res.ok) {
    const parsed = ApiErrorBodySchema.safeParse(body);
    if (parsed.success) {
      return {
        ok: false,
        kind: 'api_error',
        status: res.status,
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        requestId: parsed.data.error.requestId,
      };
    }
    return {
      ok: false,
      kind: 'api_error',
      status: res.status,
      message: `Backend error (HTTP ${res.status}).`,
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'bad_response',
      status: res.status,
      message: 'Backend response did not match the expected contract.',
    };
  }
  return { ok: true, data: parsed.data };
}
