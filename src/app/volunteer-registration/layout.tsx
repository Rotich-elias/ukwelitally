import type { Metadata } from 'next'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Volunteer Registration'
const description =
  'Register as a polling station agent or observer and help verify every presidential result with photo evidence, GPS checks and secure real-time tallying.'

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/volunteer-registration',
  },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/volunteer-registration',
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

export default function VolunteerRegistrationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
