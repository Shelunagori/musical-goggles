import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ClassroomNav } from '@/components/ClassroomNav';

export const metadata: Metadata = {
  title: 'musical-goggles · AI Classroom',
  verification: {
    google: 'WYuMPsM9ozjO1kSUsj9MOlRgM6y2ejb3dljKKLAegls',
  },
  description:
    'One ballet correction taxonomy powering voice retrieval, uploaded-video and live-camera analysis (prototype).',
};

export const viewport: Viewport = {
  themeColor: '#0a101b',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <ClassroomNav />
        {children}
      </body>
    </html>
  );
}
