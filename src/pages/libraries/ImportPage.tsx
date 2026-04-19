// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import type { LibraryOutletContext } from '../../components/LibraryOutlet'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportJob {
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  total_rows: number
  processed_rows: number
  failed_rows: number
  skipped_rows: number
}

// ─── Field definitions ────────────────────────────────────────────────────────

const IMPORT_FIELDS: { value: string; label: string }[] = [
  { value: 'title',        label: 'Title' },
  { value: 'isbn_13',      label: 'ISBN-13' },
  { value: 'isbn_10',      label: 'ISBN-10' },
  { value: 'author',       label: 'Author' },
  { value: 'publisher',    label: 'Publisher' },
  { value: 'publish_date', label: 'Publish Date' },
  { value: 'description',  label: 'Description' },
  { value: 'page_count',   label: 'Page Count' },
  { value: 'language',     label: 'Language' },
  { value: 'tags',         label: 'Tags' },
]

const FORMAT_OPTIONS = [
  { value: 'paperback',  label: 'Paperback' },
  { value: 'hardcover',  label: 'Hardcover' },
  { value: 'ebook',      label: 'E-Book' },
  { value: 'audiobook',  label: 'Audiobook' },
  { value: 'digital',    label: 'Digital' },
]

// ─── Auto-detect mapping from CSV header ─────────────────────────────────────

function autoDetect(header: string): string {
  const h = header.toLowerCase().replace(/[\s\-_.]/g, '')
  if (['isbn13', 'isbn', 'ean', 'barcode', 'ean13', 'eanisbn13', 'eanisbn'].includes(h)) return 'isbn_13'
  if (['isbn10', 'upc', 'upcisbn10', 'upcisbn', 'upc10'].includes(h)) return 'isbn_10'
  if (['title', 'booktitle', 'name', 'worktitle'].includes(h)) return 'title'
  if (['author', 'authors', 'writer', 'authorlf', 'authorname', 'creators', 'creator', 'artist'].includes(h)) return 'author'
  if (['publisher', 'pub', 'publishedby'].includes(h)) return 'publisher'
  if (['yearpublished', 'originalpublicationyear', 'publisheddate', 'publishdate', 'publicationdate'].includes(h)) return 'publish_date'
  if (['description', 'summary', 'synopsis'].includes(h)) return 'description'
  if (['pagecount', 'pages', 'numberofpages', 'length', 'numpages', 'pagenum'].includes(h)) return 'page_count'
  if (['language', 'lang', 'booklanguage'].includes(h)) return 'language'
  if (['tags', 'tag', 'genre', 'genres', 'category', 'categories', 'subjects', 'subject'].includes(h)) return 'tags'
  return ''
}

// ─── CSV header parser (first row only) ──────────────────────────────────────

function parseCSVHeaders(text: string): string[] {
  const firstLine = text.split('\n')[0] ?? ''
  const commas = (firstLine.match(/,/g) ?? []).length
  const semis  = (firstLine.match(/;/g) ?? []).length
  const tabs   = (firstLine.match(/\t/g) ?? []).length
  const delim  = tabs > commas && tabs > semis ? '\t' : semis > commas ? ';' : ','

  const fields: string[] = []
  let field = ''
  let inQ = false
  const src = firstLine.replace(/\r/g, '')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '"') {
      if (inQ && src[i + 1] === '"') { field += '"'; i++ }
      else inQ = !inQ
    } else if (ch === delim && !inQ) {
      fields.push(field.trim().replace(/^"|"$/g, ''))
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field.trim().replace(/^"|"$/g, ''))
  return fields.filter(f => f !== '' || fields.length > 1)
}

// ─── Step indicators ──────────────────────────────────────────────────────────

type Step = 1 | 2 | 3

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1 as Step, label: 'Upload & Map' },
    { n: 2 as Step, label: 'Progress' },
    { n: 3 as Step, label: 'Results' },
  ]
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              current === s.n
                ? 'bg-blue-600 text-white'
                : current > s.n
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
            }`}>
              {current > s.n ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : s.n}
            </div>
            <span className={`text-sm font-medium ${
              current === s.n
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-400 dark:text-gray-500'
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-3 h-px w-12 transition-colors ${
              current > s.n ? 'bg-blue-400 dark:bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
            }`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── ImportPage ───────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { libraryId } = useParams<{ libraryId: string }>()
  const { callApi } = useAuth()
  const { setExtraCrumbs } = useOutletContext<LibraryOutletContext>()

  const [step, setStep] = useState<Step>(1)

  // Step 1 state
  const [isDragging, setIsDragging] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  // mapping: field name → column index (number) | null
  const [mapping, setMapping] = useState<Record<string, number | null>>({})
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [defaultFormat, setDefaultFormat] = useState('paperback')
  const [enrichMetadata, setEnrichMetadata] = useState(false)
  const [enrichCovers, setEnrichCovers] = useState(false)
  // preferCsv: field name → boolean; defaults to true (prefer CSV) for all auto-detected fields
  const [preferCsv, setPreferCsv] = useState<Record<string, boolean>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 2 state
  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Set breadcrumb
  useEffect(() => {
    setExtraCrumbs([{ label: 'Import' }])
    return () => setExtraCrumbs([])
  }, [setExtraCrumbs])

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── File handling ────────────────────────────────────────────────────────────

  const processFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const hdrs = parseCSVHeaders(text)
      if (hdrs.length === 0 || (hdrs.length === 1 && !hdrs[0])) {
        setSubmitError('The file appears empty or invalid.')
        return
      }
      setCsvFile(file)
      setHeaders(hdrs)
      // Auto-detect mapping
      const auto: Record<string, number | null> = {}
      for (const field of IMPORT_FIELDS) {
        auto[field.value] = null
      }
      const initPreferCsv: Record<string, boolean> = {}
      hdrs.forEach((h, i) => {
        const detected = autoDetect(h)
        if (detected && auto[detected] === null) {
          auto[detected] = i
          initPreferCsv[detected] = true
        }
      })
      setMapping(auto)
      setPreferCsv(initPreferCsv)
      setSubmitError(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  // ── Submit import ────────────────────────────────────────────────────────────

  const handleStartImport = async () => {
    if (!csvFile || !libraryId) return
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Build the mapping object: fieldName → columnIndex (only mapped fields)
      const mappingObj: Record<string, number> = {}
      for (const [field, colIdx] of Object.entries(mapping)) {
        if (colIdx !== null && colIdx !== undefined) {
          mappingObj[field] = colIdx
        }
      }

      // Build prefer_csv object
      const preferCsvObj: Record<string, boolean> = {}
      for (const [field, val] of Object.entries(preferCsv)) {
        if (val) preferCsvObj[field] = true
      }

      const formData = new FormData()
      formData.append('file', csvFile)
      formData.append('mapping', JSON.stringify(mappingObj))
      formData.append('skip_duplicates', skipDuplicates ? 'true' : 'false')
      formData.append('default_format', defaultFormat)
      formData.append('enrich_metadata', enrichMetadata ? 'true' : 'false')
      formData.append('enrich_covers', enrichCovers ? 'true' : 'false')
      if (Object.keys(preferCsvObj).length > 0) {
        formData.append('prefer_csv', JSON.stringify(preferCsvObj))
      }

      const job = await callApi<ImportJob>(`/api/v1/libraries/${libraryId}/imports`, {
        method: 'POST',
        body: formData,
      })

      setImportJob(job)
      setStep(2)
      startPolling(job.id)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start import')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Polling ──────────────────────────────────────────────────────────────────

  const startPolling = (importId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      if (!libraryId) return
      try {
        const job = await callApi<ImportJob>(`/api/v1/libraries/${libraryId}/imports/${importId}`)
        setImportJob(job)
        if (job.status === 'done' || job.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setStep(3)
        }
      } catch {
        // Non-fatal — keep polling
      }
    }, 2000)
  }

  // ── Reset ────────────────────────────────────────────────────────────────────

  const handleReset = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setCsvFile(null)
    setHeaders([])
    setMapping({})
    setPreferCsv({})
    setImportJob(null)
    setSubmitError(null)
    setStep(1)
  }

  // ── Mapping helpers ──────────────────────────────────────────────────────────

  const setFieldMapping = (fieldValue: string, colIdx: number | null) => {
    setMapping(prev => ({ ...prev, [fieldValue]: colIdx }))
  }

  const mappedFields = new Set(
    Object.entries(mapping)
      .filter(([, v]) => v !== null)
      .map(([k]) => k)
  )

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <StepIndicator current={step} />

      {/* ── Step 1: Upload & Map ── */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer p-10 text-center ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : csvFile
                  ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/10'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFileChange}
              onClick={e => e.stopPropagation()}
            />
            {csvFile ? (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium text-gray-900 dark:text-white">{csvFile.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {headers.length} column{headers.length !== 1 ? 's' : ''} detected &mdash; click to change file
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="font-medium text-gray-700 dark:text-gray-300">
                  Drop a CSV file here, or click to browse
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">CSV, TSV, or TXT with comma/semicolon/tab delimiters</p>
              </div>
            )}
          </div>

          {/* Column mapping table */}
          {headers.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Column Mapping</h3>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-2/5">Book Field</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-2/5">CSV Column</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-1/5">Prefer CSV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {IMPORT_FIELDS.map(field => (
                      <tr key={field.value} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                          {field.label}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={mapping[field.value] === null || mapping[field.value] === undefined ? '' : String(mapping[field.value])}
                            onChange={e => setFieldMapping(field.value, e.target.value === '' ? null : Number(e.target.value))}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">— skip —</option>
                            {headers.map((h, i) => (
                              <option key={i} value={String(i)}>
                                {h || `Column ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          {mapping[field.value] !== null && mapping[field.value] !== undefined ? (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={preferCsv[field.value] ?? true}
                                onChange={e => setPreferCsv(prev => ({ ...prev, [field.value]: e.target.checked }))}
                                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                              />
                              <span className="text-xs text-gray-500 dark:text-gray-400">Over lookup</span>
                            </label>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappedFields.size === 0 && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Map at least one field to proceed.
                </p>
              )}
            </div>
          )}

          {/* Import options */}
          {headers.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Import Options</h3>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Skip duplicates</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Books already in the library will be skipped</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={e => setSkipDuplicates(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Default format</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Applied when the CSV does not specify a format</p>
                  </div>
                  <select
                    value={defaultFormat}
                    onChange={e => setDefaultFormat(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {FORMAT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Use metadata lookup for missing data</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">After import, look up each book from metadata providers to fill in any blank fields (runs in background)</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enrichMetadata} onChange={e => setEnrichMetadata(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Fetch cover images from metadata</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">After import, download cover art for each book from metadata providers (runs in background)</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enrichCovers} onChange={e => setEnrichCovers(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {submitError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {submitError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleStartImport}
              disabled={!csvFile || mappedFields.size === 0 || isSubmitting}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Starting…' : 'Start Import'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Progress ── */}
      {step === 2 && importJob && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {importJob.status === 'pending'
                    ? 'Queued…'
                    : `Processing… ${importJob.processed_rows}/${importJob.total_rows} rows`}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {importJob.total_rows > 0
                    ? `${Math.round((importJob.processed_rows / importJob.total_rows) * 100)}%`
                    : '—'}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  style={{
                    width: importJob.total_rows > 0
                      ? `${(importJob.processed_rows / importJob.total_rows) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-5">
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-white">{importJob.processed_rows}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Processed</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-center">
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{importJob.failed_rows}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Failed</p>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-center">
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{importJob.skipped_rows}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Skipped</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            Checking for updates every 2 seconds…
          </div>
        </div>
      )}

      {/* ── Step 3: Results ── */}
      {step === 3 && importJob && (
        <div className="space-y-6">
          <div className={`rounded-xl border p-6 ${
            importJob.status === 'failed'
              ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
              : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {importJob.status === 'failed' ? (
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <div>
                <p className={`font-semibold text-base ${
                  importJob.status === 'failed'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-green-700 dark:text-green-400'
                }`}>
                  {importJob.status === 'failed' ? 'Import failed' : 'Import complete'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {importJob.total_rows} row{importJob.total_rows !== 1 ? 's' : ''} in total
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-white dark:bg-gray-900/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{importJob.processed_rows}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Processed</p>
              </div>
              <div className="rounded-lg bg-white dark:bg-gray-900/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importJob.failed_rows}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Failed</p>
              </div>
              <div className="rounded-lg bg-white dark:bg-gray-900/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{importJob.skipped_rows}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Skipped</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Import another file
            </button>
            <Link
              to={`/libraries/${libraryId}/books`}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Go to Books
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
