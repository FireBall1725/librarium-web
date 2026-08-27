import { APIRequestContext, request } from '@playwright/test'
import { API_URL } from '../../playwright.config'

/**
 * The other half of every test.
 *
 * Playwright drives the app the way a person does; this asks the server what
 * came of it. Asserting on the page alone cannot tell a write that landed from
 * one that was only drawn: an optimistic control shows the new state either
 * way, which is exactly how a reading-state write aimed at a route that no
 * longer existed went unnoticed.
 */
export class Api {
  private constructor(
    private readonly ctx: APIRequestContext,
    private token: string | null,
  ) {}

  static async create(token: string | null = null): Promise<Api> {
    return new Api(await request.newContext({ baseURL: API_URL }), token)
  }

  withToken(token: string): Api {
    this.token = token
    return this
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      // The same identity the web client sends. The server gates clients that
      // do not say who they are, and a test that skips it is testing a path
      // no browser takes.
      'X-Librarium-Client': 'web',
      'X-Librarium-Client-Version': '0.0.0-dev',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    }
  }

  /** Unwraps the `data` envelope every successful response carries. */
  async get<T>(path: string): Promise<T> {
    const res = await this.ctx.get(path, { headers: this.headers() })
    if (!res.ok()) {
      throw new Error(`GET ${path} → ${res.status()} ${await res.text()}`)
    }
    return (await res.json()).data as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.ctx.post(path, { headers: this.headers(), data: body })
    if (!res.ok()) {
      throw new Error(`POST ${path} → ${res.status()} ${await res.text()}`)
    }
    const text = await res.text()
    return text ? ((JSON.parse(text).data ?? null) as T) : (null as T)
  }

  /** For the cases where the status is the assertion. */
  async status(path: string): Promise<number> {
    return (await this.ctx.get(path, { headers: this.headers() })).status()
  }
}
