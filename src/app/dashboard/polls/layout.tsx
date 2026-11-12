import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Poll management',
  description:
    'Manage the opinion polls you have created, check live vote counts and close or archive polls when they are no longer needed.',
  robots: { index: false, follow: false },
}

export default function PollManagementLayout({ children }: { children: React.ReactNode }) {
  return children
}
