// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, ApiError } from '../../../auth/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 'pending' | 'processing' | 'done' | 'failed'

interface ImportItem {
  id: string
  row_number: number
  status: 'pending' | 'done' | 'skipped' | 'failed'
  title: string
  isbn: string
  message: string
  book_id?: string
}

interface ImportJob {
  id: string
  status: JobStatus
  total_rows: number
  processed_rows: number
  failed_rows: number
  skipped_rows: number
  created_at: string
  updated_at: string
  items?: ImportItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobStatus }) {
  const cfg: Record<JobStatus, { label: string; cls: string; spin?: boolean }> = {
    pending:    { label: 'Queued',     cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
    processing: { label: 'Processing', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', spin: true },
    done:       { label: 'Done',       cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
    failed:     { label: 'Failed',     cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  }
  const { label, cls, spin } = cfg[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {spin && <span className="w-2 h-2 rounded-full border border-blue-500 border-t-transparent animate-spin" />}
      {label}
    </span>
  )
}

function ItemStatusDot({ status }: { status: ImportItem['status'] }) {
  const cls: Record<ImportItem['status'], string> = {
    pending:  'bg-gray-300 dark:bg-gray-600',
    done:     'bg-green-500',
    skipped:  'bg-amber-400',
    failed:   'bg-red-500',
  }
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls[status]}`} />
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ProgressBar({ job }: { job: ImportJob }) {
  const pct = job.total_rows > 0
    ? Math.round((job.processed_rows / job.total_rows) * 100)
    : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            job.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

// ─── Job row ──────────────────────────────────────────────────────────────────

function JobRow({ job, libraryId }: { job: ImportJob; libraryId: string }) {
  const { callApi } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<ImportItem[] | null>(job.items ?? null)
  const [loadingItems, setLoadingItems] = useState(false)

  const toggleExpand = async () => {
    if (!expanded && items === null) {
      setLoadingItems(true)
      try {
        const full = await callApi<ImportJob>(`/api/v1/libraries/${libraryId}/imports/${job.id}`)
        setItems(full.items ?? [])
      } catch {
        setItems([])
      } finally {
        setLoadingItems(false)
      }
    }
    setExpanded(e => !e)
  }

  const successRows = job.status === 'done'
    ? job.processed_rows - job.failed_rows - job.skipped_rows
    : null

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        onClick={toggleExpand}
        className="w-full text-left px-5 py-4 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr_auto] items-center gap-4">
            <StatusBadge status={job.status} />

            <div className="min-w-0">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{formatDate(job.created_at)}</p>
              {(job.status === 'processing' || job.status === 'pending') ? (
                <ProgressBar job={job} />
              ) : (
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{job.total_rows} rows</span>
                  {successRows !== null && successRows > 0 && (
                    <span className="text-green-600 dark:text-green-400">{successRows} added</span>
                  )}
                  {job.skipped_rows > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">{job.skipped_rows} skipped</span>
                  )}
                  {job.failed_rows > 0 && (
                    <span className="text-red-600 dark:text-red-400">{job.failed_rows} failed</span>
                  )}
                </div>
              )}
            </div>

            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate max-w-[100px]">
              {job.id.slice(0, 8)}
            </span>
          </div>
        </div>
      </button>

      {/* Items list */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          {loadingItems ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-400 dark:text-gray-500">
              <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mr-2" />
              Loading…
            </div>
          ) : items && items.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map(item => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500 w-8 flex-shrink-0 pt-0.5 text-right">
                    {item.row_number}
                  </span>
                  <ItemStatusDot status={item.status} />
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-800 dark:text-gray-200 font-medium">
                      {item.title || <span className="text-gray-400 dark:text-gray-500 italic">Untitled</span>}
                    </span>
                    {item.isbn && (
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-mono">{item.isbn}</span>
                    )}
                    {item.message && (
                      <p className={`text-xs mt-0.5 ${
                        item.status === 'failed'
                          ? 'text-red-600 dark:text-red-400'
                          : item.status === 'skipped'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {item.message}
                      </p>
                    )}
                  </div>
                  {item.book_id && (
                    <Link
                      to={`/libraries/${libraryId}/books/${item.book_id}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      View
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-4 text-sm text-gray-400 dark:text-gray-500">No items.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ImportJobsPage ───────────────────────────────────────────────────────────

export default function ImportJobsPage() {
  const { libraryId } = useParams<{ libraryId: string }>()
  const { callApi } = useAuth()

  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadJobs = async () => {
    if (!libraryId) return
    try {
      const data = await callApi<ImportJob[]>(`/api/v1/libraries/${libraryId}/imports`)
      setJobs(data ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load import jobs')
    } finally {
      setLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    loadJobs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId])

  // Poll while any job is active
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'processing')
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(loadJobs, 3000)
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500">
        <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex justify-end mb-6">
        <Link
          to={`/libraries/${libraryId}/settings/import`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          New Import
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No import jobs yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">
            Start your first import to populate this library.
          </p>
          <Link
            to={`/libraries/${libraryId}/settings/import`}
            className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Start Import
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <JobRow key={job.id} job={job} libraryId={libraryId!} />
          ))}
        </div>
      )}
    </div>
  )
}
