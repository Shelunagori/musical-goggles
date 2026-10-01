import { CurriculumView } from '@/components/CurriculumView';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Curriculum · musical-goggles' };

export default function CurriculumPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-10 px-6 py-10 sm:px-10"
    >
      <PageHeader eyebrow="Correction taxonomy" title="Curriculum" />
      <CurriculumView />
    </main>
  );
}
