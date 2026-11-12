/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV !== 'production'

// Keep dev and production build output in separate directories.
//
// `next dev` and `next build` both default to `.next`. Running a build while
// the dev server is active (or restarting dev without clearing a stale build)
// leaves the webpack runtime and page chunks from different compilations in
// the same directory, which surfaces as errors like:
//   Cannot find module './3897.js'
// A distinct dev directory makes that collision impossible.
const distDir = process.env.NEXT_DIST_DIR || (isDevelopment ? '.next-dev' : '.next')

// Next.js dev mode compiles with eval-source-map, which requires
// 'unsafe-eval'. Without it the browser blocks the dev bundles, React never
// hydrates, and forms fall back to a native submit (the login page just
// reloads). Production builds do not use eval, so the stricter policy is
// kept there.
// Analytics is optional and consent-gated. When a measurement ID is present at
// build time, allow only the Google endpoints the tag needs; without one the
// stricter policy stays in place.
const analyticsConfigured = Boolean(process.env.NEXT_PUBLIC_GA_ID?.trim())
const analyticsScriptSrc = analyticsConfigured ? ' https://www.googletagmanager.com' : ''
const analyticsConnectSrc = analyticsConfigured
  ? ' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com'
  : ''

const scriptSrc = isDevelopment
  ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'${analyticsScriptSrc}`
  : `script-src 'self' 'unsafe-inline'${analyticsScriptSrc}`

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
      `connect-src 'self'${analyticsConnectSrc}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
]

const nextConfig = {
  distDir,
  // A parent directory also has a package-lock.json. Pin the tracing root to
  // this project so a production build does not pull in unrelated files.
  outputFileTracingRoot: __dirname,
  images: {
    // Photos are served by the application itself (evidence through the
    // authorized route, profile photos from the storage host). The built-in
    // optimizer is not used, and leaving remote optimization enabled with a
    // wildcard host pattern would turn the deployment into an image proxy.
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Private or session-specific pages must never be indexed, even if a
      // crawler ignores robots.txt.
      { source: '/dashboard/:path*', headers: noindex },
      { source: '/api/:path*', headers: noindex },
      { source: '/results', headers: noindex },
      { source: '/login', headers: noindex },
      { source: '/register', headers: noindex },
      { source: '/offline', headers: noindex },
      { source: '/volunteer-registration/thank-you', headers: noindex },
    ]
  },
}

module.exports = nextConfig
