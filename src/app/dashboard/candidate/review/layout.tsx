import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Candidate review queue',
  description:
    'Review evidence-backed submissions from your agents and confirm the results that belong to your electoral scope.',
  robots: { index: false, follow: false },
}

export default function CandidateReviewLayout({ children }: { children: React.ReactNode }) {
  return children
}
