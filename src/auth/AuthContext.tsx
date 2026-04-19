import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { AuthTokens, User } from '../types'

// ─── Storage keys ────────────────────────────────────────────────────────────

const KEYS = {
  access: 'lib_access_token',
  refresh: 'lib_refresh_token',
  expires: 'lib_expires_at', // ms timestamp
  user: 'lib_user',
} as const

// ─── Types ───────────────────────────────────────────────────────────────────

interface BootstrapAdminRequest {
  username: string
  email: string
  display_name: string
  password: string
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  /** null until the first status probe resolves; true if at least one user exists. */
  initialized: boolean | null
  /** null while probing, false if the setup-status probe fails (network error or non-2xx). */
  apiReachable: boolean | null
  /** Re-runs the setup-status probe (used by the API-down page's retry button). */
  retryApiProbe: () => void
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
  /** Creates the first instance admin on a fresh install and signs the user in. */
  bootstrapAdmin: (req: BootstrapAdminRequest) => Promise<void>
  /** Authenticated fetch — injects Bearer token and auto-refreshes when near expiry. */
  callApi: <T>(path: string, options?: RequestInit) => Promise<T>
  /** Returns a valid Bearer token, refreshing if near expiry. Useful for non-JSON requests (e.g. image fetches). */
  getToken: () => Promise<string | null>
  /** Updates the cached user in state and storage (e.g. after a profile save). */
  updateUser: (user: User) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [initialized, setInitialized] = useState<boolean | null>(null)
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)
  const [probeNonce, setProbeNonce] = useState(0)
  const retryApiProbe = useCallback(() => setProbeNonce(n => n + 1), [])

  // Refs let callApi always see the freshest tokens without stale closures.
  const accessRef = useRef<string | null>(null)
  const refreshRef = useRef<string | null>(null)
  const expiresRef = useRef<number>(0)
  // Which Web Storage the session lives in: localStorage (remember me) or sessionStorage.
  const storageRef = useRef<Storage>(localStorage)

  // In-flight GET deduplication: React StrictMode fires effects twice; this map
  // ensures concurrent identical GETs share one network request instead of two.
  const inFlight = useRef(new Map<string, Promise<unknown>>())

  // In-flight refresh deduplication: refresh tokens are single-use (rotated on
  // every call). If multiple callApi invocations race to refresh simultaneously,
  // the second caller would present an already-rotated token and fail, which then
  // causes a 401 → clearSession. Share one in-flight refresh promise instead.
  const refreshInFlight = useRef<Promise<string | null> | null>(null)

  const persistSession = useCallback((tokens: AuthTokens) => {
    const expiresAt = Date.now() + tokens.expires_in * 1000
    const storage = storageRef.current
    storage.setItem(KEYS.access, tokens.access_token)
    storage.setItem(KEYS.refresh, tokens.refresh_token)
    storage.setItem(KEYS.expires, String(expiresAt))
    storage.setItem(KEYS.user, JSON.stringify(tokens.user))
    accessRef.current = tokens.access_token
    refreshRef.current = tokens.refresh_token
    expiresRef.current = expiresAt
    setUser(tokens.user)
  }, [])

  const clearSession = useCallback(() => {
    // Clear both storages in case the user previously logged in with/without remember-me.
    Object.values(KEYS).forEach(k => {
      localStorage.removeItem(k)
      sessionStorage.removeItem(k)
    })
    accessRef.current = null
    refreshRef.current = null
    expiresRef.current = 0
    setUser(null)
  }, [])

  const updateUser = useCallback((u: User) => {
    storageRef.current.setItem(KEYS.user, JSON.stringify(u))
    setUser(u)
  }, [])

  // Attempt a silent token refresh; returns the new access token or null.
  // Concurrent calls share one in-flight promise to avoid rotating the same
  // refresh token twice (which would revoke it and log the user out).
  const doRefresh = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current

    const rt = refreshRef.current
    if (!rt) return Promise.resolve(null)

    const req = (async (): Promise<string | null> => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        })
        if (!res.ok) return null
        const body = await res.json() as { data: AuthTokens }
        persistSession(body.data)
        return body.data.access_token
      } catch {
        return null
      } finally {
        refreshInFlight.current = null
      }
    })()

    refreshInFlight.current = req
    return req
  }, [persistSession])

  // Returns a valid access token, refreshing silently if needed.
  const getToken = useCallback(async (): Promise<string | null> => {
    const token = accessRef.current
    const expires = expiresRef.current
    // Refresh proactively if within 60 s of expiry
    if (!token || (expires && Date.now() > expires - 60_000)) {
      return doRefresh()
    }
    return token
  }, [doRefresh])

  // ── callApi ──────────────────────────────────────────────────────────────

  const callApi = useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const isFormData = options.body instanceof FormData
    const method = (options.method ?? 'GET').toUpperCase()

    const execute = async (): Promise<T> => {
      const token = await getToken()
      let res: Response
      try {
        res = await fetch(path, {
          ...options,
          headers: {
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...(options.headers ?? {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
      } catch {
        throw new ApiError(0, 'Cannot connect to server')
      }
      if (res.status === 401) {
        clearSession()
        throw new ApiError(401, 'Session expired — please log in again')
      }
      if (res.status === 204) return undefined as T
      const body = await res.json()
      if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`)
      return body.data as T
    }

    // Deduplicate concurrent GET requests so React StrictMode's double-effect
    // invocation doesn't cause duplicate network calls in development.
    if (method !== 'GET') return execute()

    const inflight = inFlight.current.get(path)
    if (inflight) return inflight as Promise<T>

    const req = execute().finally(() => inFlight.current.delete(path))
    inFlight.current.set(path, req)
    return req
  }, [getToken, clearSession])

  // ── login / logout ────────────────────────────────────────────────────────

  const login = useCallback(async (identifier: string, password: string, rememberMe = true) => {
    storageRef.current = rememberMe ? localStorage : sessionStorage
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })
    const body = await res.json()
    if (!res.ok) throw new ApiError(res.status, body.error ?? 'Login failed')
    persistSession(body.data as AuthTokens)
  }, [persistSession])

  const bootstrapAdmin = useCallback(async (req: BootstrapAdminRequest) => {
    storageRef.current = localStorage
    let res: Response
    try {
      res = await fetch('/api/v1/setup/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
    } catch {
      throw new ApiError(0, 'Cannot reach API — is the server running?')
    }
    const text = await res.text()
    let body: { error?: string; data?: unknown } = {}
    try { body = text ? JSON.parse(text) : {} } catch {
      throw new ApiError(res.status, `Unexpected response from /api/v1/setup/admin (HTTP ${res.status}). Is the API up to date?`)
    }
    if (!res.ok) throw new ApiError(res.status, body.error ?? `Setup failed (HTTP ${res.status})`)
    persistSession(body.data as AuthTokens)
    setInitialized(true)
  }, [persistSession])

  const logout = useCallback(async () => {
    const token = accessRef.current
    if (token) {
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch { /* best-effort */ }
    }
    clearSession()
  }, [clearSession])

  // ── Bootstrap from storage (localStorage first, then sessionStorage) ────────

  useEffect(() => {
    // Probe setup status in parallel — clients use this to decide whether to
    // show the setup wizard instead of the login screen on a fresh install.
    // Only set `initialized` when we get a valid 2xx response; any other outcome
    // (network failure, proxy 502, malformed body) means the API is unreachable
    // and the caller should render the API-down page instead of guessing.
    let cancelled = false
    setApiReachable(null)
    setInitialized(null)
    fetch('/api/v1/setup/status')
      .then(async res => {
        if (!res.ok) throw new Error(`probe HTTP ${res.status}`)
        const body = await res.json() as { data?: { initialized?: boolean } }
        if (typeof body?.data?.initialized !== 'boolean') throw new Error('probe malformed body')
        return body.data.initialized
      })
      .then(init => {
        if (cancelled) return
        setInitialized(init)
        setApiReachable(true)
      })
      .catch(() => {
        if (cancelled) return
        setApiReachable(false)
      })
    return () => { cancelled = true }
  }, [probeNonce])

  useEffect(() => {
    // Prefer localStorage (remember-me); fall back to sessionStorage.
    const storage = localStorage.getItem(KEYS.access) ? localStorage : sessionStorage
    storageRef.current = storage

    const stored = storage.getItem(KEYS.user)
    const access = storage.getItem(KEYS.access)
    const refresh = storage.getItem(KEYS.refresh)
    const expires = parseInt(storage.getItem(KEYS.expires) ?? '0', 10)

    accessRef.current = access
    refreshRef.current = refresh
    expiresRef.current = expires

    if (!stored || !access) {
      setIsLoading(false)
      return
    }

    // If token is still fresh, restore immediately
    if (expires && Date.now() < expires - 60_000) {
      setUser(JSON.parse(stored))
      setIsLoading(false)
      return
    }

    // Otherwise try a silent refresh before showing the app
    doRefresh().then(token => {
      if (!token) clearSession()
    }).finally(() => setIsLoading(false))
  }, [doRefresh, clearSession])

  return (
    <AuthContext.Provider value={{ user, isLoading, initialized, apiReachable, retryApiProbe, login, logout, bootstrapAdmin, callApi, getToken, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── ApiError ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
