import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Review submissions',
  description:
    'Review polling station submissions, inspect Form 34A evidence photos and approve or reject results before they enter the tally.',
  robots: { index: false, follow: false },
}

export default function ReviewSubmissionsLayout({ children }: { children: React.ReactNode }) {
  return children
}
