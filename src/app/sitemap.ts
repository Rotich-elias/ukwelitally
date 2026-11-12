import type { MetadataRoute } from 'next'
import { queryMany } from '@/lib/db'
import { SITE_URL } from '@/lib/site'

/**
 * The sitemap is cached for an hour. Polls come and go and their vote counts
 * change constantly, but the list of open polls does not need to be rebuilt on
 * every request. A database failure must never break the sitemap: the static
 * public pages are always returned.
 */
export const revalidate = 3600

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  {
    url: `${SITE_URL}/`,
    changeFrequency: 'daily',
    priority: 1,
  },
  {
    url: `${SITE_URL}/presidential-results`,
    changeFrequency: 'hourly',
    priority: 0.9,
  },
  {
    url: `${SITE_URL}/polls/create`,
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    url: `${SITE_URL}/volunteer-registration`,
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    url: `${SITE_URL}/privacy`,
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    url: `${SITE_URL}/terms`,
    changeFrequency: 'yearly',
    priority: 0.3,
  },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let pollRoutes: MetadataRoute.Sitemap = []

  try {
    const polls = await queryMany<{ slug: string; updated_at: string }>(
      `SELECT slug, updated_at
         FROM opinion_polls
        WHERE is_public = TRUE
          AND status = 'open'
        ORDER BY updated_at DESC
        LIMIT 5000`
    )

    pollRoutes = polls.map((poll) => ({
      url: `${SITE_URL}/polls/${poll.slug}`,
      lastModified: new Date(poll.updated_at),
      changeFrequency: 'daily',
      priority: 0.7,
    }))
  } catch (error) {
    console.error('Could not build poll sitemap entries:', error)
  }

  return [...STATIC_ROUTES, ...pollRoutes]
}
