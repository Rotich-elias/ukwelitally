'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Offline Icon */}
        <div className="mb-6">
          <svg
            className="w-24 h-24 mx-auto text-dark-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white mb-4">You're Offline</h1>

        {/* Message */}
        <p className="text-dark-300 mb-6">
          It looks like you've lost your internet connection. UkweliTally needs an
          active connection to load new data.
        </p>

        {/* Features Available Offline */}
        <div className="glass-effect rounded-lg p-4 mb-6 text-left">
          <h2 className="font-semibold text-white mb-3">What you can do:</h2>
          <ul className="space-y-2 text-sm text-dark-300">
            <li className="flex items-start">
              <svg
                className="w-5 h-5 text-emerald-400 mr-2 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              View previously loaded results
            </li>
            <li className="flex items-start">
              <svg
                className="w-5 h-5 text-emerald-400 mr-2 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Prepare submissions (will sync when online)
            </li>
            <li className="flex items-start">
              <svg
                className="w-5 h-5 text-emerald-400 mr-2 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Access cached polling station data
            </li>
          </ul>
        </div>

        {/* Retry Button */}
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-500 hover:to-blue-400 transition-all hover:shadow-glow"
        >
          Try Again
        </button>

        {/* Tips */}
        <div className="mt-6 text-sm text-dark-400">
          <p className="text-dark-300">Tips:</p>
          <ul className="mt-2 space-y-1">
            <li>Check your WiFi or mobile data connection</li>
            <li>Try moving to an area with better signal</li>
            <li>Your pending submissions will sync automatically when online</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
