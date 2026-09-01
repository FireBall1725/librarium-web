// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// ─── Auto-detect ──────────────────────────────────────────────────────────────
//
// Fuzzy fallback used when a header isn't claimed by the active source
// preset. Strips delimiters/case and matches against a small set of
// common variants so that vanilla CSVs people produce by hand still
// land in the right field without needing a preset.
export function autoDetect(header: string): string {
  const h = header.toLowerCase().replace(/[\s\-_.]/g, '')

  // Book metadata
  if (['isbn13', 'isbn', 'ean', 'barcode', 'ean13', 'eanisbn13', 'eanisbn'].includes(h)) return 'isbn_13'
  if (['isbn10', 'upc', 'upcisbn10', 'upcisbn', 'upc10'].includes(h)) return 'isbn_10'
  if (['title', 'booktitle', 'name', 'worktitle'].includes(h)) return 'title'
  if (['subtitle', 'sub', 'booktitlesubtitle'].includes(h)) return 'subtitle'
  if (['author', 'authors', 'writer', 'authorlf', 'authorname', 'creators', 'creator', 'artist'].includes(h)) return 'author'
  if (['publisher', 'pub', 'publishedby'].includes(h)) return 'publisher'
  if (['yearpublished', 'originalpublicationyear', 'publisheddate', 'publishdate', 'publicationdate'].includes(h)) return 'publish_date'
  if (['acquiredat', 'acquireddate', 'dateacquired', 'purchasedate', 'datepurchased', 'added', 'dateadded'].includes(h)) return 'acquired_date'
  if (['description', 'summary', 'synopsis'].includes(h)) return 'description'
  if (['pagecount', 'pages', 'numberofpages', 'length', 'numpages', 'pagenum'].includes(h)) return 'page_count'
  if (['language', 'lang', 'booklanguage'].includes(h)) return 'language'
  if (['tags', 'tag', 'genre', 'genres', 'category', 'categories', 'subjects', 'subject', 'bookshelves'].includes(h)) return 'tags'
  if (['mediatype', 'type', 'format', 'booktype', 'bookformat', 'bindingtype'].includes(h)) return 'media_type'
  if (['shelf', 'shelves'].includes(h)) return 'shelf'

  // User interaction
  if (['rating', 'myrating', 'starrating', 'usrrating'].includes(h)) return 'rating'
  if (['review', 'myreview'].includes(h)) return 'review'
  if (['notes', 'note', 'privatenotes'].includes(h)) return 'notes'
  if (['readstatus', 'status', 'exclusiveshelf'].includes(h)) return 'read_status'
  if (['began', 'datestarted', 'startedreading', 'startdate'].includes(h)) return 'date_started'
  if (['completed', 'datefinished', 'datefinishedreading', 'finishdate', 'dateread', 'lastdateread', 'finishedreading'].includes(h)) return 'date_finished'
  if (['favorite', 'favourite', 'isfavorite', 'isfavourite'].includes(h)) return 'is_favorite'

  return ''
}
