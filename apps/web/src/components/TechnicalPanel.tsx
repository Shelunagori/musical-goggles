import type { ReactNode } from 'react';
export function TechnicalPanel({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <summary className="cursor-pointer text-xl font-semibold">Technical details</summary>
      <div className="mt-5 space-y-4">{children}</div>
    </details>
  );
}
