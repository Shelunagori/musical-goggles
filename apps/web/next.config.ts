import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@mg/shared', '@mg/taxonomy', '@mg/pose-engine'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        // A worker gets CSP from its script response. Permit model assets but
        // block MediaPipe 1.x telemetry and any other worker network destination.
        // Ordinary script responses do not set the page document's CSP.
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "connect-src 'self' https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/ https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/;",
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera/mic are requested only by this origin (Phase 2–4), never by embeds.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
