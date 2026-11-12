import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Observer dashboard',
  description:
    'Follow the polling stations assigned to you, submit verified observations and monitor the independent tally as it updates.',
  robots: { index: false, follow: false },
}

export default function ObserverDashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
