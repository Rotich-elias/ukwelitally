import type { Metadata } from 'next'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Detailed Election Results'
const description =
  'Explore verified polling station results by county, constituency and ward, including turnout, rejected votes and candidate totals for signed-in users.'

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/results' },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/results',
    type: 'website',
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} · ${SITE_NAME}`,
    description,
    images: [SOCIAL_IMAGE],
  },
}

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  return children
}
