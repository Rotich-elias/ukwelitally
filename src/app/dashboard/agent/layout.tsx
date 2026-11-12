import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Agent dashboard',
  description:
    'Submit verified polling station results, attach evidence photos and track the review status of your submissions.',
  robots: { index: false, follow: false },
}

export default function AgentDashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
