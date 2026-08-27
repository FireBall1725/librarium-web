// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// What you can do to a set of books at once.
//
// Appears only when something is selected, so the ordinary reading case is not
// carrying an editing toolbar it never uses.
//
// Genres and media types are instance-wide, so they work across a selection
// spanning libraries. Tags are not: a tag belongs to one library, so the tag
// controls are offered only when the selection sits in a single library, and
// say why when it does not. Picking a library silently would put a tag on
// books in a library that has never heard of it.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { fetchLists } from '../lib/lists'
import type { Book, Genre, MediaType, Tag } from '../types'
import {
  addToList,
  ambiguousBooks,
  applyToEach,
  bookPatchBody,
  byLibrary,
  commonLibraries,
  deleteEach,
  fanOutByLibrary,
  removeFromList,
  type BulkResult,
} from '../lib/bookBulk'
import { ConfirmDialog } from './Dialog'
import LibraryPickerDialog from './LibraryPickerDialog'

/**
 * A select that fires once and resets, so the same value can be picked twice.
 *
 * Module scope, not nested in the bar: a component declared during render is a
 * new type on every render, so React unmounts and remounts it, and the select
 * loses focus mid-interaction.
 */
function ActionSelect({ label, options, disabled, onPick }: {
  label: string
  options: Array<{ id: string; name: string }>
  disabled: boolean
  onPick: (id: string) => void
}) {
  return (
    <select
      className="lb-field"
      // Inline, not a utility class: .lb-field sets width:100% and a Tailwind
      // w-auto is the same specificity, so which one wins comes down to sheet
      // order. In the bar these have to sit side by side.
      style={{ width: 'auto' }}
      value=""
      disabled={disabled || options.length === 0}
      onChange={e => { if (e.target.value) { onPick(e.target.value); e.target.value = '' } }}
      aria-label={label}
    >
      <option value="">{label}</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}

export default function BookBulkBar({
  selected,
  onDone,
  onClear,
}: {
  selected: Book[]
  /** Ran something; the caller refetches and reports what happened. */
  onDone: (result: BulkResult, label: string) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const { callApi } = useAuth()

  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  // Kept with the library they belong to rather than cleared when the selection
  // changes. Reading them back through the current library means a tag list
  // fetched for another one is never shown, without an effect that clears state
  // on the way past.
  const [tagsFor, setTagsFor] = useState<{ library: string; list: Tag[] } | null>(null)

  // Which library's tag vocabulary is safe to offer.
  //
  // The intersection, not the first book's library. A book held by two
  // libraries resolves to whichever sorts first, and offering that library's
  // tags would hand back a tag id that the other library has never heard of
  // the moment the reader picks the other one below. Exactly one common
  // library means there is nothing to get wrong.
  const shared = commonLibraries(selected)
  const library = shared.length === 1 ? shared[0].id : null
  const floating = selected.length - [...byLibrary(selected).values()].flat().length

  // The vocabularies are only needed once something is selected, which is the
  // only time this component exists.
  useEffect(() => {
    let cancelled = false
    callApi<MediaType[]>('/api/v1/media-types')
      .then(r => { if (!cancelled) setMediaTypes(r ?? []) }).catch(() => {})
    callApi<Genre[]>('/api/v1/genres')
      .then(r => { if (!cancelled) setGenres(r ?? []) }).catch(() => {})
    return () => { cancelled = true }
  }, [callApi])

  useEffect(() => {
    if (!library) return
    let cancelled = false
    callApi<Tag[]>(`/api/v1/libraries/${library}/tags`)
      .then(r => { if (!cancelled) setTagsFor({ library, list: r ?? [] }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [callApi, library])

  const tags = tagsFor?.library === library ? tagsFor.list : []

  // Every list this person can see, not the ones a single library shares. The
  // shelf route only ever returned lists shared with a library, so a private
  // one could not be filled from here at all. Membership is (list, book) with
  // no library in it, so a list is not confined to one the way a tag is.
  const [lists, setLists] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    let cancelled = false
    void fetchLists(callApi)
      .then(all => {
        if (cancelled) return
        setLists(all.filter(l => l.kind === 'manual').map(l => ({ id: l.id, name: l.name })))
      })
      .catch(() => { /* The rest of the bar works without them. */ })
    return () => { cancelled = true }
  }, [callApi])

  // Books in the selection that several libraries hold, and the libraries that
  // would resolve all of them at once.
  const ambiguous = ambiguousBooks(selected)
  const choices = commonLibraries(ambiguous)

  // The action waiting on an answer to "which library?".
  //
  // A dialog per book is not an option at forty books, so the question is asked
  // once for the batch and the answer applies to every ambiguous book in it.
  // Unambiguous books are unaffected either way.
  const [pending, setPending] = useState<
    { label: string; work: (library?: string | null) => Promise<BulkResult> } | null
  >(null)

  const start = async (
    label: string,
    work: (library?: string | null) => Promise<BulkResult>,
  ) => {
    if (ambiguous.length > 0) { setPending({ label, work }); return }
    await execute(label, work, null)
  }

  const execute = async (
    label: string,
    work: (library?: string | null) => Promise<BulkResult>,
    library: string | null,
  ) => {
    setBusy(true)
    try {
      onDone(await work(library), label)
    } finally {
      setBusy(false)
    }
  }

  const run = start

  const setMediaType = (id: string) =>
    run(t('bulk.type_changed', { defaultValue: 'Type changed' }), lib =>
      applyToEach(callApi, selected, b => bookPatchBody(b, { media_type_id: id }), lib))

  const addGenre = (id: string) =>
    run(t('bulk.genre_added', { defaultValue: 'Genre added' }), lib =>
      applyToEach(callApi, selected, b => bookPatchBody(b, {
        genre_ids: (b.genres ?? []).some(g => g.id === id)
          ? (b.genres ?? []).map(g => g.id)
          : [...(b.genres ?? []).map(g => g.id), id],
      }), lib))

  const removeGenre = (id: string) =>
    run(t('bulk.genre_removed', { defaultValue: 'Genre removed' }), lib =>
      applyToEach(callApi, selected, b => bookPatchBody(b, {
        genre_ids: (b.genres ?? []).filter(g => g.id !== id).map(g => g.id),
      }), lib))

  const addTag = (id: string) =>
    run(t('bulk.tag_added', { defaultValue: 'Tag added' }), lib =>
      applyToEach(callApi, selected, b => bookPatchBody(b, {
        tag_ids: b.tags.some(x => x.id === id)
          ? b.tags.map(x => x.id)
          : [...b.tags.map(x => x.id), id],
      }), lib))

  const removeTag = (id: string) =>
    run(t('bulk.tag_removed', { defaultValue: 'Tag removed' }), lib =>
      applyToEach(callApi, selected, b => bookPatchBody(b, {
        tag_ids: b.tags.filter(x => x.id !== id).map(x => x.id),
      }), lib))

  const putOnList = (id: string) =>
    run(t('bulk.added_to_list', { defaultValue: 'Added to list' }), () =>
      addToList(callApi, selected, id))

  const takeOffList = (id: string) =>
    run(t('bulk.removed_from_list', { defaultValue: 'Removed from list' }), () =>
      removeFromList(callApi, selected, id))

  const refreshCovers = () =>
    run(t('bulk.covers_queued', { defaultValue: 'Cover refresh queued' }), chosen =>
      fanOutByLibrary(callApi, selected,
        lib => `/api/v1/libraries/${lib}/books/bulk/cover`,
        ids => ({ book_ids: ids }), chosen))

  const enrich = () =>
    run(t('bulk.enrich_queued', { defaultValue: 'Metadata refresh queued' }), chosen =>
      fanOutByLibrary(callApi, selected,
        lib => `/api/v1/libraries/${lib}/books/bulk/enrich`,
        ids => ({ book_ids: ids, force: false, use_ai_cleanup: false }), chosen))

  const remove = () =>
    run(t('bulk.deleted', { defaultValue: 'Deleted' }), lib => deleteEach(callApi, selected, lib))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-accent-line bg-accent-surface px-3 py-2">
        <span className="text-sm font-medium text-accent">
          {t('bulk.selected', { count: selected.length, defaultValue: `${selected.length} selected` })}
        </span>

        {/* Said once, plainly: these books cannot be edited through a library
            because they are not in one. */}
        {floating > 0 && (
          <span className="lb-chip warn">
            {t('bulk.floating', { count: floating, defaultValue: `${floating} not in a library` })}
          </span>
        )}

        {/* Said before the action, not after it, so the question the dialog
            asks is expected. */}
        {ambiguous.length > 0 && (
          <span className="lb-chip">
            {t('bulk.multi_library', {
              count: ambiguous.length,
              defaultValue: `${ambiguous.length} in more than one library`,
            })}
          </span>
        )}

        <span className="mx-1 h-4 w-px bg-accent-line" />

        <ActionSelect label={t('bulk.set_type', { defaultValue: 'Set type' })}
          options={mediaTypes.map(m => ({ id: m.id, name: m.display_name }))} disabled={busy} onPick={setMediaType} />
        <ActionSelect label={t('bulk.add_genre', { defaultValue: 'Add genre' })}
          options={genres} disabled={busy} onPick={addGenre} />
        <ActionSelect label={t('bulk.remove_genre', { defaultValue: 'Remove genre' })}
          options={genres} disabled={busy} onPick={removeGenre} />

        {/* Outside the single-library gate that tags sit behind. A tag belongs
            to one library; a list's membership is (list, book) with no library
            in it, so a selection spanning several can still be filed.

            Name only, no icon prefix: a native select matches typed characters
            against the start of an option, so leading with an icon means typing
            "Fic" finds nothing. */}
        <ActionSelect label={t('bulk.add_list', { defaultValue: 'Add to list' })}
          options={lists} disabled={busy} onPick={putOnList} />
        <ActionSelect label={t('bulk.remove_list', { defaultValue: 'Remove from list' })}
          options={lists} disabled={busy} onPick={takeOffList} />

        {library ? (
          <>
            <ActionSelect label={t('bulk.add_tag', { defaultValue: 'Add tag' })}
              options={tags} disabled={busy} onPick={addTag} />
            <ActionSelect label={t('bulk.remove_tag', { defaultValue: 'Remove tag' })}
              options={tags} disabled={busy} onPick={removeTag} />
          </>
        ) : (
          <span className="text-xs text-content-tertiary">
            {ambiguous.length > 0
              ? t('bulk.tags_need_unambiguous', {
                  defaultValue: 'Tags belong to a library, and some of these are in more than one. Filter by a library to edit tags.',
                })
              : t('bulk.tags_need_one_library', {
                  defaultValue: 'Tags belong to a library. Select books from one library to edit them.',
                })}
          </span>
        )}

        <span className="flex-1" />

        <button type="button" className="lb-btn ghost sm" disabled={busy} onClick={refreshCovers}>
          {t('bulk.covers', { defaultValue: 'Refresh covers' })}
        </button>
        <button type="button" className="lb-btn ghost sm" disabled={busy} onClick={enrich}>
          {t('bulk.enrich', { defaultValue: 'Refresh metadata' })}
        </button>
        <button type="button" className="lb-btn ghost sm" disabled={busy}
          onClick={() => setConfirmDelete(true)}
          style={{ color: 'var(--color-danger)' }}>
          {t('common.delete', { defaultValue: 'Delete' })}
        </button>
        <button type="button" className="lb-btn ghost sm" disabled={busy} onClick={onClear}>
          {t('bulk.clear', { defaultValue: 'Clear' })}
        </button>
      </div>

      <LibraryPickerDialog
        open={pending !== null}
        libraries={choices}
        title={t('bulk.which_library_title', {
          count: ambiguous.length,
          defaultValue: `${ambiguous.length} of these are in more than one library`,
        })}
        description={
          choices.length > 0
            ? t('bulk.which_library', {
                defaultValue: 'Which library should this act in? Books in only one library are unaffected.',
              })
            // No library holds all of them, so no single answer is right. Say
            // so rather than offering a choice that would half-work.
            : t('bulk.no_common_library', {
                defaultValue: 'These books share no common library. Narrow the selection and try again.',
              })
        }
        onCancel={() => setPending(null)}
        onPick={libraryId => {
          const job = pending
          setPending(null)
          if (job) void execute(job.label, job.work, libraryId)
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('bulk.delete_title', {
          count: selected.length,
          defaultValue: `Delete ${selected.length} books?`,
        })}
        description={t('bulk.delete_note', {
          defaultValue: 'They are removed from their libraries. This cannot be undone.',
        })}
        confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); remove() }}
      />
    </>
  )
}
