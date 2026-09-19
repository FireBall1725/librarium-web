// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The shelves tree and the bookcase guess, kept apart from the page so both
// can be tested without rendering it.
//
// Places nest to any depth: "Library", "Library > Bookcase A" and
// "Library > Bookcase A > Shelf 1" are all places. A bookcase is any place
// with a shelf count set, and its shelves are the places directly inside it.

import type { CopyLocation } from '../types'

/** The same bound the server puts on every walk of the tree. */
export const MAX_DEPTH = 16

export interface PlaceNode {
  place: CopyLocation
  depth: number
  children: PlaceNode[]
  /** Copies filed here and anywhere inside. */
  total: number
}

// Numeric, so Shelf 2 sorts before Shelf 10. The server sorts by lower(name),
// which puts 10 first.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Builds the tree from the flat list. A place whose parent is missing, or that
 * sits inside a loop, is shown at the top rather than dropped: a place nobody
 * can see is a place nobody can fix.
 */
export function buildTree(places: CopyLocation[]): PlaceNode[] {
  const byParent = new Map<string | null, CopyLocation[]>()
  const ids = new Set(places.map(p => p.id))
  for (const p of places) {
    const key = p.parent_id && ids.has(p.parent_id) ? p.parent_id : null
    byParent.set(key, [...(byParent.get(key) ?? []), p])
  }
  const seen = new Set<string>()
  const grow = (p: CopyLocation, depth: number): PlaceNode => {
    seen.add(p.id)
    const children = depth >= MAX_DEPTH ? [] : (byParent.get(p.id) ?? [])
      .filter(c => !seen.has(c.id))
      .sort((a, b) => collator.compare(a.name, b.name))
      .map(c => grow(c, depth + 1))
    return { place: p, depth, children, total: p.copy_count + children.reduce((n, c) => n + c.total, 0) }
  }
  const roots = (byParent.get(null) ?? []).sort((a, b) => collator.compare(a.name, b.name)).map(p => grow(p, 0))
  // Anything still unseen is inside a loop with no way down from the top.
  for (const p of places) if (!seen.has(p.id)) roots.push(grow(p, 0))
  return roots
}

/** The tree flattened in display order. */
export function flatten(nodes: PlaceNode[], out: PlaceNode[] = []): PlaceNode[] {
  for (const n of nodes) {
    out.push(n)
    flatten(n.children, out)
  }
  return out
}

/** Names from the top down to this place, for "Library › Bookcase A". */
export function pathOf(id: string, places: CopyLocation[]): string[] {
  const byId = new Map(places.map(p => [p.id, p]))
  const names: string[] = []
  let at = byId.get(id)
  while (at && names.length < MAX_DEPTH) {
    names.unshift(at.name)
    at = at.parent_id ? byId.get(at.parent_id) : undefined
  }
  return names
}

/** The place and everything inside it: none of them can become its parent. */
export function selfAndInside(id: string, places: CopyLocation[]): Set<string> {
  const out = new Set([id])
  for (let grew = true, round = 0; grew && round < MAX_DEPTH; round++) {
    grew = false
    for (const p of places) {
      if (p.parent_id && out.has(p.parent_id) && !out.has(p.id)) {
        out.add(p.id)
        grew = true
      }
    }
  }
  return out
}

export interface CaseInfo {
  /** Shelves the kiosk draws: the declared count, or more if a shelf name says so. */
  count: number
  /** Shelf number to the place row with that number. */
  have: Map<number, CopyLocation>
  declared: boolean
  topDown: boolean
  /** The naming the shelves already use, number removed: "A", "Shelf ". */
  prefix: string
  /** The highest number any shelf name carries. */
  highest: number
}

const TRAILING_NUMBER = /(\d+)\s*$/

/**
 * Works a bookcase out from the names of the places inside it, the same way
 * the kiosk does. Every one has to end in a number (A1, B3, Shelf 7); if any
 * doesn't, there is no numbering to draw and this returns null.
 */
export function caseInfo(bookcase: CopyLocation, shelves: CopyLocation[], fallbackPrefix = 'Shelf '): CaseInfo | null {
  const have = new Map<number, CopyLocation>()
  let highest = 0
  for (const s of shelves) {
    const m = TRAILING_NUMBER.exec(s.name)
    if (!m) return null
    const n = Number(m[1])
    have.set(n, s)
    highest = Math.max(highest, n)
  }
  const count = Math.max(bookcase.shelf_count ?? 0, highest)
  if (!count) return null
  const first = [...shelves].sort((a, b) => collator.compare(a.name, b.name))[0]
  return {
    count,
    have,
    declared: bookcase.shelf_count != null,
    topDown: bookcase.shelf_numbering !== 'bottom_up',
    prefix: first ? first.name.replace(TRAILING_NUMBER, '') : fallbackPrefix,
    highest,
  }
}

/**
 * Names for shelves 1 to count that have no place yet, in the naming the
 * bookcase already uses. With no shelves at all, or names that aren't
 * numbered, the new ones are called "Shelf 1", "Shelf 2" and so on.
 */
export function missingShelves(info: CaseInfo | null, count: number, fallbackPrefix = 'Shelf '): string[] {
  const out: string[] = []
  for (let n = 1; n <= count; n++) {
    if (!info) out.push(fallbackPrefix + n)
    else if (!info.have.has(n)) out.push(info.prefix + n)
  }
  return out
}

/**
 * Whether an unmarked place is worth guessing about. A room holding Bookcase 1
 * and Bookcase 2 is numbered too, so anything inside that is itself a bookcase,
 * or holds more than one thing, rules the guess out. A single box on a shelf
 * doesn't.
 */
export function looksLikeBookcase(node: PlaceNode): boolean {
  return node.children.length > 1 &&
    node.children.every(c => c.place.shelf_count == null && c.children.length < 2)
}

function shelvesOf(id: string, places: CopyLocation[]): CopyLocation[] {
  return places.filter(p => p.parent_id === id)
}

/**
 * Where a place sits in a marked bookcase: the bookcase itself (shelf null),
 * or one of its numbered shelves. Null for anything else.
 */
export function shelfSpot(id: string, places: CopyLocation[]): { bookcase: CopyLocation; shelf: number | null } | null {
  const byId = new Map(places.map(p => [p.id, p]))
  const place = byId.get(id)
  if (!place) return null
  if (place.shelf_count != null) return { bookcase: place, shelf: null }
  const parent = place.parent_id ? byId.get(place.parent_id) : undefined
  if (!parent || parent.shelf_count == null) return null
  const info = caseInfo(parent, shelvesOf(parent.id, places))
  if (!info) return null
  for (const [n, s] of info.have) if (s.id === id) return { bookcase: parent, shelf: n }
  return null
}

/**
 * The numbered shelves of every marked bookcase. A shelf picker covers them,
 * so a list of places can leave them out.
 */
export function numberedShelfIds(places: CopyLocation[]): Set<string> {
  const out = new Set<string>()
  for (const b of places) {
    if (b.shelf_count == null) continue
    const info = caseInfo(b, shelvesOf(b.id, places))
    if (info) for (const s of info.have.values()) out.add(s.id)
  }
  return out
}

/** Shelf 1 to the count of a marked bookcase, with the place row where one exists. */
export function shelfChoices(bookcase: CopyLocation, places: CopyLocation[], fallbackPrefix = 'Shelf '):
  { number: number; name: string; place: CopyLocation | null }[] {
  const info = caseInfo(bookcase, shelvesOf(bookcase.id, places), fallbackPrefix)
  if (!info) return []
  return Array.from({ length: info.count }, (_, i) => {
    const n = i + 1
    const place = info.have.get(n) ?? null
    return { number: n, name: place?.name ?? info.prefix + n, place }
  })
}
