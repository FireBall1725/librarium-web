// Token-based search query parser shared across list pages (books today;
// contributors / series / etc. as those pages adopt it).
//
// Supports: `field:value`, quoted phrases (`"foo bar"`), regex (`/pat/`),
// boolean operators (`NOT`, `OR`, parens for grouping), with implicit AND
// between top-level conditions. Field set is fixed here; pages decide which
// fields actually drive their query.

export type CondField =
  | 'title'
  | 'tag'
  | 'genre'
  | 'type'
  | 'contributor'
  | 'letter'
  | 'has'
  | 'series'
  | 'shelf'
  | 'publisher'
  | 'language'

export type CondOp =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'regex'
  | 'phrase'

export interface SearchCondition {
  field: CondField
  op: CondOp
  value: string
  /** Original token(s) — used to remove this condition from the query string. */
  raw: string
}

export interface ConditionGroup {
  mode: 'AND' | 'OR'
  conditions: SearchCondition[]
}

/** A list of groups ANDed together; each group has its own internal mode. */
export interface ParsedSearch {
  groups: ConditionGroup[]
}

export function allConditions(parsed: ParsedSearch): SearchCondition[] {
  return parsed.groups.flatMap(g => g.conditions)
}

export function displayLanguage(code: string): string {
  if (!code) return ''
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

export function conditionLabel(c: SearchCondition): string {
  if (c.op === 'regex') return `/${c.value}/`
  if (c.op === 'phrase') return `"${c.value}"`
  switch (c.field) {
    case 'letter': return `Starts with "${c.value.toUpperCase()}"`
    case 'type': return `Type: ${c.value}`
    case 'tag': return `Tag: ${c.value}`
    case 'genre': return `Genre: ${c.value}`
    case 'contributor': return `By: ${c.value}`
    case 'has': return `Has ${c.value}`
    case 'series': return `Series: ${c.value}`
    case 'shelf': return `Shelf: ${c.value}`
    case 'publisher': return `Publisher: ${c.value}`
    case 'language': return `Language: ${displayLanguage(c.value)}`
    default: return c.value
  }
}

export function removeFromQuery(query: string, raw: string): string {
  return query
    .replace(raw, '')
    .replace(/\(\s*OR\s+/g, '(')   // leading OR after (
    .replace(/\s+OR\s*\)/g, ')')   // trailing OR before )
    .replace(/\(\s*AND\s+/g, '(')  // leading AND after (
    .replace(/\s+AND\s*\)/g, ')')  // trailing AND before )
    .replace(/\(\s*\)/g, '')       // empty parens
    .replace(/\s+/g, ' ')
    .trim()
}

export function upsertQueryToken(query: string, token: string, removePattern: RegExp): string {
  const base = query.replace(removePattern, '').replace(/\s+/g, ' ').trim()
  return (base ? base + ' ' : '') + token
}

/**
 * Splits a query string into tokens, treating quoted strings, parentheses,
 * and `field:value` as atomic units.
 */
export function tokenizeQuery(q: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let inQ = false
  for (const ch of q) {
    if (ch === '"') {
      if (inQ) { tokens.push(cur + '"'); cur = ''; inQ = false }
      // Don't flush cur — it may be a field prefix like "contributor:"
      else { cur += '"'; inQ = true }
    } else if (!inQ && (ch === '(' || ch === ')')) {
      if (cur) { tokens.push(cur); cur = '' }
      tokens.push(ch)
    } else if (ch === ' ' && !inQ) {
      if (cur) { tokens.push(cur); cur = '' }
    } else {
      cur += ch
    }
  }
  if (cur) tokens.push(cur)
  return tokens.filter(t => t.length > 0)
}

export function parseSearchQuery(raw: string): ParsedSearch {
  const q = raw.trim()
  if (!q) return { groups: [] }

  const tokens = tokenizeQuery(q)
  const groups: ConditionGroup[] = []

  let negate = false
  let notTok = ''

  function parseSingleCondition(token: string): SearchCondition | null {
    const rawTok = negate ? notTok + ' ' + token : token

    // field:value — value may be quoted ("hello world")
    const fm = token.match(/^(type|tag|genre|contributor|author|title|isbn|letter|has|series|shelf|publisher|language):(.+)$/i)
    if (fm) {
      const rawField = fm[1].toLowerCase()
      const field: CondField = rawField === 'author' ? 'contributor' : rawField as CondField
      const rawVal = fm[2]
      const value = rawVal.startsWith('"') && rawVal.endsWith('"') && rawVal.length > 2
        ? rawVal.slice(1, -1) : rawVal
      const isExact = field === 'type' || field === 'tag' || field === 'genre' || field === 'letter' || field === 'has' || field === 'series' || field === 'shelf' || field === 'publisher' || field === 'language'
      const op: CondOp = negate ? (isExact ? 'not_equals' : 'not_contains') : (isExact ? 'equals' : 'contains')
      negate = false; notTok = ''
      return { field, op, value, raw: rawTok }
    }

    // Regex /pattern/
    if (token.startsWith('/') && token.endsWith('/') && token.length > 2) {
      negate = false; notTok = ''
      return { field: 'title', op: 'regex', value: token.slice(1, -1), raw: rawTok }
    }

    // Quoted phrase
    if (token.startsWith('"') && token.endsWith('"') && token.length > 2) {
      const op: CondOp = negate ? 'not_contains' : 'phrase'
      negate = false; notTok = ''
      return { field: 'title', op, value: token.slice(1, -1), raw: rawTok }
    }

    // Plain term
    const op: CondOp = negate ? 'not_contains' : 'contains'
    negate = false; notTok = ''
    return { field: 'title', op, value: token, raw: rawTok }
  }

  // Outer conditions (outside parens) collected here; flushed when we see '('
  let outerConds: SearchCondition[] = []
  let outerMode: 'AND' | 'OR' = 'AND'

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    const up = token.toUpperCase()

    if (up === 'NOT') { negate = true; notTok = token; i++; continue }
    if (up === 'AND') { i++; continue }
    if (up === 'OR') { outerMode = 'OR'; i++; continue }

    if (token === '(') {
      // Flush pending outer conditions as a group before the paren block
      if (outerConds.length > 0) {
        groups.push({ mode: outerMode, conditions: outerConds })
        outerConds = []
        outerMode = 'AND'
      }
      i++ // skip '('
      const subConds: SearchCondition[] = []
      let subMode: 'AND' | 'OR' = 'AND'
      negate = false; notTok = ''
      while (i < tokens.length && tokens[i] !== ')') {
        const stok = tokens[i]
        const sup = stok.toUpperCase()
        if (sup === 'NOT') { negate = true; notTok = stok; i++; continue }
        if (sup === 'AND') { i++; continue }
        if (sup === 'OR') { subMode = 'OR'; i++; continue }
        const cond = parseSingleCondition(stok)
        if (cond) subConds.push(cond)
        i++
      }
      if (i < tokens.length) i++ // skip ')'
      if (subConds.length > 0) groups.push({ mode: subMode, conditions: subConds })
      continue
    }

    if (token === ')') { i++; continue } // stray close paren — ignore

    const cond = parseSingleCondition(token)
    if (cond) outerConds.push(cond)
    i++
  }

  // Flush remaining outer conditions
  if (outerConds.length > 0) groups.push({ mode: outerMode, conditions: outerConds })

  return { groups }
}
