import type { PropsWithChildren } from 'react';

export function PageContainer({ children }: PropsWithChildren) {
  return <main className="page-container">{children}</main>;
}
