// Checks every locale against the source it was translated from.
//
// A translation fails silently. A renamed placeholder renders as nothing, a
// missing key falls back to English without a word, and a plural form the
// language does not have is simply never used. None of that shows up in a
// typecheck or a test, and none of it is visible unless somebody reads the app
// in that language.
//
// So: same keys as the source, same placeholders in every value, and plural
// suffixes that exist in the target language's CLDR rules.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'public/locales'
const SOURCE = 'en-CA'

/**
 * Plural categories per language, from CLDR.
 *
 * English and German distinguish one from other. Japanese does not distinguish
 * at all, so a `_one` key there is dead weight the library will never read.
 * The Slavic languages need `_few` and `_many`, which the English source has
 * no way to express: adding one of those is a change to the source keys, not a
 * translation, which is why they are not in this list yet.
 */
const PLURALS = {
  'en-CA': ['one', 'other'],
  'fr-FR': ['one', 'other'],
  'de-DE': ['one', 'other'],
  'ja-JP': ['other'],
}

const flatten = (o, p = '') =>
  Object.entries(o).reduce((acc, [k, v]) => {
    const key = p ? `${p}.${k}` : k
    return typeof v === 'object' && v !== null
      ? { ...acc, ...flatten(v, key) }
      : { ...acc, [key]: v }
  }, {})

/** `{{count}}` and friends, which must survive translation exactly. */
const placeholders = s =>
  new Set(typeof s === 'string' ? (s.match(/\{\{[^}]+\}\}/g) ?? []) : [])

const suffixOf = key => {
  const m = key.match(/_(zero|one|two|few|many|other)$/)
  return m ? m[1] : null
}

let failed = false
const fail = m => { failed = true; console.error(`  ✗ ${m}`) }

const namespaces = readdirSync(join(ROOT, SOURCE)).filter(f => f.endsWith('.json'))
const locales = readdirSync(ROOT).filter(l => l !== SOURCE)

for (const locale of locales) {
  console.log(`${locale}`)
  const allowed = PLURALS[locale]
  if (!allowed) {
    fail(`${locale}: no plural rules recorded. Add them to PLURALS before shipping this locale.`)
    continue
  }

  for (const ns of namespaces) {
    const path = join(ROOT, locale, ns)
    if (!existsSync(path)) { fail(`${locale}/${ns} is missing`); continue }

    const src = flatten(JSON.parse(readFileSync(join(ROOT, SOURCE, ns), 'utf8')))
    const dst = flatten(JSON.parse(readFileSync(path, 'utf8')))

    // A key the source has and the locale does not falls back to English
    // without saying so, which is how a locale rots quietly.
    for (const key of Object.keys(src)) {
      const suffix = suffixOf(key)
      if (suffix && !allowed.includes(suffix)) continue
      if (!(key in dst)) fail(`${locale}/${ns}: missing ${key}`)
    }

    for (const [key, value] of Object.entries(dst)) {
      const suffix = suffixOf(key)
      if (suffix && !allowed.includes(suffix)) {
        fail(`${locale}/${ns}: ${key} uses the "${suffix}" plural, which ${locale} does not have`)
        continue
      }
      const base = suffix ? key.replace(/_(zero|one|two|few|many|other)$/, '') : key
      const source = src[key] ?? src[`${base}_other`] ?? src[base]
      if (source === undefined) { fail(`${locale}/${ns}: ${key} is not in the source`); continue }

      const want = placeholders(source)
      const got = placeholders(value)
      for (const p of want) if (!got.has(p)) fail(`${locale}/${ns}: ${key} lost ${p}`)
      for (const p of got) if (!want.has(p)) fail(`${locale}/${ns}: ${key} invented ${p}`)
    }
  }
  if (!failed) console.log('  ok')
}

if (failed) {
  console.error('\nlocales do not match the source')
  process.exit(1)
}
console.log('\nevery locale matches the source')
