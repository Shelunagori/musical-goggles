import { PhasePlaceholder } from '@/components/PhasePlaceholder';

export const metadata = { title: 'Live Analysis · musical-goggles' };

export default function LivePage() {
  return (
    <PhasePlaceholder
      eyebrow="Live camera"
      title="Live analysis"
      phase={4}
      summary="Webcam pose analysis using exactly the same pose engine as uploaded video, with confidence thresholds and debouncing so one bad frame never raises a warning. Frames stay in the browser."
      pipeline={[
        'Webcam',
        'MediaPipe Pose (browser)',
        'Same pose engine',
        'Stable alert state',
        'Correction records',
      ]}
    />
  );
}
