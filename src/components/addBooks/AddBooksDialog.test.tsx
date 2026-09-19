// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import common from '../../../public/locales/en-CA/common.json'
import type { MergedBookResult } from '../../types'
import { ToastProvider } from '../Toast'

// Every request the dialog makes, answered from this table.
type Call = { path: string; method: string; body: unknown }
let calls: Call[] = []
let routes: Record<string, (body: unknown) => unknown> = {}

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

vi.mock('../../auth/AuthContext', () => ({
  ApiError,
  useAuth: () => ({
    callApi: async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ path, method, body })
      // The longest matching route, so /libraries doesn't answer /libraries/x/books.
      const key = Object.keys(routes).filter(k => `${method} ${path}`.startsWith(k)).sort((a, b) => b.length - a.length)[0]
      if (!key) throw new ApiError(404, `no route for ${method} ${path}`)
      return routes[key](body)
    },
  }),
}))

// The real English strings, so interpolated labels read as they do in the app.
await i18n.use(initReactI18next).init({
  lng: 'en-CA', ns: ['common'], defaultNS: 'common',
  resources: { 'en-CA': { common } },
  interpolation: { escapeValue: false },
})

const { default: AddBooksDialog } = await import('./AddBooksDialog')

const hybrids: MergedBookResult = {
  title: { value: 'Hybrids', source: 'hardcover', source_display: 'Hardcover', alternatives: [] },
  authors: { value: 'Robert J. Sawyer', values: ['Robert J. Sawyer'], source: 'hardcover', source_display: 'Hardcover', alternatives: [] },
  publish_date: {
    value: '2003-09-01', source: 'hardcover', source_display: 'Hardcover',
    alternatives: [{ value: '2003', source: 'openlibrary', source_display: 'Open Library' }],
  },
  isbn_13: { value: '9780765349064', source: 'hardcover', source_display: 'Hardcover', alternatives: [] },
  categories: [],
  covers: [],
}

const libraries = [
  { id: 'lib-a', name: 'Test Library' },
  { id: 'lib-b', name: 'Book Collection' },
]
const places = [
  { id: 'case', library_id: 'lib-b', name: 'Bookcase 1', parent_id: null, copy_count: 0, created_at: '', shelf_count: 4 },
  { id: 's3', library_id: 'lib-b', name: 'Shelf 3', parent_id: 'case', copy_count: 0, created_at: '' },
]

// Node's own localStorage shadows jsdom's and is empty without a file, so the
// dialog's remembered mode and queue get a plain in-memory one.
const memory = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => { memory.set(k, String(v)) },
    removeItem: (k: string) => { memory.delete(k) },
    clear: () => memory.clear(),
  },
})

beforeEach(() => {
  calls = []
  window.localStorage.clear()
  routes = {
    'GET /api/v1/libraries/lib-b/locations': () => ({ items: places }),
    'GET /api/v1/libraries/lib-a/locations': () => ({ items: [] }),
    'GET /api/v1/libraries': () => libraries,
    'GET /api/v1/auth/me/preferences': () => ({
      prefs: { add_books: { last_library_id: 'lib-b', by_library: { 'lib-b': { location_id: 's3', read_status: 'read' } } } },
    }),
    'PATCH /api/v1/auth/me/preferences': () => ({}),
    'GET /api/v1/me/lists': () => [],
    'GET /api/v1/lookup/isbn/9780765349064/merged': () => hybrids,
    'GET /api/v1/lookup/isbn/9780000000002/merged': () => ({ categories: [], covers: [] }),
    'GET /api/v1/libraries/lib-b/book-by-isbn/': () => null,
    'POST /api/v1/libraries/lib-b/books': () => ({ id: 'book-1', title: 'Hybrids' }),
    'PUT /api/v1/books/book-1/me': () => ({}),
    'GET /api/v1/books/book-1/copies': () => ({ items: [{ id: 'copy-1', library_id: 'lib-b', created_at: '2026-09-19' }] }),
    'DELETE /api/v1/copies/copy-1': () => null,
  }
})
afterEach(() => { vi.restoreAllMocks() })

const open = (props: Partial<Parameters<typeof AddBooksDialog>[0]> = {}) => render(
  <MemoryRouter>
    <ToastProvider>
      <AddBooksDialog mediaTypes={[]} onClose={() => {}} onSaved={() => {}} {...props} />
    </ToastProvider>
  </MemoryRouter>,
)

const scanInto = (box: HTMLElement, code: string) => {
  fireEvent.change(box, { target: { value: code } })
  fireEvent.keyDown(box, { key: 'Enter' })
}

describe('One book', () => {
  it('opens on the remembered library and shelf, and says where the book goes', async () => {
    window.localStorage.setItem('librarium:add-books:mode', 'one')
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    expect(screen.getByLabelText('Library')).toHaveValue('lib-b')
    scanInto(screen.getByLabelText('Scan, or type an ISBN, UPC or title'), '9780765349064')
    expect(await screen.findByRole('button', { name: /Add to Book Collection › Shelf 3/ })).toBeInTheDocument()
    // The field the providers disagreed on says so, and nothing is added yet.
    expect(screen.getByRole('button', { name: '2 answers' })).toBeInTheDocument()
    expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/books'))).toBe(false)
  })

  it('adds on the button: filed on the shelf, authors by name, read status set', async () => {
    window.localStorage.setItem('librarium:add-books:mode', 'one')
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    scanInto(screen.getByLabelText('Scan, or type an ISBN, UPC or title'), '9780765349064')
    fireEvent.click(await screen.findByRole('button', { name: /Add to Book Collection/ }))
    await screen.findByText('Added Hybrids')
    const post = calls.find(c => c.method === 'POST' && c.path === '/api/v1/libraries/lib-b/books')!
    expect(post.body).toMatchObject({
      title: 'Hybrids',
      location_id: 's3',
      contributors: [{ name: 'Robert J. Sawyer', role: 'author', display_order: 0 }],
    })
    expect(calls.find(c => c.method === 'PUT' && c.path === '/api/v1/books/book-1/me')?.body).toEqual({ read_status: 'read' })
  })

  it('takes the newest copy back out on Undo', async () => {
    window.localStorage.setItem('librarium:add-books:mode', 'one')
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    scanInto(screen.getByLabelText('Scan, or type an ISBN, UPC or title'), '9780765349064')
    fireEvent.click(await screen.findByRole('button', { name: /Add to Book Collection/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(calls.some(c => c.method === 'DELETE' && c.path === '/api/v1/copies/copy-1')).toBe(true))
  })

  it('remembers a new place for next time', async () => {
    window.localStorage.setItem('librarium:add-books:mode', 'one')
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'case' } })
    const patch = calls.find(c => c.method === 'PATCH')!
    expect(patch.body).toMatchObject({ add_books: { last_library_id: 'lib-b', by_library: { 'lib-b': { location_id: 'case' } } } })
  })
})

describe('Many books', () => {
  it('adds a clean match straight away and holds a miss in Needs you', async () => {
    window.localStorage.setItem('librarium:add-books:mode', 'many')
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    const box = screen.getByLabelText('Scan, or type an ISBN or UPC')
    await act(async () => { scanInto(box, '9780765349064') })
    await act(async () => { scanInto(box, '9780000000002') })
    await waitFor(() => expect(calls.some(c => c.method === 'POST' && c.path === '/api/v1/libraries/lib-b/books')).toBe(true))
    expect(await screen.findByText('No provider knew this barcode.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Needs you/ })).toHaveTextContent('1'))
    expect(screen.getByRole('tab', { name: /Added/ })).toHaveTextContent('1')
  })

  it('keeps the queue when the dialog is opened again', async () => {
    window.localStorage.setItem('librarium:add-books:mode', 'many')
    const first = open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    await act(async () => { scanInto(screen.getByLabelText('Scan, or type an ISBN or UPC'), '9780000000002') })
    await screen.findByText('No provider knew this barcode.')
    first.unmount()
    open()
    expect(await screen.findByText('No provider knew this barcode.')).toBeInTheDocument()
  })
})
