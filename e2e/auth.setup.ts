import { test as setup, expect } from '@playwright/test'
import { Api } from './support/api'
import { ADMIN, STORAGE_STATE } from './support/instance'

/**
 * Gets the instance to a state the rest of the suite can start from, and saves
 * the session so every other spec begins signed in.
 *
 * A Playwright test gets a fresh browser context, so a sign-in performed inside
 * one test is gone by the next. Repeating it per spec would mean every test
 * spends its first ten seconds proving login works, which is one test's job.
 *
 * Setting the instance up is itself part of what is being tested, so it is
 * driven through the interface rather than posted to the API: this is the only
 * chance to walk it, since the route refuses once an instance has an admin.
 */
setup('set the instance up and sign in', async ({ page }) => {
  const api = await Api.create()
  const { initialized } = await api.get<{ initialized: boolean }>('/api/v1/setup/status')

  if (!initialized) {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Welcome to Librarium' })).toBeVisible()

    await page.getByLabel('Display name').fill(ADMIN.displayName)
    await page.getByLabel('Username').fill(ADMIN.username)
    await page.getByLabel('Email').fill(ADMIN.email)
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByLabel('Confirm password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Create admin account' }).click()

    await expect(page.getByRole('heading', { name: "You're in" })).toBeVisible()

    // The page said it worked. This is the instance saying so.
    const after = await api.get<{ initialized: boolean }>('/api/v1/setup/status')
    expect(after.initialized, 'the admin should exist on the server').toBe(true)

    await page.getByRole('button', { name: 'Go to dashboard' }).click()
  } else {
    await page.goto('/')
    await page.getByLabel('Username or email').fill(ADMIN.username)
    await page.getByLabel('Password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
  }

  // Signed in, whichever way we got here.
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeHidden()
  await page.context().storageState({ path: STORAGE_STATE })
})
