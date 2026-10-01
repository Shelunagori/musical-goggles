/** Validate public configuration without ever echoing a potentially secret URL. */
export function apiUrl(raw: string | undefined, production: boolean): string {
  if (!raw?.trim() && production)
    throw new Error('Set NEXT_PUBLIC_API_URL before building the production frontend.');
  const message =
    'NEXT_PUBLIC_API_URL must be an HTTP(S) origin without credentials, path or query; remote production APIs require HTTPS.';
  try {
    const url = new URL(raw?.trim() || 'http://localhost:4000');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (production && !local && url.protocol !== 'https:')
    )
      throw new Error(message);
    return url.origin;
  } catch {
    throw new Error(message);
  }
}
