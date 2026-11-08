import type { Metadata } from 'next'
import { getPollBySlug } from '@/lib/polls'
import { SITE_NAME, SOCIAL_IMAGE } from '@/lib/site'

interface PollLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

/**
 * Each public poll gets its own title, description and canonical URL, so a
 * shared poll link previews correctly and is indexed as a distinct page.
 */
export async function generateMetadata({
  params,
}: PollLayoutProps): Promise<Metadata> {
  const { slug } = await params

  let poll = null
  try {
    poll = await getPollBySlug(slug)
  } catch (error) {
    console.error('Could not load poll metadata:', error)
  }

  if (
    !poll ||
    !poll.is_public ||
    poll.status === 'draft' ||
    poll.status === 'archived'
  ) {
    // The page itself shows a not-found state in this case.
    return {
      title: 'Poll not found',
      robots: { index: false, follow: false },
    }
  }

  const title = poll.title
  const description = poll.description?.trim()
    ? truncate(poll.description, 160)
    : `Vote in “${poll.title}” and see the live results on ${SITE_NAME}.`

  return {
    title,
    description,
    alternates: {
      canonical: `/polls/${poll.slug}`,
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/polls/${poll.slug}`,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [SOCIAL_IMAGE],
    },
  }
}

export default function PublicPollLayout({ children }: PollLayoutProps) {
  return children
}
