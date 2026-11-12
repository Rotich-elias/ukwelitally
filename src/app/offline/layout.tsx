import type { Metadata } from 'next'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'You are offline'
const description =
  'UkweliTally cannot reach the network right now. Retry the connection, check your mobile data or WiFi, and pending submissions will sync automatically.'

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/offline' },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/offline',
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

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return children
}
