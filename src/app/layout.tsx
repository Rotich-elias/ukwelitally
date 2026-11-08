import type { Metadata, Viewport } from 'next'
import ServiceWorkerRegistrar from './ServiceWorkerRegistrar'
import RuntimeErrorRecovery from '@/components/RuntimeErrorRecovery'
import './globals.css'

export const metadata: Metadata = {
  applicationName: 'UkweliTally',
  title: {
    default: 'UkweliTally — Independent Election Results Tallying',
    template: '%s · UkweliTally',
  },
  description:
    'Transparent, independent election results tallying for candidates, agents and observers — with photo evidence, GPS checks and real-time aggregation.',
  manifest: '/manifest.json',
  keywords: [
    'election results',
    'Kenya elections',
    'results tallying',
    'polling stations',
    'election transparency',
  ],
  openGraph: {
    title: 'UkweliTally — Independent Election Results Tallying',
    description:
      'Verify every result with photo evidence, GPS checks and real-time aggregation.',
    type: 'website',
    locale: 'en_KE',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UkweliTally — Independent Election Results Tallying',
    description:
      'Verify every result with photo evidence, GPS checks and real-time aggregation.',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#050814',
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
      </body>
    </html>
  )
}
