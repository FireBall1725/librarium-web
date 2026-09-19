// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { describe, expect, it } from 'vitest'
import { ADDON_WAIT_MS, classifyBarcode, isbn10to13, pickCameraScan, upcLookupCode } from './barcode'

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

  it('splits a 5-digit add-on off a UPC-A', () => {
    expect(classifyBarcode('03600029145200399')).toEqual({ kind: 'upc', code: '036000291452', addon: '00399' })
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

describe('UPC add-ons', () => {
  it('reads the camera form: a UPC as a 13-digit EAN, add-on stuck on', () => {
    // What zxing returns for Hominids' back cover with add-ons turned on.
    expect(classifyBarcode('003714500799134500')).toEqual({ kind: 'upc', code: '037145007991', addon: '34500' })
    expect(classifyBarcode('0037145007991')).toEqual({ kind: 'upc', code: '037145007991' })
  })

  it('keeps a 5-digit add-on for the lookup', () => {
    const b = classifyBarcode('03714500699451099')
    expect(b).toEqual({ kind: 'upc', code: '037145006994', addon: '51099' })
    if (b.kind === 'upc') expect(upcLookupCode(b)).toBe('03714500699451099')
  })

  it('sends a bare UPC as it is', () => {
    const b = classifyBarcode('037145006994')
    expect(b).toEqual({ kind: 'upc', code: '037145006994' })
    if (b.kind === 'upc') expect(upcLookupCode(b)).toBe('037145006994')
  })
})

describe('pickCameraScan', () => {
  it('takes an ISBN straight away', () => {
    expect(pickCameraScan(['0037145007991', '9780765345004'], null, 0)).toBe('9780765345004')
  })

  it('takes a UPC with its add-on straight away', () => {
    expect(pickCameraScan(['0037145007991', '003714500799134500'], null, 0)).toBe('003714500799134500')
  })

  it('holds a bare UPC while the add-on might still read', () => {
    expect(pickCameraScan(['0037145007991'], null, 0)).toBeNull()
    expect(pickCameraScan(['0037145007991'], 0, ADDON_WAIT_MS - 1)).toBeNull()
    expect(pickCameraScan(['0037145007991'], 0, ADDON_WAIT_MS)).toBe('0037145007991')
  })

  it('passes anything else through, as before', () => {
    expect(pickCameraScan(['LIB-0042'], null, 0)).toBe('LIB-0042')
    expect(pickCameraScan([], null, 0)).toBeNull()
  })
})
