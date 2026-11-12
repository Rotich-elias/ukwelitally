import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Manage agents',
  description:
    'Add and manage the polling station agents working for your campaign, including their assignments and submission activity.',
  robots: { index: false, follow: false },
}

export default function ManageAgentsLayout({ children }: { children: React.ReactNode }) {
  return children
}
