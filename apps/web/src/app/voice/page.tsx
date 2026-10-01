import { PageHeader } from '@/components/PageHeader';
import { VoiceClassroom } from '@/components/VoiceClassroom';
export const metadata = { title: 'Ask by Voice · musical-goggles' };
export default function VoicePage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <PageHeader eyebrow="AI Classroom" title="Ask the curriculum" />
      <VoiceClassroom />
    </main>
  );
}
