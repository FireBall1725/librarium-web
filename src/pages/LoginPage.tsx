import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, ApiError } from '../auth/AuthContext'

export default function LoginPage() {
  const { login, initialized } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  if (initialized === false) return <Navigate to="/setup" replace />


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      await login(identifier, password, rememberMe)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.unexpected_error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted ">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Librarium" className="mx-auto h-32 w-auto mb-4" />
          <h1 className="text-3xl font-bold text-content ">{t('app.name')}</h1>
          <p className="mt-1 text-sm text-content-muted ">{t('auth.sign_in_subtitle')}</p>
        </div>

        <div className="bg-surface rounded-xl border border-line shadow-sm px-8 py-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-content-secondary mb-1">
                {t('auth.username_or_email')}
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-content dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={t('auth.username_placeholder')}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-content-secondary mb-1">
                {t('auth.password')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-content dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-content-tertiary select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="rounded border-line-strong text-blue-600 focus:ring-blue-500"
              />
              {t('auth.remember_me')}
            </label>

            {error && (
              <div className="rounded-lg bg-danger-surface border border-danger-line px-3 py-2 text-sm text-danger-strong ">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? t('auth.signing_in') : t('auth.sign_in')}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-content-subtle ">
          v{__APP_VERSION__}
        </p>
      </div>
    </div>
  )
}
