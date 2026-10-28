/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV !== 'production'

// Next.js dev mode compiles with eval-source-map, which requires
// 'unsafe-eval'. Without it the browser blocks the dev bundles, React never
// hydrates, and forms fall back to a native submit (the login page just
// reloads). Production builds do not use eval, so the stricter policy is
// kept there.
const scriptSrc = isDevelopment
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'"

const securityHeaders = [
  // Enforce HTTPS for two years, including subdomains.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Prevent MIME-type sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Do not leak the full URL to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable powerful browser features the app does not use.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(self), payment=()',
  },
  // Do not allow the app to be framed (clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  // A conservative CSP. 'unsafe-inline' is required by Next.js inline
  // bootstrap scripts and styled-jsx. 'unsafe-eval' is added only in
  // development, because the dev compiler relies on eval().
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
]

const nextConfig = {
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
