import type { Metadata } from 'next'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Create an account'
const description =
  'Account creation for UkweliTally candidates, agents and observers is handled by an administrator. Sign in if you already have credentials to continue.'

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/register' },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/register',
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

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
