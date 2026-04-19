// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../auth/AuthContext'
import type { Library } from '../../types'

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
  { value: 'title',         label: 'Title' },
  { value: 'subtitle',      label: 'Subtitle' },
  { value: 'isbn_13',       label: 'ISBN-13' },
  { value: 'isbn_10',       label: 'ISBN-10' },
  { value: 'author',        label: 'Author' },
  { value: 'publisher',     label: 'Publisher' },
  { value: 'publish_date',  label: 'Publish Date' },
  { value: 'acquired_date', label: 'Acquired Date' },
  { value: 'description',   label: 'Description' },
  { value: 'page_count',    label: 'Page Count' },
  { value: 'language',      label: 'Language' },
  { value: 'tags',          label: 'Tags' },
  { value: 'media_type',    label: 'Media Type' },
]

const FORMAT_OPTIONS = [
  { value: 'paperback',  label: 'Paperback' },
  { value: 'hardcover',  label: 'Hardcover' },
  { value: 'ebook',      label: 'E-Book' },
  { value: 'audiobook',  label: 'Audiobook' },
  { value: 'digital',    label: 'Digital' },
]

// ─── Auto-detect ──────────────────────────────────────────────────────────────

function autoDetect(header: string): string {
  const h = header.toLowerCase().replace(/[\s\-_.]/g, '')
  if (['isbn13', 'isbn', 'ean', 'barcode', 'ean13', 'eanisbn13', 'eanisbn'].includes(h)) return 'isbn_13'
  if (['isbn10', 'upc', 'upcisbn10', 'upcisbn', 'upc10'].includes(h)) return 'isbn_10'
  if (['title', 'booktitle', 'name', 'worktitle'].includes(h)) return 'title'
  if (['subtitle', 'sub', 'booktitlesubtitle'].includes(h)) return 'subtitle'
  if (['author', 'authors', 'writer', 'authorlf', 'authorname', 'creators', 'creator', 'artist'].includes(h)) return 'author'
  if (['publisher', 'pub', 'publishedby'].includes(h)) return 'publisher'
  if (['yearpublished', 'originalpublicationyear', 'publisheddate', 'publishdate', 'publicationdate'].includes(h)) return 'publish_date'
  if (['acquiredat', 'acquireddate', 'dateacquired', 'purchasedate', 'datepurchased'].includes(h)) return 'acquired_date'
  if (['description', 'summary', 'synopsis'].includes(h)) return 'description'
  if (['pagecount', 'pages', 'numberofpages', 'length', 'numpages', 'pagenum'].includes(h)) return 'page_count'
  if (['language', 'lang', 'booklanguage'].includes(h)) return 'language'
  if (['tags', 'tag', 'genre', 'genres', 'category', 'categories', 'subjects', 'subject'].includes(h)) return 'tags'
  if (['mediatype', 'type', 'format', 'booktype', 'bookformat', 'bindingtype'].includes(h)) return 'media_type'
  return ''
}

// ─── CSV preview parser ───────────────────────────────────────────────────────
// Returns headers (first row) and up to 3 sample rows of data.

function parseCSVPreview(text: string): { headers: string[]; samples: string[][] } {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const firstLine = raw.split('\n')[0] ?? ''
  const commas = (firstLine.match(/,/g) ?? []).length
  const semis  = (firstLine.match(/;/g) ?? []).length
  const tabs   = (firstLine.match(/\t/g) ?? []).length
  const delim  = tabs > commas && tabs > semis ? '\t' : semis > commas ? ';' : ','

  const parseLine = (line: string): string[] => {
    const fields: string[] = []
    let field = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++ }
        else inQ = !inQ
      } else if (ch === delim && !inQ) {
        fields.push(field.trim().replace(/^"|"$/g, ''))
        field = ''
      } else {
        field += ch
      }
    }
    fields.push(field.trim().replace(/^"|"$/g, ''))
    return fields
  }

  const lines = raw.split('\n').filter(l => l.trim() !== '')
  if (lines.length === 0) return { headers: [], samples: [] }

  const headers = parseLine(lines[0])
  const samples: string[][] = []
  for (let i = 1; i < Math.min(4, lines.length); i++) {
    samples.push(parseLine(lines[i]))
  }
  return { headers, samples }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Library' },
  { n: 2, label: 'Upload & Map' },
  { n: 3, label: 'Progress' },
  { n: 4, label: 'Results' },
]

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
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
              current === s.n ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
            }`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-3 h-px w-10 transition-colors ${
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
  const { callApi } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  usePageTitle('Import Books')

  const [step, setStep] = useState<Step>(1)

  // Step 1 — library selection
  const [libraries, setLibraries] = useState<Library[]>([])
  const [libsLoading, setLibsLoading] = useState(true)
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null)

  // Step 2 — upload & map
  const [isDragging, setIsDragging] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [csvSamples, setCsvSamples] = useState<string[][]>([])
  // csvMapping: colIndex → internal field name ('' = skip)
  const [csvMapping, setCsvMapping] = useState<Record<number, string>>({})
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [defaultFormat, setDefaultFormat] = useState('paperback')
  const [enrichMetadata, setEnrichMetadata] = useState(false)
  const [enrichCovers, setEnrichCovers] = useState(false)
  // preferCsv: internal field name → true means use CSV value; defaults to true for all mapped fields
  const [preferCsv, setPreferCsv] = useState<Record<string, boolean>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 3 — progress
  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load libraries on mount; auto-select if ?library=<id> is present
  useEffect(() => {
    const preselect = searchParams.get('library')
    callApi<Library[]>('/api/v1/libraries')
      .then(libs => {
        const list = libs ?? []
        setLibraries(list)
        if (preselect) {
          const match = list.find(l => l.id === preselect)
          if (match) { setSelectedLibrary(match); setStep(2) }
        }
      })
      .catch(() => setLibraries([]))
      .finally(() => setLibsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── File handling ─────────────────────────────────────────────────────────

  const processFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const { headers: hdrs, samples } = parseCSVPreview(text)
      if (hdrs.length === 0 || (hdrs.length === 1 && !hdrs[0])) {
        setSubmitError('The file appears empty or invalid.')
        return
      }
      setCsvFile(file)
      setHeaders(hdrs)
      setCsvSamples(samples)
      const auto: Record<number, string> = {}
      const initPreferCsv: Record<string, boolean> = {}
      hdrs.forEach((h, i) => {
        const field = autoDetect(h)
        auto[i] = field
        if (field) initPreferCsv[field] = true
      })
      setCsvMapping(auto)
      setPreferCsv(initPreferCsv)
      setSubmitError(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleStartImport = async () => {
    if (!csvFile || !selectedLibrary) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      // Invert: colIndex→field to field→colIndex (first mapped col wins per field)
      const mappingObj: Record<string, number> = {}
      for (const [colStr, field] of Object.entries(csvMapping)) {
        if (field && !(field in mappingObj)) {
          mappingObj[field] = Number(colStr)
        }
      }
      const preferCsvObj: Record<string, boolean> = {}
      for (const [f, v] of Object.entries(preferCsv)) {
        if (v) preferCsvObj[f] = true
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
      const job = await callApi<ImportJob>(`/api/v1/libraries/${selectedLibrary.id}/imports`, {
        method: 'POST',
        body: formData,
      })
      setImportJob(job)
      setStep(3)
      startPolling(job.id, selectedLibrary.id)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start import')
    } finally {
      setIsSubmitting(false)
    }
  }

  const startPolling = (importId: string, libraryId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const job = await callApi<ImportJob>(`/api/v1/libraries/${libraryId}/imports/${importId}`)
        setImportJob(job)
        if (job.status === 'done' || job.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setStep(4)
        }
      } catch { /* non-fatal */ }
    }, 2000)
  }

  const handleReset = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setSelectedLibrary(null)
    setCsvFile(null)
    setHeaders([])
    setCsvSamples([])
    setCsvMapping({})
    setPreferCsv({})
    setImportJob(null)
    setSubmitError(null)
    setStep(1)
  }

  const anyMapped = Object.values(csvMapping).some(f => f !== '')

  // Track which internal fields are already claimed (for duplicate-mapping highlight)
  const fieldUsage: Record<string, number[]> = {}
  for (const [colStr, field] of Object.entries(csvMapping)) {
    if (field) {
      if (!fieldUsage[field]) fieldUsage[field] = []
      fieldUsage[field].push(Number(colStr))
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Import Books"
        description="Select a library, upload a CSV file, and queue a background import."
      />
      <div className="p-8 max-w-3xl mx-auto">
      <StepIndicator current={step} />

      {/* ── Step 1: Select Library ── */}
      {step === 1 && (
        <div className="space-y-4">
          {libsLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : libraries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No libraries found.</p>
              <Link to="/libraries" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Create a library first →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {libraries.map(lib => (
                <button
                  key={lib.id}
                  onClick={() => { setSelectedLibrary(lib); setStep(2) }}
                  className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 px-5 py-4 transition-colors group"
                >
                  <p className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300">
                    {lib.name}
                  </p>
                  {lib.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{lib.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Upload & Map ── */}
      {step === 2 && selectedLibrary && (
        <div className="space-y-6">
          {/* Library badge */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Importing into:</span>
            <span className="font-semibold text-gray-900 dark:text-white">{selectedLibrary.name}</span>
            <button
              onClick={() => setStep(1)}
              className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
            >
              Change
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer p-10 text-center ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : csvFile
                  ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/10'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
              onClick={e => e.stopPropagation()}
            />
            {csvFile ? (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium text-gray-900 dark:text-white">{csvFile.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {headers.length} column{headers.length !== 1 ? 's' : ''}, {csvSamples.length} preview row{csvSamples.length !== 1 ? 's' : ''} — click to change
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="font-medium text-gray-700 dark:text-gray-300">Drop a CSV here, or click to browse</p>
                <p className="text-xs text-gray-400">CSV, TSV, or TXT</p>
              </div>
            )}
          </div>

          {/* Column mapping — one row per CSV column */}
          {headers.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Column Mapping</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Each row is a column from your CSV. Auto-detected mappings are pre-filled — adjust any that look wrong.
              </p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-1/4">CSV Column</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-2/5">Examples</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-1/4">Maps To</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">Prefer CSV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {headers.map((h, colIdx) => {
                      const examples = csvSamples
                        .map(row => row[colIdx] ?? '')
                        .filter(v => v !== '')
                        .slice(0, 3)
                      const mappedField = csvMapping[colIdx] ?? ''
                      const isDuplicate = mappedField !== '' && (fieldUsage[mappedField]?.length ?? 0) > 1

                      return (
                        <tr key={colIdx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs font-medium text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                              {h || `col_${colIdx + 1}`}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="space-y-0.5">
                              {examples.length > 0 ? examples.map((ex, i) => (
                                <p key={i} className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]" title={ex}>{ex}</p>
                              )) : (
                                <span className="text-xs text-gray-300 dark:text-gray-600 italic">empty</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={mappedField}
                              onChange={e => {
                                const newField = e.target.value
                                setCsvMapping(prev => ({ ...prev, [colIdx]: newField }))
                                if (newField) {
                                  setPreferCsv(prev => ({ ...prev, [newField]: prev[newField] ?? true }))
                                }
                              }}
                              className={`w-full rounded-lg border px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                isDuplicate
                                  ? 'border-amber-400 dark:border-amber-500'
                                  : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                              }`}
                            >
                              <option value="">— skip —</option>
                              {IMPORT_FIELDS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </select>
                            {isDuplicate && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">mapped twice</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {mappedField ? (
                              <label className="flex items-center gap-1.5 cursor-pointer" title="Prefer this CSV value over provider lookup data">
                                <input
                                  type="checkbox"
                                  checked={preferCsv[mappedField] ?? true}
                                  onChange={e => setPreferCsv(prev => ({ ...prev, [mappedField]: e.target.checked }))}
                                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600"
                                />
                              </label>
                            ) : (
                              <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                "Prefer CSV" is checked by default — your CSV values take priority. Uncheck a field to let metadata lookup override it.
              </p>
            </div>
          )}

          {/* Options */}
          {headers.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Skip duplicates</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Books already in the library will be skipped</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} className="sr-only peer" />
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
                  {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
          )}

          {submitError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {submitError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleStartImport}
              disabled={!csvFile || !anyMapped || isSubmitting}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Starting…' : 'Start Import'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Progress ── */}
      {step === 3 && importJob && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {importJob.status === 'pending' ? 'Queued…' : `Processing… ${importJob.processed_rows}/${importJob.total_rows} rows`}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {importJob.total_rows > 0 ? `${Math.round((importJob.processed_rows / importJob.total_rows) * 100)}%` : '—'}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: importJob.total_rows > 0 ? `${(importJob.processed_rows / importJob.total_rows) * 100}%` : '0%' }}
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

      {/* ── Step 4: Results ── */}
      {step === 4 && importJob && (
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
                <p className={`font-semibold text-base ${importJob.status === 'failed' ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                  {importJob.status === 'failed' ? 'Import failed' : 'Import complete'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {importJob.total_rows} row{importJob.total_rows !== 1 ? 's' : ''} total
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
            <button
              onClick={() => navigate('/admin/settings/jobs')}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              View all jobs
            </button>
            {selectedLibrary && (
              <Link
                to={`/libraries/${selectedLibrary.id}/books`}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Go to Books
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  )
}
