import { PageHeader } from '@/components/PageHeader';
import { LiveClassroom } from '@/components/LiveClassroom';

export const metadata = { title: 'Live Analysis · musical-goggles' };
export default function LivePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <PageHeader eyebrow="Local camera · geometric prototype" title="Live analysis" />
      <LiveClassroom />
    </main>
  );
}
