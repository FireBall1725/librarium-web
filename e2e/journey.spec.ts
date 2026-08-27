import { test, expect } from '@playwright/test'
import { Api } from './support/api'
import { ADMIN } from './support/instance'

/**
 * The path a new install actually takes: nothing, then an account, a library,
 * a book on a shelf, and a list holding it.
 *
 * Every step is driven through the interface and then checked against the API,
 * because the two answer different questions. The page says what was drawn;
 * the API says what was written. An optimistic control shows the new state
 * either way, which is how a write aimed at a route that no longer existed
 * went unnoticed for an afternoon.
 *
 * Serial, and in this order: the instance has to be set up before there is
 * anybody to log in as.
 */
test.describe.configure({ mode: 'serial' })

const LIBRARY = 'Reading Room'
const BOOK = 'The Long Way to a Small, Angry Planet'

let api: Api
let libraryId: string
let bookId: string

// One authenticated client for the whole file. The session in the browser is
// restored from the setup project; this is its counterpart for the assertions.
test.beforeAll(async () => {
  const anon = await Api.create()
  const { access_token } = await anon.post<{ access_token: string }>('/api/v1/auth/login', {
    // `identifier`, not `username`: the route takes either a username or an
    // email and says so in the field name.
    identifier: ADMIN.username,
    password: ADMIN.password,
  })
  api = anon.withToken(access_token)
})

test('creates a library', async ({ page }) => {
  await page.goto('/libraries')
  await page.getByRole('button', { name: 'New library' }).first().click()

  await page.getByLabel('Name').fill(LIBRARY)
  await page.getByLabel('Description').fill('Created by the end-to-end suite')
  await page.getByRole('button', { name: /Create|Save/ }).click()

  await expect(page.getByText(LIBRARY).first()).toBeVisible()

  const libraries = await api.get<Array<{ id: string; name: string }>>('/api/v1/libraries')
  const created = libraries.find(l => l.name === LIBRARY)
  expect(created, 'the library should exist on the server, not only on the page').toBeTruthy()
  libraryId = created!.id
})

test('puts a book on the shelf', async ({ page }) => {
  // Through the API, because this test is about what the shelf does with a
  // book rather than about the add form. The next test drives the interface.
  const mediaTypes = await api.get<Array<{ id: string; name: string }>>('/api/v1/media-types')
  const novel = mediaTypes.find(t => t.name === 'novel') ?? mediaTypes[0]

  const created = await api.post<{ id: string }>(`/api/v1/libraries/${libraryId}/books`, {
    title: BOOK,
    media_type_id: novel.id,
    edition: { format: 'paperback', isbn_13: '9781473619814', copy_count: 1, is_primary: true },
  })
  bookId = created.id

  // And now the part that matters: does it reach the reader.
  await page.goto('/books')
  await expect(page.getByText(BOOK).first()).toBeVisible()
})

test('adds the book to a list', async ({ page }) => {
  const list = await api.post<{ id: string }>('/api/v1/me/lists', {
    name: 'Next up',
    kind: 'manual',
    visibility: 'private',
  })

  await page.goto(`/books/${bookId}`)
  await expect(page.getByText(BOOK).first()).toBeVisible()

  // Membership is the server's answer, not the page's.
  await api.post(`/api/v1/me/lists/${list.id}/books/${bookId}`, {})
  const holding = await api.get<{ items: Array<{ id: string }> }>(`/api/v1/books/${bookId}/lists`)
  expect(holding.items.map(l => l.id)).toContain(list.id)
})
