import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors';

export const DEMO_SESSION_TTL_MS = 45 * 60_000;
const COOKIE_NAME = 'mg_demo_admin';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** One-process demo store. Restarting the API revokes all sessions. No admin token involved. */
export class DemoSessions {
  private readonly sessions = new Map<string, { origin: string; expiresAt: number }>();
  private readonly limits = new Map<string, { until: number; count: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  limit(kind: 'issue' | 'write') {
    const now = this.now();
    const limit = this.limits.get(kind);
    if (!limit || limit.until <= now) {
      this.limits.set(kind, { until: now + 60_000, count: 1 });
    } else if (++limit.count > (kind === 'issue' ? 20 : 60)) {
      throw new AppError('RATE_LIMITED', 'Demo admin is busy. Wait one minute and try again.', 429);
    }
  }
  issue(origin: string) {
    this.limit('issue');
    for (const [key, session] of this.sessions)
      if (session.expiresAt <= this.now()) this.sessions.delete(key);
    if (this.sessions.size >= 500)
      throw new AppError('RATE_LIMITED', 'Demo session capacity reached. Try again later.', 429);
    const id = randomBytes(32).toString('hex');
    const expiresAt = this.now() + DEMO_SESSION_TTL_MS;
    this.sessions.set(digest(id), { origin, expiresAt });
    return { id, expiresAt };
  }
  validate(id: string | undefined, origin: string) {
    if (!id || !/^[a-f0-9]{64}$/.test(id)) return null;
    const key = digest(id);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(key);
      return null;
    }
    return session.origin === origin ? session : null;
  }
  revoke(id: string | undefined) {
    if (id) this.sessions.delete(digest(id));
  }
  clear() {
    this.sessions.clear();
    this.limits.clear();
  }
}

export function demoCookieId(request: FastifyRequest) {
  const values = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  // Reject ambiguous duplicate cookies rather than choosing one.
  return values.length === 1 ? values[0]?.slice(COOKIE_NAME.length + 1) : undefined;
}
export function demoCookie(id: string, production: boolean) {
  return `${COOKIE_NAME}=${id}; Path=/admin; HttpOnly; Max-Age=${id ? DEMO_SESSION_TTL_MS / 1000 : 0}; ${production ? 'Secure; SameSite=None; Partitioned' : 'SameSite=Lax'}`;
}
export function requireDemoOrigin(request: FastifyRequest, allowed: string[]) {
  const origin = request.headers.origin;
  if (!origin || !allowed.includes(origin) || request.headers['x-demo-admin'] !== '1')
    throw new AppError(
      'UNAUTHORIZED',
      'Demo admin requires an allowed browser origin and request header.',
      403,
    );
  return origin;
}
