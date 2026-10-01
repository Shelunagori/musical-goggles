import { PageHeader } from '@/components/PageHeader';
import { CurriculumAdmin } from '@/components/CurriculumAdmin';
export const metadata = { title: 'Curriculum admin · musical-goggles' };
export default function AdminPage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <PageHeader
        eyebrow="Curriculum control panel"
        title="Admin"
        description="Shape the teaching language behind every experience."
      />
      <CurriculumAdmin />
    </main>
  );
}
