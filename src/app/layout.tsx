import type { Metadata, Viewport } from 'next'
import ServiceWorkerRegistrar from './ServiceWorkerRegistrar'
import './globals.css'

export const metadata: Metadata = {
  title: 'UkweliTally - Independent Election Results Tallying',
  description:
    'Transparent and independent election results tallying platform for candidates and agents',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#020617',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  )
}
