import type { Metadata } from 'next'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

const title = 'Create an Opinion Poll'
const description =
  'Create a free public opinion poll in seconds — no account required. Share one link, let people vote once per browser and see live results after voting.'

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/polls/create',
  },
  openGraph: {
    title: `${title} · ${SITE_NAME}`,
    description,
    url: '/polls/create',
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

export default function CreatePollLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
