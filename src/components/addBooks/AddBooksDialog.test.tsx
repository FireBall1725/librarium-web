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
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    scanInto(screen.getByLabelText('Scan, or type an ISBN, UPC or title'), '9780765349064')
    fireEvent.click(await screen.findByRole('button', { name: /Add to Book Collection/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(calls.some(c => c.method === 'DELETE' && c.path === '/api/v1/copies/copy-1')).toBe(true))
  })

  it('remembers a new place for next time', async () => {
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'case' } })
    const patch = calls.find(c => c.method === 'PATCH')!
    expect(patch.body).toMatchObject({ add_books: { last_library_id: 'lib-b', by_library: { 'lib-b': { location_id: 'case' } } } })
  })
})

describe('Edit details first', () => {
  const editFirst = async () => {
    routes['GET /api/v1/libraries/lib-b/series'] = () => [{ id: 'hgttg', name: "The Hitchhiker's Guide" }]
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    scanInto(screen.getByLabelText('Scan, or type an ISBN, UPC or title'), '9780765349064')
    fireEvent.click(await screen.findByRole('button', { name: 'Edit details first' }))
    await screen.findByRole('heading', { name: 'Add a book by hand' })
  }
  // The title lands once the form has its genres, so wait for it.
  const save = async () => fireEvent.submit((await screen.findByDisplayValue('Hybrids')).closest('form')!)

  it('starts over after the form adds the book, like the Add button does', async () => {
    await editFirst()
    await save()
    await screen.findByText('Added Hybrids')
    // The card the form came from is gone, so there is nothing to add twice.
    expect(screen.queryByRole('button', { name: /Add to Book Collection/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Scan, or type an ISBN, UPC or title')).toHaveValue('')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Close without adding this book?')).not.toBeInTheDocument()
  })

  it('puts the book in a series at a tenth position', async () => {
    await editFirst()
    fireEvent.click(await screen.findByRole('button', { name: '+ Add to a series' }))
    const series = screen.getByLabelText('Series')
    await waitFor(() => expect(series.querySelectorAll('option')).toHaveLength(2))
    fireEvent.change(series, { target: { value: 'hgttg' } })
    const position = screen.getByLabelText('Volume number')
    expect(position).toHaveAttribute('step', '0.1')
    fireEvent.change(position, { target: { value: '0.1' } })
    routes['POST /api/v1/libraries/lib-b/series/hgttg/books'] = () => ({})
    await save()
    await screen.findByText('Added Hybrids')
    expect(calls.find(c => c.method === 'POST' && c.path === '/api/v1/libraries/lib-b/series/hgttg/books')?.body)
      .toEqual({ book_id: 'book-1', position: 0.1 })
  })
})

describe('Many books', () => {
  it('holds found books for one Add button, and a miss in Needs you', async () => {
    open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    fireEvent.click(screen.getByRole('tab', { name: 'Many books' }))
    const box = screen.getByLabelText('Scan, or type an ISBN or UPC')
    await act(async () => { scanInto(box, '9780765349064') })
    await act(async () => { scanInto(box, '9780000000002') })
    expect(await screen.findByText('No provider knew this barcode.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Ready/ })).toHaveTextContent('1'))
    expect(screen.getByRole('tab', { name: /Needs you/ })).toHaveTextContent('1')
    // Nothing is added until the button says so.
    expect(calls.some(c => c.method === 'POST' && c.path === '/api/v1/libraries/lib-b/books')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Add 1 book' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /Added/ })).toHaveTextContent('1'))
    expect(calls.find(c => c.method === 'POST' && c.path === '/api/v1/libraries/lib-b/books')?.body).toMatchObject({ location_id: 's3' })
  })

  it('opens on One book', async () => {
    open()
    expect(await screen.findByRole('tab', { name: 'One book' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps the queue when the dialog is opened again', async () => {
    const first = open()
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    fireEvent.click(screen.getByRole('tab', { name: 'Many books' }))
    await act(async () => { scanInto(screen.getByLabelText('Scan, or type an ISBN or UPC'), '9780000000002') })
    await screen.findByText('No provider knew this barcode.')
    first.unmount()
    open()
    fireEvent.click(await screen.findByRole('tab', { name: 'Many books' }))
    expect(await screen.findByText('No provider knew this barcode.')).toBeInTheDocument()
  })

  it('asks before closing on books still waiting, and starts clean after', async () => {
    const onClose = vi.fn()
    const first = open({ onClose })
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    fireEvent.click(screen.getByRole('tab', { name: 'Many books' }))
    await act(async () => { scanInto(screen.getByLabelText('Scan, or type an ISBN or UPC'), '9780000000002') })
    await screen.findByText('No provider knew this barcode.')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(await screen.findByText('Close with 1 book still waiting?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('No provider knew this barcode.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Close anyway' }))
    expect(onClose).toHaveBeenCalled()
    first.unmount()
    open()
    fireEvent.click(await screen.findByRole('tab', { name: 'Many books' }))
    expect(await screen.findByText('Nothing scanned yet')).toBeInTheDocument()
  })
})

describe('Closing', () => {
  it('closes straight away when nothing is waiting', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('asks before dropping a found book that was never added', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await waitFor(() => expect(screen.getByLabelText('Place')).toHaveValue('s3'))
    scanInto(screen.getByLabelText('Scan, or type an ISBN, UPC or title'), '9780765349064')
    await screen.findByRole('button', { name: /Add to Book Collection/ })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(await screen.findByText('Close without adding this book?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
