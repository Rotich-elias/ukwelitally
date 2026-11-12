import type { Metadata } from 'next'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Sign in to your account'
const description =
  'Sign in to UkweliTally to review polling station submissions, verify evidence and follow the live presidential tally from your role-specific dashboard.'

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/login' },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/login',
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

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
