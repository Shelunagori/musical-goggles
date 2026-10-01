/**
 * Browser-safe configuration. Only NEXT_PUBLIC_* values may appear here —
 * database / Deepgram credentials live exclusively in apps/api.
 */
import { apiUrl } from './api-url';

export const config = {
  apiUrl: apiUrl(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV === 'production'),
} as const;
