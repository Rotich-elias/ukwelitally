import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * Only the public, indexable pages are crawlable. Dashboards, APIs and the
 * authentication screens are excluded: they either require a session or show
 * user-specific data that must never appear in a search result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/api/',
          '/results',
          '/login',
          '/register',
          '/offline',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
