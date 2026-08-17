// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { fold, matches, rank, score, type CommandItem } from './commandPalette'

const item = (label: string, over: Partial<CommandItem> = {}): CommandItem => ({
  kind: 'page', id: label, label, icon: 'books', to: '/', ...over,
})

describe('matching', () => {
  it('ignores case', () => {
    expect(matches('Reading now', 'READING')).toBe(true)
  })

  it('ignores accents', () => {
    expect(matches('Asímov', 'asimov')).toBe(true)
    expect(matches('Émile', 'emile')).toBe(true)
  })

  it('ignores separators, because nobody types the spaces', () => {
    expect(matches('API tokens', 'apitokens')).toBe(true)
    expect(matches('20th Century Boys', '20thcentury')).toBe(true)
    expect(matches('Re-read someday', 'reread')).toBe(true)
  })

  it('still refuses a genuine non-match', () => {
    expect(matches('Reading now', 'loans')).toBe(false)
  })

  it('folds to nothing for punctuation-only input', () => {
    // Everything contains the empty string, so this matches all items rather
    // than none. That is the right answer: it is the same as an empty query.
    expect(fold('---')).toBe('')
  })
})

describe('ranking', () => {
  it('puts an exact match before a prefix before a match anywhere', () => {
    expect(score('Dune', 'dune')).toBeLessThan(score('Dune Messiah', 'dune'))
    expect(score('Dune Messiah', 'dune')).toBeLessThan(score('Children of Dune', 'dune'))
  })

  it('orders results so the closest is first', () => {
    const out = rank(
      [item('Children of Dune'), item('Dune Messiah'), item('Dune')],
      'dune',
    )
    expect(out.map(i => i.label)).toEqual(['Dune', 'Dune Messiah', 'Children of Dune'])
  })

  it('breaks ties on the shorter label', () => {
    const out = rank([item('Dune Messiah'), item('Dune 2')], 'dune')
    expect(out[0].label).toBe('Dune 2')
  })

  it('leaves the order alone when there is no query', () => {
    const given = [item('b'), item('a')]
    expect(rank(given, '').map(i => i.label)).toEqual(['b', 'a'])
  })
})
