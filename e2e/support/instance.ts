import path from 'node:path'

import { Api } from './api'

/**
 * Where the signed-in session is kept between the setup project and the specs
 * that depend on it. Gitignored: it holds a real token for a throwaway
 * instance and is regenerated on every run.
 */
export const STORAGE_STATE = path.join(process.cwd(), 'e2e/.auth/state.json')

/**
 * A fresh instance, and an account to use it with.
 *
 * The credential below is a fixture for a database that is created and
 * destroyed by the same test run. It is not a secret and is deliberately
 * obvious about that: anything that looks like a real password invites
 * somebody to reuse it somewhere it matters.
 */
export const ADMIN = {
  username: 'e2e',
  email: 'e2e@example.invalid',
  displayName: 'End To End',
  password: 'e2e-fixture-not-a-real-password',
}

export interface Session {
  api: Api
  token: string
}

/**
 * Bootstraps the instance if nothing has, then signs in.
 *
 * Tolerates an instance that is already initialised so a developer can run one
 * spec twice against a stack they left up, even though CI always starts from
 * nothing.
 */
export async function signIn(): Promise<Session> {
  const anon = await Api.create()

  const { initialized } = await anon.get<{ initialized: boolean }>('/api/v1/setup/status')
  if (!initialized) {
    await anon.post('/api/v1/setup/admin', {
      username: ADMIN.username,
      email: ADMIN.email,
      display_name: ADMIN.displayName,
      password: ADMIN.password,
    })
  }

  const { access_token } = await anon.post<{ access_token: string }>('/api/v1/auth/login', {
    // `identifier`, not `username`: the route takes either a username or an
    // email and says so in the field name.
    identifier: ADMIN.username,
    password: ADMIN.password,
  })

  return { api: anon.withToken(access_token), token: access_token }
}
