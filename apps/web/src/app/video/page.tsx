import { PageHeader } from '@/components/PageHeader';
import { VideoClassroom } from '@/components/VideoClassroom';
export const metadata = { title: 'Analyze Video · musical-goggles' };
export default function VideoPage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <PageHeader eyebrow="Local video · geometric prototype" title="Video analysis" />
      <VideoClassroom />
    </main>
  );
}
