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
 * Plural categories per language, split by whether this app can reach them.
 *
 * `required` is what a translator must supply. `allowed` is everything CLDR
 * lists, so a form somebody adds is accepted rather than flagged.
 *
 * The gap between them is `many`, which French, Spanish and Portuguese all
 * have and which `Intl.PluralRules` only selects at a million and above. No
 * count in this app reaches that: they are books on a shelf, volumes in a run,
 * filters on a page. Requiring it would mean 33 dead strings per language, and
 * pretending the category does not exist would be the kind of quiet
 * inaccuracy this script is meant to catch. So it is written down and not
 * required.
 *
 * Japanese has no singular at all, so a `_one` key there is a string i18next
 * will never read.
 *
 * The Slavic languages need `_few`, which the English source has no way to
 * express. Adding one is a change to the source keys rather than a
 * translation, which is why they are not here yet.
 */
const PLURALS = {
  'en-CA': { required: ['one', 'other'], allowed: ['one', 'other'] },
  'fr-FR': { required: ['one', 'other'], allowed: ['one', 'many', 'other'] },
  'de-DE': { required: ['one', 'other'], allowed: ['one', 'other'] },
  'ja-JP': { required: ['other'], allowed: ['other'] },
  'es-ES': { required: ['one', 'other'], allowed: ['one', 'many', 'other'] },
  'pt-BR': { required: ['one', 'other'], allowed: ['one', 'many', 'other'] },
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

/**
 * The plural category a key carries, or null when it carries none.
 *
 * A suffix alone does not make a plural: `books.select_one` is "Select {title}"
 * and `duplicate_authors.pick_one` is "Choose which spelling to keep". Both are
 * called by name with no count, and treating them as singular forms drops them
 * from any language that has no singular category, which is how Japanese ended
 * up missing two real strings. i18next only pluralises a key when the sibling
 * forms exist, so that is the test.
 */
const suffixOf = (key, all) => {
  const m = key.match(/_(zero|one|two|few|many|other)$/)
  if (!m) return null
  const base = key.slice(0, -m[0].length)
  const pluralised = `${base}_other` in all || `${base}_plural` in all
  return pluralised ? m[1] : null
}

let failed = false
const fail = m => { failed = true; console.error(`  ✗ ${m}`) }

const namespaces = readdirSync(join(ROOT, SOURCE)).filter(f => f.endsWith('.json'))
const locales = readdirSync(ROOT).filter(l => l !== SOURCE)

for (const locale of locales) {
  console.log(`${locale}`)
  const rules = PLURALS[locale]
  if (!rules) {
    fail(`${locale}: no plural rules recorded. Add them to PLURALS before shipping this locale.`)
    continue
  }
  // Checked against the platform rather than trusted: a table written by hand
  // is a table that can be wrong about a language nobody here speaks.
  const actual = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
  for (const c of rules.allowed) {
    if (!actual.includes(c)) fail(`${locale}: CLDR has no "${c}" category`)
  }
  for (const c of rules.required) {
    if (!actual.includes(c)) fail(`${locale}: "${c}" is required here but CLDR does not have it`)
  }

  for (const ns of namespaces) {
    const path = join(ROOT, locale, ns)
    if (!existsSync(path)) { fail(`${locale}/${ns} is missing`); continue }

    const src = flatten(JSON.parse(readFileSync(join(ROOT, SOURCE, ns), 'utf8')))
    const dst = flatten(JSON.parse(readFileSync(path, 'utf8')))

    // A key the source has and the locale does not falls back to English
    // without saying so, which is how a locale rots quietly.
    for (const key of Object.keys(src)) {
      const suffix = suffixOf(key, src)
      if (suffix && !rules.required.includes(suffix)) continue
      if (!(key in dst)) fail(`${locale}/${ns}: missing ${key}`)
    }

    for (const [key, value] of Object.entries(dst)) {
      const suffix = suffixOf(key, src)
      if (suffix && !rules.allowed.includes(suffix)) {
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
