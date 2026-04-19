import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function ApiUnavailablePage() {
  const { retryApiProbe } = useAuth()
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = () => {
    setIsRetrying(true)
    retryApiProbe()
    setTimeout(() => setIsRetrying(false), 800)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
          <svg className="h-8 w-8 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Can't reach the server</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Librarium's API isn't responding. It may be restarting or temporarily offline.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRetrying ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    </div>
  )
}
