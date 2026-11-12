/**
 * Canonical site information used by metadata, robots.txt, sitemap.xml and
 * structured data.
 *
 * `NEXT_PUBLIC_APP_URL` is a local development URL in `.env`, and it is not
 * defined in the Vercel production environment. Metadata must not advertise
 * `localhost` to search engines, so a local or missing value falls back to the
 * public domain. Vercel's generated production URL is used only if no custom
 * domain is configured.
 */

const FALLBACK_SITE_URL = 'https://ukwelitally.teto.co.ke'

function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (configured) {
    try {
      const url = new URL(configured)
      const isLocal =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '0.0.0.0'
      if (!isLocal && (url.protocol === 'http:' || url.protocol === 'https:')) {
        return url.origin
      }
    } catch {
      // A malformed value is ignored in favour of the fallback.
    }
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  return FALLBACK_SITE_URL
}

export const SITE_URL = resolveSiteUrl()
export const SITE_NAME = 'UkweliTally'
export const SITE_TAGLINE =
  'Independent election results tallying for Kenya'
export const SITE_DESCRIPTION =
  'Transparent, independent election results tallying for candidates, agents and observers — with photo evidence, GPS checks and real-time aggregation nationwide.'

/**
 * The social preview image is a static 1200x630 file in `public/`, so it is
 * served from the canonical domain rather than through Next's file-convention
 * route. It is declared explicitly on every route whose metadata overrides the
 * root Open Graph object: a nested `openGraph` replaces the parent's, and an
 * image is too important to lose in that merge.
 */
export const SOCIAL_IMAGE = {
  url: '/opengraph-image.png',
  width: 1200,
  height: 630,
  alt: 'UkweliTally — independent election results tallying with photo evidence and GPS checks',
} as const
