// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { classifyBarcode, isbn10to13 } from './barcode'

describe('classifyBarcode', () => {
  it('reads an ISBN-13', () => {
    expect(classifyBarcode('9780441172719')).toEqual({ kind: 'isbn', isbn13: '9780441172719' })
  })

  it('accepts a 979 ISBN-13', () => {
    expect(classifyBarcode('9791032305690')).toEqual({ kind: 'isbn', isbn13: '9791032305690' })
  })

  it('strips hyphens and spaces a person typed', () => {
    expect(classifyBarcode(' 978-0-441-17271-9 ')).toEqual({ kind: 'isbn', isbn13: '9780441172719' })
  })

  it('converts an ISBN-10 to ISBN-13', () => {
    expect(classifyBarcode('0441172717')).toEqual({ kind: 'isbn', isbn13: '9780441172719' })
  })

  it('accepts an ISBN-10 ending in X', () => {
    expect(classifyBarcode('080442957X')).toEqual({ kind: 'isbn', isbn13: '9780804429573' })
    expect(classifyBarcode('080442957x')).toEqual({ kind: 'isbn', isbn13: '9780804429573' })
  })

  it('drops a 5-digit price add-on after an ISBN', () => {
    expect(classifyBarcode('978044117271951099')).toEqual({ kind: 'isbn', isbn13: '9780441172719' })
  })

  it('reads a UPC-A', () => {
    expect(classifyBarcode('036000291452')).toEqual({ kind: 'upc', code: '036000291452' })
  })

  it('drops a 5-digit add-on after a UPC-A', () => {
    expect(classifyBarcode('03600029145200399')).toEqual({ kind: 'upc', code: '036000291452' })
  })

  it('treats a non-ISBN EAN-13 as an EAN', () => {
    expect(classifyBarcode('4006381333931')).toEqual({ kind: 'ean', code: '4006381333931' })
  })

  it('rejects a bad check digit', () => {
    expect(classifyBarcode('9780441172718').kind).toBe('invalid')
    expect(classifyBarcode('0441172718').kind).toBe('invalid')
    expect(classifyBarcode('036000291453').kind).toBe('invalid')
  })

  it('rejects junk', () => {
    expect(classifyBarcode('hello').kind).toBe('invalid')
    expect(classifyBarcode('').kind).toBe('invalid')
  })
})

describe('isbn10to13', () => {
  it('computes the new check digit', () => {
    expect(isbn10to13('0441172717')).toBe('9780441172719')
  })
})
