import { describe, it, expect } from 'vitest'
import { normaliseBasePath, withBase } from './basePath'

describe('normaliseBasePath', () => {
  it('treats an unset path as mounted at the root', () => {
    // The ordinary deployment, and every deployment that existed before this
    // was configurable.
    expect(normaliseBasePath(undefined)).toBe('')
    expect(normaliseBasePath('')).toBe('')
    expect(normaliseBasePath('   ')).toBe('')
  })

  it('accepts the three shapes an operator will actually type', () => {
    expect(normaliseBasePath('librarium')).toBe('/librarium')
    expect(normaliseBasePath('/librarium')).toBe('/librarium')
    expect(normaliseBasePath('/librarium/')).toBe('/librarium')
  })

  it('treats a bare slash as the root', () => {
    // Writing `/` is a reasonable way to say "no prefix", and returning it
    // verbatim would produce `//api/v1/...`, which the browser reads as a
    // protocol-relative URL pointing at a host called `api`.
    expect(normaliseBasePath('/')).toBe('')
    expect(normaliseBasePath('///')).toBe('')
  })

  it('keeps a nested mount point', () => {
    expect(normaliseBasePath('/apps/librarium/')).toBe('/apps/librarium')
  })

  it('ignores the placeholder when the entrypoint has not run', () => {
    // A bundle served by something that is not our image never gets the
    // substitution, and every URL would otherwise be prefixed with the literal
    // token.
    expect(normaliseBasePath('%%LIBRARIUM_BASE_PATH%%')).toBe('')
  })
})

describe('withBase', () => {
  const base = '/librarium'

  it('prefixes a request path', () => {
    expect(withBase('/api/v1/me/books', base)).toBe('/librarium/api/v1/me/books')
  })

  it('leaves everything alone when mounted at the root', () => {
    expect(withBase('/api/v1/me/books', '')).toBe('/api/v1/me/books')
  })

  it('does not prefix twice', () => {
    // A URL can pass through more than one of the places that build one, and a
    // second prefix produces /librarium/librarium/api, which 404s in a way
    // that looks like the base path itself is wrong.
    expect(withBase('/librarium/api/v1/me', base)).toBe('/librarium/api/v1/me')
  })

  it('leaves an absolute URL alone', () => {
    // Cover URLs from a provider are fully qualified. Prefixing one points it
    // at this host, where the image does not exist.
    expect(withBase('https://covers.example/9780.jpg', base))
      .toBe('https://covers.example/9780.jpg')
    expect(withBase('//covers.example/9780.jpg', base))
      .toBe('//covers.example/9780.jpg')
    expect(withBase('data:image/png;base64,AAAA', base))
      .toBe('data:image/png;base64,AAAA')
  })

  it('leaves a relative path alone', () => {
    // Already resolved against the document, so prefixing would move it.
    expect(withBase('assets/logo.svg', base)).toBe('assets/logo.svg')
  })

  it('does not mistake a similarly named sibling for the base', () => {
    // /librarium-api is not inside /librarium, and treating it as already
    // prefixed would leave it pointing at the wrong app.
    expect(withBase('/librarium-api/v1/me', base)).toBe('/librarium/librarium-api/v1/me')
  })
})
