import { PageHeader } from '@/components/PageHeader';
import { LiveClassroom } from '@/components/LiveClassroom';

export const metadata = { title: 'Live Analysis · musical-goggles' };
export default function LivePage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <PageHeader eyebrow="Local camera · geometric prototype" title="Live analysis" />
      <LiveClassroom />
    </main>
  );
}
