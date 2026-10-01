import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'musical-goggles · AI Classroom',
  description:
    'One ballet correction taxonomy powering voice retrieval, uploaded-video and live-camera analysis (prototype).',
};

export const viewport: Viewport = {
  themeColor: '#0b0c0e',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
