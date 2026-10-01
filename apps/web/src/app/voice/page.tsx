import { PageHeader } from '@/components/PageHeader';
import { VoiceClassroom } from '@/components/VoiceClassroom';
export const metadata = { title: 'Ask by Voice · musical-goggles' };
export default function VoicePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <PageHeader eyebrow="AI Classroom" title="Ask the curriculum" />
      <VoiceClassroom />
    </main>
  );
}
