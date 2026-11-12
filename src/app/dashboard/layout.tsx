import type { Metadata } from 'next'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const description =
  'Your private UkweliTally workspace. Open your role-specific dashboard to review submissions, results and assignments.'

/**
 * Dashboards are private, session-gated areas. They must never be indexed, and
 * each child page keeps its own title through the root title template.
 */
export const metadata: Metadata = {
  title: 'Dashboard home',
  description,
  robots: { index: false, follow: false },
  // Without an explicit canonical the root layout's home canonical would be
  // inherited, which would wrongly point every private page at the homepage.
  alternates: { canonical: '/dashboard' },
  openGraph: {
    title: `Dashboard · ${SITE_NAME}`,
    description,
    url: '/dashboard',
    type: 'website',
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Dashboard · ${SITE_NAME}`,
    description,
    images: [SOCIAL_IMAGE],
  },
}

export default function DashboardHomeLayout({ children }: { children: React.ReactNode }) {
  return children
}
