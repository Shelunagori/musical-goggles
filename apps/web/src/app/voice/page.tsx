import { PageHeader } from '@/components/PageHeader';
import { VoiceClassroom } from '@/components/VoiceClassroom';
export const metadata = { title: 'Ask by Voice · musical-goggles' };
export default function VoicePage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <PageHeader
        eyebrow="Voice & text studio"
        title="Ask the curriculum"
        description="Find a clear teaching cue, in your own words."
      />
      <VoiceClassroom />
    </main>
  );
}
