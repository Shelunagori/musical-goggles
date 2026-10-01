export function StatusBadge({ state }: { state: string }) {
  const tone =
    state === 'error'
      ? 'border-danger/50 text-danger'
      : ['complete', 'result', 'analyzing', 'listening'].includes(state)
        ? 'border-ok/50 text-ok'
        : [
              'connecting',
              'requesting',
              'loading_model',
              'calibrating',
              'transcribing',
              'searching',
            ].includes(state)
          ? 'border-warn/50 text-warn'
          : 'border-line text-ink-muted';
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${tone}`}
    >
      {state.replaceAll('_', ' ')}
    </span>
  );
}
