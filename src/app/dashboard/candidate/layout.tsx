import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Candidate dashboard',
  description:
    'Track verified results, review submissions from your agents and follow the confidence score across your electoral area.',
  robots: { index: false, follow: false },
}

export default function CandidateDashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
