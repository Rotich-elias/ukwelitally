import type { Metadata } from 'next'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Live Presidential Results'
const description =
  'Follow the live presidential tally as verified polling station results arrive — candidate totals, turnout, rejected votes and reporting progress.'

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/presidential-results',
  },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/presidential-results',
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

export default function PresidentialResultsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
