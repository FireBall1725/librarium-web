import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, ApiError } from '../auth/AuthContext'

type WizardStep = 'admin' | 'later'

export default function SetupPage() {
  const { bootstrapAdmin, initialized, user } = useAuth()
  const navigate = useNavigate()

  // Once a user is created in this flow, we stay on the wizard through the
  // "done" step — only redirect when we arrive already initialized without a session.
  if (initialized === true && !user) return <Navigate to="/login" replace />

  const [step, setStep] = useState<WizardStep>('admin')
  const [form, setForm] = useState({
    display_name: '',
    username: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    setIsLoading(true)
    try {
      await bootstrapAdmin({
        username: form.username.trim(),
        email: form.email.trim(),
        display_name: form.display_name.trim() || form.username.trim(),
        password: form.password,
      })
      setStep('later')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Librarium" className="mx-auto h-24 w-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome to Librarium</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Let's get your instance set up.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          {step === 'admin' && (
            <AdminStep
              form={form}
              update={update}
              error={error}
              isLoading={isLoading}
              onSubmit={handleSubmit}
            />
          )}
          {step === 'later' && (
            <DonePlaceholder onContinue={() => navigate('/dashboard', { replace: true })} />
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Step {step === 'admin' ? 1 : 2} of 2
        </p>
      </div>
    </div>
  )
}

interface AdminStepProps {
  form: { display_name: string; username: string; email: string; password: string; confirm: string }
  update: (key: 'display_name' | 'username' | 'email' | 'password' | 'confirm') => (e: React.ChangeEvent<HTMLInputElement>) => void
  error: string | null
  isLoading: boolean
  onSubmit: (e: React.FormEvent) => void
}

function AdminStep({ form, update, error, isLoading, onSubmit }: AdminStepProps) {
  return (
    <form onSubmit={onSubmit} className="px-8 py-8 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create your admin account</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This account is the instance owner with full administrative rights.
        </p>
      </div>

      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Display name
        </label>
        <input
          id="display_name"
          type="text"
          autoComplete="name"
          value={form.display_name}
          onChange={update('display_name')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Jane Doe"
        />
      </div>

      <div>
        <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Username
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          required
          value={form.username}
          onChange={update('username')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="jane"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update('email')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="jane@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={update('password')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="at least 8 characters"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={update('confirm')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Creating account…' : 'Create admin account'}
      </button>
    </form>
  )
}

function DonePlaceholder({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="px-8 py-8 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">You're in</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Your admin account is ready. More setup steps — branding, your first library,
          connecting metadata providers — will live here in the future. For now, head to
          the dashboard and configure them from the admin settings whenever you're ready.
        </p>
      </div>

      <button
        onClick={onContinue}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
      >
        Go to dashboard
      </button>
    </div>
  )
}
