import type { ReactNode } from 'react';
import { Disclosure } from './Disclosure';
export function TechnicalPanel({ children }: { children: ReactNode }) {
  return <Disclosure title="Diagnostics · technical details">{children}</Disclosure>;
}
