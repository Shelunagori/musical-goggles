/**
 * Browser-safe configuration. Only NEXT_PUBLIC_* values may appear here —
 * database / Deepgram credentials live exclusively in apps/api.
 */
const DEFAULT_API_URL = 'http://localhost:4000';

function readApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_API_URL;
  try {
    const url = new URL(raw);
    return url.toString().replace(/\/$/, '');
  } catch {
    console.error(
      `NEXT_PUBLIC_API_URL is not a valid URL: "${raw}". Falling back to ${DEFAULT_API_URL}.`,
    );
    return DEFAULT_API_URL;
  }
}

export const config = {
  apiUrl: readApiUrl(),
} as const;
