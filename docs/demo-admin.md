# Public demo admin sessions

This is intentionally public CRUD access to a shared demo curriculum, not production authentication. Anyone able to reach the enabled endpoint can obtain a session. Origin checks prevent browser CSRF; they do not identify a reviewer or stop a non-browser client spoofing Origin. Keep this disabled for private/production curriculum.

## Session and authorization

- New API-only setting: `DEMO_ADMIN_ENABLED=false` by default. No new secret or frontend variable is required. Demo sessions do not depend on, derive from or return `ADMIN_API_TOKEN`.
- `GET /admin/demo-session`: `{enabled, active, expiresAt}`. No session ID in JSON. Used for availability, reload recovery and cookie round-trip confirmation.
- `POST /admin/demo-session`: enabled mode only; generates 32 random bytes, returns an HttpOnly cookie and expiry metadata. Rotates/revokes the current cookie session.
- `POST /admin/demo-session/logout`: revokes the server entry and expires the cookie. Idempotent, also clears a cookie when demo mode is disabled.
- `/admin/status` and all existing CRUD routes accept either the existing valid Bearer token or a valid demo cookie. Manual-token calls omit cookie credentials and retain constant-time credential comparison.
- Sessions last 45 minutes with no sliding renewal. Only SHA-256 session hashes, expiry and issuing frontend origin are stored, in API memory. Restart/sleep/redeploy loses sessions. Maximum 500 live entries; expired entries are pruned. One API instance is required; multiple instances would need a shared store.
- Server-side, process-wide fixed-window limits: 20 issuances/minute and 60 demo writes/minute. Limits cannot be bypassed by forging an IP header. They are deliberately shared by reviewers, do not apply to manual-token access, and are not DDoS protection. Rejections return 429 and Retry-After. Logout is not rate-limited.
- No reset/seed/SQL endpoint or exercise deletion added. Existing strict validation, transactional writes, delete confirmation and taxonomy/search behavior remain unchanged.

## Cookies, CORS and CSRF

Production uses `mg_demo_admin=<opaque-id>; Path=/admin; HttpOnly; Max-Age=2700; Secure; SameSite=None; Partitioned`, with no Domain attribute. SameSite=None is needed for Vercel → Render (different sites); Secure requires HTTPS. Partitioned enables supporting browsers to isolate the cookie under the top-level frontend site. The API also binds the session to its issuing Origin.

Local development uses HttpOnly, SameSite=Lax and no Secure/Partitioned so `http://localhost:3000` → `http://localhost:4000` works. Use the same hostname for both. `NODE_ENV=production` always selects Secure, and enabled demo mode refuses non-HTTPS origins at startup.

CORS allows credentials and only exact configured origins; no wildcard. Every demo issue/logout and cookie-authorized CRUD request must carry an exact allowed `Origin` and `X-Demo-Admin: 1`. This custom header forces a preflight on cross-origin calls and prevents simple HTML form CSRF. Checking Origin server-side is essential because CORS alone does not stop requests from executing.

Admin demo fetches use `credentials: "include"`; public voice/search/media flows are unchanged. JavaScript cannot access the cookie. Cookies, Authorization and Set-Cookie are not included in operational logs. All admin/session responses use Cache-Control: no-store.

Browser policy may still reject cross-site cookies. The UI checks the session with a second request before unlocking and shows a cookie error if it was not retained. It does not expose the private token as a fallback. For browsers with strict blocking, use same-site custom frontend/API domains (both HTTPS), or explicitly permit the demo API's cookies. Do not weaken Secure or broaden CORS. Private manual-token access remains a separate collapsed form; reviewers do not need it.

## Exact Render/Vercel changes (not deployed by this task)

1. Render API: keep `NODE_ENV=production`; set `DEMO_ADMIN_ENABLED=true` only when public editing is intended. The checked-in Blueprint defaults it to `false`.
2. Render API: set `CORS_ORIGINS=https://YOUR-STABLE-FRONTEND.vercel.app` using the actual stable Vercel origin, without a trailing slash or path. For custom domains use their exact origin. Add preview origins individually only if deliberately trusted. No `*.vercel.app` wildcard.
3. Keep `ADMIN_API_TOKEN` only on Render for private/manual operators. It need not be present for demo sessions. No session signing secret, database migration, Redis or new dependency is required.
4. Vercel: keep only the existing `NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com` (actual assigned host). Do not add `ADMIN_API_TOKEN`, `NEXT_PUBLIC_ADMIN_API_TOKEN` or any demo token. No Vercel rewrite/proxy configuration is needed.
5. Deploy/restart the API with the above settings and deploy the updated frontend when ready. This task does not deploy. Disabling demo mode and restarting immediately rejects old demo sessions while retaining the private token path.
6. Acceptance: open `/admin`, click Unlock demo admin, confirm the shared-demo warning and active state; create/edit/delete a temporary correction, reload to confirm session restoration, Lock admin and verify replay of the old cookie fails. Check Network for exact ACAO, Access-Control-Allow-Credentials: true, cookie flags and no Authorization/token in demo requests. Verify an unlisted Origin cannot issue a session or perform cookie writes.

## Verification

Automated tests cover disabled/enabled sessions, secure/local flags, no token in responses, expiry, rotation/logout/replay, origin/header requirements, credentialed CORS, bounded issuance/writes, manual-token compatibility and real PostgreSQL CRUD in both authorization modes. Frontend tests cover credentials, cookie confirmation, blocked-cookie errors and logout.

Local verification completed: 202 tests passed (including real PostgreSQL and cached E5 integration), typecheck/lint/format check passed, and API/web production builds passed. A randomly generated server-only token present during the build was absent from all 363 scanned frontend source/build files. Browser checks passed for one-click unlock, reload restoration, correction create/edit/delete with confirmation, logout (subsequent admin status 401), disabled-mode manual access, and empty JavaScript-visible cookie/storage state. Temporary test records were removed. Operational log inspection found no session-cookie values. No deployment was performed.

After a production build, the reusable secret-value check scans frontend source and all `.next` output without printing the value:

```sh
# ADMIN_API_TOKEN must be injected into this check process only, never NEXT_PUBLIC_*.
node apps/web/scripts/check-admin-secret.mjs
```

Cross-site cookies on the actual Vercel/Render domains still require browser acceptance testing after deployment; localhost checks cannot establish that a browser's third-party-cookie policy will permit them.

Cookie behavior follows [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) and [MDN third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies).
