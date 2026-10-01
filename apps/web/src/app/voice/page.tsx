import { PhasePlaceholder } from '@/components/PhasePlaceholder';

export const metadata = { title: 'Ask by Voice · musical-goggles' };

export default function VoicePage() {
  return (
    <PhasePlaceholder
      eyebrow="Ask by voice"
      title="Voice"
      phase={2}
      summary="Ask a curriculum question out loud. Speech is transcribed by Deepgram, ballet terms are normalized deterministically, and hybrid search returns the matching correction records."
      pipeline={[
        'Microphone',
        'WebSocket',
        'Deepgram STT',
        'Term normalizer',
        'Hybrid search',
        'Correction records',
      ]}
    />
  );
}
