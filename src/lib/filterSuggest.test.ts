// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { parsePrefix, suggestFacets, suggestRating, suggestRatings, textSuggestion } from './filterSuggest'
import type { BookFacets, FacetKey } from './bookBrowse'
import type { SavedList } from './lists'

const facets = {
  library: [{ value: 'lib-1', label: 'Book Collection', count: 1425 }],
  shelf: [{ value: 'list-1', label: 'Fiction', count: 124 }],
  tag: [{ value: 'manga', label: 'manga', count: 736 }],
  genre: [{ value: 'Manga', label: 'Manga', count: 736 }],
  media_type: [{ value: 'Manga', label: 'Manga', count: 751 }],
  read_status: [
    { value: 'read', label: 'read', count: 12 },
    { value: 'reading', label: 'reading', count: 3 },
  ],
  ownership: [], rating: [], favourite: [],
} as unknown as BookFacets

const lists = [{ id: 'list-1', name: 'Fiction' }] as unknown as SavedList[]

const none = {
  ownership: [], library: [], shelf: [], location: [], read_status: [],
  media_type: [], genre: [], tag: [], rating: [], favourite: [],
} as Record<FacetKey, string[]>

describe('resolving what was typed', () => {
  it('offers a library, which is what makes library:books tick a box', () => {
    const s = suggestFacets('book coll', facets, lists, none)
    expect(s[0]).toMatchObject({ kind: 'facet', facet: 'library', value: 'lib-1' })
  })

  it('offers every dimension a word matches, labelled by kind', () => {
    const groups = suggestFacets('manga', facets, lists, none).map(s => s.group)
    // The same word is a tag, a genre and a media type here, and a reader has
    // to be able to tell which one they are picking.
    expect(new Set(groups)).toEqual(new Set(['Tag', 'Genre', 'Type']))
  })

  it('matches a list by its name rather than its id', () => {
    // A list is a facet keyed by UUID, so matching the value would compare a
    // UUID against what someone typed and never hit.
    const s = suggestFacets('fict', facets, lists, none)
    expect(s[0]).toMatchObject({ facet: 'shelf', value: 'list-1', label: 'Fiction' })
  })

  it('puts an exact match before a longer one', () => {
    const s = suggestFacets('read', facets, lists, none)
    expect(s.map(x => x.label)).toEqual(['read', 'reading'])
  })

  it('does not offer a filter that is already on', () => {
    const on = { ...none, tag: ['manga'] }
    const s = suggestFacets('manga', facets, lists, on)
    expect(s.some(x => x.kind === 'facet' && x.facet === 'tag')).toBe(false)
    // The genre and type of the same name are still fair game.
    expect(s.length).toBeGreaterThan(0)
  })

  it('narrows to one dimension when a prefix names it', () => {
    const s = suggestFacets('tag:manga', facets, lists, none)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ facet: 'tag' })
  })

  it('accepts the url spelling of a dimension too', () => {
    // The rail says "Status" and the query string says "status"; both should
    // work, because people copy what they see.
    expect(suggestFacets('status:read', facets, lists, none)[0])
      .toMatchObject({ facet: 'read_status', value: 'read' })
  })

  it('offers nothing for an empty box rather than everything', () => {
    expect(suggestFacets('', facets, lists, none)).toEqual([])
    expect(suggestFacets('   ', facets, lists, none)).toEqual([])
  })

  it('offers nothing before the facets have loaded', () => {
    expect(suggestFacets('manga', null, lists, none)).toEqual([])
  })
})

describe('prefixes', () => {
  it('splits on the first colon', () => {
    expect(parsePrefix('tag:signed first')).toEqual({ group: 'tag', rest: 'signed first' })
  })

  it('is not a prefix when the colon leads', () => {
    expect(parsePrefix(':signed')).toBeNull()
  })

  it('is not a prefix when there is no colon', () => {
    expect(parsePrefix('signed')).toBeNull()
  })
})

describe('the plain search fallback', () => {
  it('keeps Enter meaningful when nothing matched', () => {
    expect(textSuggestion('  something odd ')).toMatchObject({
      kind: 'text', value: 'something odd',
    })
  })
})

describe('ratings, said the way people say them', () => {
  // The column holds 1 to 10, which is five stars of two, so a half star is a
  // whole number and nothing has to round.
  const values = (input: string) => {
    const s = suggestRating(input)
    return s && s.kind === 'rating' ? s.values : null
  }

  it('reads an exact number of stars', () => {
    expect(values('4 stars')).toEqual([8])
    expect(values('5')).toEqual([10])
  })

  it('reads a half star, which is why the scale is ten', () => {
    expect(values('3.5 stars')).toEqual([7])
  })

  it('reads a comparison, because nobody wants only the fours', () => {
    expect(values('> 3.5')).toEqual([8, 9, 10])
    expect(values('>= 4')).toEqual([8, 9, 10])
    expect(values('at least 4')).toEqual([8, 9, 10])
    expect(values('4+')).toEqual([8, 9, 10])
  })

  it('reads the other direction too', () => {
    expect(values('< 2')).toEqual([1, 2, 3])
    expect(values('under 2 stars')).toEqual([1, 2, 3])
  })

  it('accepts the shorthands people actually type', () => {
    expect(values('5*')).toEqual([10])
    expect(values('rating 4')).toEqual([8])
  })

  it('is not a rating when it is a title', () => {
    expect(suggestRating('bleach')).toBeNull()
    expect(suggestRating('11')).toBeNull()
    expect(suggestRating('')).toBeNull()
  })

  it('says what it means, in stars rather than in stored points', () => {
    expect(suggestRating('> 3.5')?.label).toBe('more than 3.5 stars')
    expect(suggestRating('4')?.label).toBe('4 stars')
  })
})

describe('typing the word rather than a number', () => {
  // Nobody types ">". They type "rating", which used to dead-end in a text
  // search for the word.
  it('offers presets, so the shortcuts are shown rather than guessed at', () => {
    const s = suggestRatings('rating')
    expect(s.length).toBeGreaterThan(1)
    expect(s.every(x => x.kind === 'rating')).toBe(true)
  })

  it('answers to the words people actually use', () => {
    for (const word of ['rating', 'ratings', 'star', 'stars']) {
      expect(suggestRatings(word).length).toBeGreaterThan(1)
    }
  })

  it('leads with the best books, which is the common ask', () => {
    const first = suggestRatings('rating')[0]
    expect(first.kind === 'rating' && first.values).toEqual([10])
  })

  it('still gives one answer for a number', () => {
    expect(suggestRatings('4 stars')).toHaveLength(1)
  })

  it('offers nothing for a word that is not about ratings', () => {
    expect(suggestRatings('bleach')).toEqual([])
  })
})
