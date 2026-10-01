import { CurriculumView } from '@/components/CurriculumView';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Curriculum · musical-goggles' };

export default function CurriculumPage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <PageHeader
        eyebrow="The shared foundation"
        title="Curriculum"
        description="One library of exercises and corrections for every classroom mode."
      />
      <CurriculumView />
    </main>
  );
}
