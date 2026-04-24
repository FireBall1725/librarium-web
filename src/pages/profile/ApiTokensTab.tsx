// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'
import { SectionHeading, buttonPrimaryClass, buttonSecondaryClass, cardClass, inputClass } from './shared'

// ─── Types ───────────────────────────────────────────────────────────────────

interface APIToken {
  id: string
  name: string
  token_suffix: string
  scopes: string[]
  last_used_at?: string | null
  expires_at?: string | null
  revoked_at?: string | null
  created_at: string
}

interface CreateTokenResponse extends APIToken {
  token: string
}

// Scope presets. Server accepts any scope list; these are UI shortcuts.
// "Full access" maps to an empty array (server treats empty as "inherit
// user's full permissions" — classic PAT behaviour).
const READ_SCOPES = [
  'books:read', 'library:read', 'loans:read', 'members:read',
  'series:read', 'shelves:read', 'tags:read',
] as const

const LIBRARY_SCOPES = [
  ...READ_SCOPES,
  'books:create', 'books:update', 'books:delete',
  'loans:create', 'loans:update', 'loans:delete',
  'series:create', 'series:update', 'series:delete',
  'shelves:create', 'shelves:update', 'shelves:delete',
  'tags:create', 'tags:update', 'tags:delete',
  'members:create', 'members:update', 'members:delete',
] as const

type Preset = 'read' | 'library' | 'full'

const PRESET_LABELS: Record<Preset, { title: string; body: string }> = {
  read: {
    title: 'Read-only',
    body: 'Can list and view everything you can, but cannot make any changes.',
  },
  library: {
    title: 'Library access',
    body: 'Everything read-only can do, plus adding, editing, and removing books, shelves, tags, loans, and series.',
  },
  full: {
    title: 'Full access',
    body: 'Same permissions as your user account, including admin operations if you are an instance admin.',
  },
}

function scopesFor(preset: Preset): string[] {
  switch (preset) {
    case 'read':    return [...READ_SCOPES]
    case 'library': return [...LIBRARY_SCOPES]
    case 'full':    return []
  }
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

export default function ApiTokensTab() {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()

  const [tokens, setTokens] = useState<APIToken[] | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [justCreated, setJustCreated] = useState<CreateTokenResponse | null>(null)

  const load = async () => {
    try {
      const rows = await callApi<APIToken[]>('/api/v1/me/api-tokens')
      setTokens(rows ?? [])
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load tokens', { variant: 'error' })
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this token? Any client using it will stop working immediately.')) return
    try {
      await callApi(`/api/v1/me/api-tokens/${id}`, { method: 'DELETE' })
      showToast('Token revoked', { variant: 'success' })
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to revoke token', { variant: 'error' })
    }
  }

  const active = (tokens ?? []).filter(t => !t.revoked_at)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <SectionHeading label="API tokens" />
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
            Personal access tokens for scripts, CI, and the Librarium MCP server.
            The raw value is shown only when created, so copy it somewhere safe.
          </p>
        </div>
        <button
          type="button"
          className={buttonPrimaryClass}
          onClick={() => setShowCreate(true)}
        >
          New token
        </button>
      </div>

      <div className={cardClass}>
        {tokens === null ? (
          <div className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">Loading…</div>
        ) : active.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">
            No active tokens. Create one above to get started.
          </div>
        ) : (
          active.map(t => <TokenRow key={t.id} token={t} onRevoke={handleRevoke} />)
        )}
      </div>

      {showCreate && (
        <CreateTokenModal
          onClose={() => setShowCreate(false)}
          onCreated={(tok) => {
            setJustCreated(tok)
            setShowCreate(false)
            void load()
          }}
        />
      )}

      {justCreated && (
        <NewTokenModal
          token={justCreated}
          onClose={() => setJustCreated(null)}
        />
      )}
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function TokenRow({ token, onRevoke }: { token: APIToken; onRevoke: (id: string) => void }) {
  const masked = `lbrm_pat_${'•'.repeat(12)}${token.token_suffix}`
  const scopeLabel =
    token.scopes.length === 0
      ? 'Full access'
      : token.scopes.some(s => s.includes(':create') || s.includes(':update') || s.includes(':delete'))
        ? 'Library access'
        : 'Read-only'

  return (
    <div className="px-6 py-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{token.name}</p>
          <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">
            {scopeLabel}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400 truncate">{masked}</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Created {formatDate(token.created_at)}
          {token.last_used_at
            ? ` · last used ${formatDate(token.last_used_at)}`
            : ' · never used'}
          {token.expires_at ? ` · expires ${formatDate(token.expires_at)}` : ''}
        </p>
      </div>
      <button
        type="button"
        className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
        onClick={() => onRevoke(token.id)}
      >
        Revoke
      </button>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

// ─── Create modal ────────────────────────────────────────────────────────────

function CreateTokenModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (t: CreateTokenResponse) => void
}) {
  const { callApi } = useAuth()
  const { show: showToast } = useToast()
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<Preset>('library')
  const [expiry, setExpiry] = useState<'never' | '30' | '90' | '365'>('never')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const expiresAt =
        expiry === 'never'
          ? null
          : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000).toISOString()
      const created = await callApi<CreateTokenResponse>('/api/v1/me/api-tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          scopes: scopesFor(preset),
          expires_at: expiresAt,
        }),
      })
      onCreated(created)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create token', { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title="New API token">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1" htmlFor="token-name">
            Name
          </label>
          <input
            id="token-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. MCP on laptop"
            maxLength={64}
            required
            autoFocus
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Scope
          </label>
          <div className="space-y-2">
            {(['read', 'library', 'full'] as const).map(p => (
              <label
                key={p}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  preset === p
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="scope-preset"
                  value={p}
                  checked={preset === p}
                  onChange={() => setPreset(p)}
                  className="mt-0.5 accent-blue-600"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{PRESET_LABELS[p].title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{PRESET_LABELS[p].body}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1" htmlFor="token-expiry">
            Expiration
          </label>
          <select
            id="token-expiry"
            value={expiry}
            onChange={e => setExpiry(e.target.value as typeof expiry)}
            className={inputClass}
          >
            <option value="never">Never</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondaryClass} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={buttonPrimaryClass} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create token'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Show-once modal ─────────────────────────────────────────────────────────

function NewTokenModal({ token, onClose }: { token: CreateTokenResponse; onClose: () => void }) {
  const { show: showToast } = useToast()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token.token)
      setCopied(true)
      showToast('Copied to clipboard', { variant: 'success' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Copy failed. Select the text and copy manually.', { variant: 'error' })
    }
  }

  return (
    <Modal title="Your new token" onClose={onClose} dismissOnBackdrop={false}>
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-3">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Copy this now</p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
            This is the only time the raw value will be shown. Once you close this dialog it cannot
            be recovered. If you lose it, revoke and create a new one.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 p-3">
          <p className="font-mono text-xs text-gray-900 dark:text-gray-100 break-all select-all">
            {token.token}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={handleCopy} className={buttonSecondaryClass}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button type="button" onClick={onClose} className={buttonPrimaryClass}>
            I've saved it
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Shared modal chrome ─────────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
  dismissOnBackdrop = true,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  dismissOnBackdrop?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
