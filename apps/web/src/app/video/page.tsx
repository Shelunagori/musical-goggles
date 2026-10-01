import { PageHeader } from '@/components/PageHeader';
import { VideoClassroom } from '@/components/VideoClassroom';
export const metadata = { title: 'Analyze Video · musical-goggles' };
export default function VideoPage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <PageHeader
        eyebrow="Private movement studio"
        title="Video analysis"
        description="A closer look at movement. Your video stays on this device."
      />
      <VideoClassroom />
    </main>
  );
}
