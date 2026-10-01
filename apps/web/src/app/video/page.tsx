import { PhasePlaceholder } from '@/components/PhasePlaceholder';

export const metadata = { title: 'Analyze Video · musical-goggles' };

export default function VideoPage() {
  return (
    <PhasePlaceholder
      eyebrow="Uploaded video"
      title="Video analysis"
      phase={3}
      summary="Upload a clip and MediaPipe Pose runs locally in this browser. A small set of geometric detectors maps what it sees to the same correction records used by voice. The video never leaves your device."
      pipeline={[
        'Video file',
        'MediaPipe Pose (browser)',
        'Normalize pose',
        'Detector rules',
        'Debounced events',
        'Correction records',
      ]}
    />
  );
}
