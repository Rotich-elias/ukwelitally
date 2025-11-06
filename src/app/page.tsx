export default function Home() {
  return (
    <main className="min-h-screen bg-dark-950">
      {/* Header */}
      <nav className="glass-effect border-b border-dark-700/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            UkweliTally
          </h1>
          <div className="space-x-4">
            <a href="/login" className="text-dark-300 hover:text-blue-400 transition-colors">
              Login
            </a>
            <a
              href="/register"
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-2 rounded-lg hover:from-blue-500 hover:to-blue-400 transition-all hover:shadow-glow"
            >
              Register
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 blur-3xl -z-10"></div>
        <h2 className="text-5xl font-bold text-white mb-6">
          Independent Election Results
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
            Tallying Platform
          </span>
        </h2>
        <p className="text-xl text-dark-300 mb-8 max-w-2xl mx-auto">
          Empowering candidates and agents to verify election results with
          transparency, accuracy, and real-time updates for Kenya 2027 Elections
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/register"
            className="btn-primary"
          >
            Get Started
          </a>
          <a
            href="#features"
            className="btn-secondary"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 relative">
        <div className="container mx-auto px-4">
          <h3 className="text-3xl font-bold text-center mb-12 text-white">Key Features</h3>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="glass-effect p-6 rounded-xl card-hover">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-semibold mb-2 text-white">Real-Time Tallying</h4>
              <p className="text-dark-300">
                Agents submit results instantly from polling stations with
                automatic aggregation and validation
              </p>
            </div>

            {/* Feature 2 */}
            <div className="glass-effect p-6 rounded-xl card-hover">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-semibold mb-2 text-white">Secure & Verified</h4>
              <p className="text-dark-300">
                GPS verification, photo evidence, and backup submissions ensure
                data integrity
              </p>
            </div>

            {/* Feature 3 */}
            <div className="glass-effect p-6 rounded-xl card-hover">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-semibold mb-2 text-white">Analytics Dashboard</h4>
              <p className="text-dark-300">
                Comprehensive visualizations, trends, and insights across all
                polling levels
              </p>
            </div>

            {/* Feature 4 */}
            <div className="glass-effect p-6 rounded-xl card-hover">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-semibold mb-2 text-white">Offline Support</h4>
              <p className="text-dark-300">
                Works without internet. Submit results when connectivity returns
              </p>
            </div>

            {/* Feature 5 */}
            <div className="glass-effect p-6 rounded-xl card-hover">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-semibold mb-2 text-white">OCR Form Scanning</h4>
              <p className="text-dark-300">
                Automatic data extraction from Form 34A photos with manual
                verification
              </p>
            </div>

            {/* Feature 6 */}
            <div className="glass-effect p-6 rounded-xl card-hover">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-semibold mb-2 text-white">Multi-Level Access</h4>
              <p className="text-dark-300">
                Agents, candidates, observers, and admins with appropriate
                permissions
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <h3 className="text-3xl font-bold text-center mb-12 text-white">How It Works</h3>
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-full flex items-center justify-center font-bold shadow-glow">
                1
              </div>
              <div className="glass-effect p-4 rounded-lg flex-grow">
                <h4 className="text-xl font-semibold mb-2 text-white">Register & Assign</h4>
                <p className="text-dark-300">
                  Candidates register agents and assign them to specific polling
                  stations
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full flex items-center justify-center font-bold shadow-glow">
                2
              </div>
              <div className="glass-effect p-4 rounded-lg flex-grow">
                <h4 className="text-xl font-semibold mb-2 text-white">
                  Capture & Upload Results
                </h4>
                <p className="text-dark-300">
                  Agents photograph Form 34A and upload with GPS verification
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 text-white rounded-full flex items-center justify-center font-bold shadow-glow">
                3
              </div>
              <div className="glass-effect p-4 rounded-lg flex-grow">
                <h4 className="text-xl font-semibold mb-2 text-white">
                  Automatic Aggregation
                </h4>
                <p className="text-dark-300">
                  System tallies votes across all levels: station → ward →
                  constituency → county
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-full flex items-center justify-center font-bold shadow-glow">
                4
              </div>
              <div className="glass-effect p-4 rounded-lg flex-grow">
                <h4 className="text-xl font-semibold mb-2 text-white">
                  Monitor & Verify
                </h4>
                <p className="text-dark-300">
                  Candidates view real-time results and compare with official IEBC
                  tallies
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20"></div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h3 className="text-3xl font-bold mb-4 text-white">
            Ready to Secure Your Election Results?
          </h3>
          <p className="text-xl mb-8 text-dark-200">
            Join UkweliTally today and take control of your election data
          </p>
          <a
            href="/register"
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:from-blue-500 hover:to-purple-500 inline-block transition-all hover:shadow-glow-lg"
          >
            Create Account
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="glass-effect border-t border-dark-700/50 py-8 mt-20">
        <div className="container mx-auto px-4 text-center">
          <p className="text-dark-200">&copy; 2025 UkweliTally. Built for Kenya 2027 Elections.</p>
          <p className="text-sm mt-2 text-dark-400">
            Independent platform - Not affiliated with IEBC
          </p>
        </div>
      </footer>
    </main>
  )
}
