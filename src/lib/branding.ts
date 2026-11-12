/**
 * Brand details used on generated documents (report letterheads) so the
 * wording stays consistent with the rest of the application.
 */
export const BRAND = {
  /** Wordmark shown in the document header. */
  name: 'UkweliTally',
  /** One line description of what the platform does. */
  tagline: 'Independent Election Results Tallying',
  /** Election cycle the platform is serving. */
  election: 'Kenya 2027 Elections',
  /** Support email shown on the letterhead and in the footer. */
  email: 'elgeiy8@gmail.com',
  /** Alternative support email (Teto Technologies). */
  altEmail: 'tetoteknologies@gmail.com',
  /** Support phone / WhatsApp number. */
  phone: '0721 237 811',
  /**
   * Public URL of the platform, printed on documents. Always the official
   * domain: documents are shared outside the site, so they must not show a
   * local development or preview address.
   */
  website: 'https://ukwelitally.teto.co.ke',
  /** The company that builds and runs the platform. */
  poweredBy: {
    name: 'Teto Technologies',
    email: 'tetoteknologies@gmail.com',
  },
  /** Brand emblem served from the public folder. */
  logoUrl: '/icons/icon-192x192.png',
} as const

/** The website without the protocol, for display inside a document. */
export function brandWebsiteLabel(): string {
  return BRAND.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
