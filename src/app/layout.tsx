import type { Metadata, Viewport } from 'next'
import ServiceWorkerRegistrar from './ServiceWorkerRegistrar'
import RuntimeErrorRecovery from '@/components/RuntimeErrorRecovery'
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  SOCIAL_IMAGE,
} from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  // Makes every relative canonical/Open Graph URL absolute.
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: 'UkweliTally — Independent Election Results Tallying',
    template: '%s · UkweliTally',
  },
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  keywords: [
    'election results',
    'Kenya elections',
    'results tallying',
    'polling stations',
    'election transparency',
    'Form 34A',
    'opinion polls Kenya',
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'politics',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      {
        url: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'UkweliTally — Independent Election Results Tallying',
    description:
      'Verify every result with photo evidence, GPS checks and real-time aggregation.',
    url: '/',
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_KE',
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UkweliTally — Independent Election Results Tallying',
    description:
      'Verify every result with photo evidence, GPS checks and real-time aggregation.',
    images: [SOCIAL_IMAGE],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#050814',
}

// Structured data describing the product itself. It is emitted once from the
// root layout so every page carries the organization/website identity without
// duplicating it in each route.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512x512.png`,
      description: SITE_DESCRIPTION,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'en-KE',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#application`,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web, Android, iOS',
      description: `${SITE_TAGLINE}. ${SITE_DESCRIPTION}`,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'KES',
      },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="min-h-screen font-sans antialiased">
        <RuntimeErrorRecovery />
        <ServiceWorkerRegistrar />
        {children}
        <script
          type="application/ld+json"
          // The JSON is generated from constants above, but `<` is escaped so
          // the payload can never terminate the script element early.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      </body>
    </html>
  )
}
