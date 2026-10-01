import { PageHeader } from '@/components/PageHeader';
import { VideoClassroom } from '@/components/VideoClassroom';
export const metadata = { title: 'Analyze Video · musical-goggles' };
export default function VideoPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <PageHeader eyebrow="Local video · geometric prototype" title="Video analysis" />
      <VideoClassroom />
    </main>
  );
}
