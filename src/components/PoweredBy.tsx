import { BRAND } from '@/lib/branding'

/** "Powered by Teto Technologies" credit for the site footers. */
export default function PoweredBy({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      Powered by{' '}
      <a
        href={`mailto:${BRAND.poweredBy.email}`}
        className="font-medium text-dark-300 transition-colors hover:text-white"
      >
        {BRAND.poweredBy.name}
      </a>
      .
    </span>
  )
}
