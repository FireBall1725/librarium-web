// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Guard for the semantic colour tokens in src/index.css.
//
// The token layer replaced ~2,100 paired `dark:` utilities. This asserts that
// every token still resolves to the exact palette colour the classes it
// replaced were using, in both themes, so a later edit cannot quietly shift a
// shade across the whole client.
//
// Run against a production build:  npm run build && node scripts/verify-colour-tokens.mjs
//
// Note: Tailwind splits `.dark` across several rules when a value uses
// `--alpha()`, so every matching block has to be merged before checking. Reading
// only the first one reports the coloured families as missing.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist/assets";
const cssFile = readdirSync(DIST).filter((f) => f.endsWith(".css")).sort().pop();
if (!cssFile) {
  console.error("No built CSS in dist/assets. Run `npm run build` first.");
  process.exit(1);
}
const css = readFileSync(join(DIST, cssFile), "utf8");

// Match any rule whose selector LIST mentions the target, so `:root,
// [data-theme="paper"] { ... }` is found by either name. Tailwind also splits a
// selector across several rules when a value uses --alpha(), so all matching
// blocks are merged.
function mergedVars(needle) {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    if (!selector.replace(/["']/g, "").includes(needle)) continue;
    if (!body.includes("--t-")) continue;
    for (const v of body.matchAll(/--t-([a-z-]+):var\(--color-([a-z0-9-]+)\)/g)) out[v[1]] = v[2];
  }
  return out;
}

// Same, but for the alpha-blended surfaces.
function mergedAlpha(needle) {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    if (!selector.replace(/["']/g, "").includes(needle)) continue;
    for (const v of body.matchAll(/--t-([a-z-]+-surface):color-mix\(in oklab,\s*var\(--color-([a-z0-9-]+)\)\s*([0-9]+)%/g))
      out[v[1]] = [v[2], v[3]];
  }
  return out;
}

// The minifier strips quotes from attribute selectors, so compare unquoted.
function mergedVarsAny(needle) {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    if (!selector.replace(/["']/g, "").includes(needle)) continue;
    for (const v of body.matchAll(/--t-([a-z-]+):/g)) out[v[1]] = true;
  }
  return out;
}

const light = mergedVars("[data-theme=paper]");
const dark = mergedVars("[data-theme=ink]");

// token -> [light palette entry, dark palette entry] it must equal
const EXPECT = {
  surface: ["white", "gray-900"],
  "surface-raised": ["white", "gray-800"],
  "surface-muted": ["gray-50", "gray-800"],
  "surface-inset": ["gray-100", "gray-800"],
  "surface-strong": ["gray-200", "gray-700"],

  content: ["gray-900", "white"],
  "content-strong": ["gray-800", "gray-200"],
  "content-secondary": ["gray-700", "gray-300"],
  "content-tertiary": ["gray-600", "gray-400"],
  "content-muted": ["gray-500", "gray-400"],
  "content-subtle": ["gray-400", "gray-500"],
  "content-faint": ["gray-300", "gray-600"],

  line: ["gray-200", "gray-700"],
  "line-strong": ["gray-300", "gray-600"],
  "line-subtle": ["gray-100", "gray-800"],

  accent: ["blue-600", "blue-400"],
  "accent-strong": ["blue-700", "blue-300"],
  "accent-line": ["blue-300", "blue-700"],

  danger: ["red-600", "red-400"],
  "danger-strong": ["red-700", "red-400"],
  "danger-line": ["red-200", "red-800"],

  success: ["green-600", "green-400"],
  "success-strong": ["green-700", "green-400"],
  "success-line": ["green-200", "green-800"],

  warning: ["amber-600", "amber-400"],
  "warning-strong": ["amber-700", "amber-300"],
  "warning-line": ["amber-200", "amber-800"],
};

// the *-surface tokens are alpha blends in dark, checked separately
const EXPECT_ALPHA = {
  "accent-surface": ["blue-50", "blue-900", "30"],
  "danger-surface": ["red-50", "red-950", "50"],
  "success-surface": ["green-50", "green-950", "50"],
  "warning-surface": ["amber-50", "amber-950", "50"],
};

let bad = 0;
let ok = 0;
for (const [tok, [wantL, wantD]] of Object.entries(EXPECT)) {
  if (light[tok] === wantL && dark[tok] === wantD) { ok++; continue; }
  bad++;
  console.log(`  MISMATCH ${tok}: light ${light[tok]} (want ${wantL}), dark ${dark[tok]} (want ${wantD})`);
}

// The alpha surfaces are emitted twice by the minifier: a precomputed hex and a
// color-mix() fallback, and which one appears where is its business, not ours.
// So intent is checked in the SOURCE and presence in the build.
const srcCss = readFileSync("src/index.css", "utf8");
const inkBlock = srcCss.slice(srcCss.indexOf('[data-theme="ink"]'), srcCss.indexOf('[data-theme="sepia"]'));
for (const [tok, [wantL, wantDColour, wantPct]] of Object.entries(EXPECT_ALPHA)) {
  const declared = new RegExp(`--t-${tok}:\\s*--alpha\\(var\\(--color-${wantDColour}\\)\\s*/\\s*${wantPct}%\\)`).test(inkBlock);
  const present = new RegExp(`--t-${tok}:`).test(css);
  if (light[tok] === wantL && declared && present) { ok++; continue; }
  bad++;
  console.log(`  MISMATCH ${tok}: light ${light[tok]} (want ${wantL}), ink declares ${wantDColour} @ ${wantPct}%? ${declared}, in build? ${present}`);
}

console.log(`\n${ok} tokens resolve to the colour they replaced, ${bad} mismatched`);
if (bad) process.exit(1);

// Nothing outside index.css should be naming a raw palette shade in a dark: variant.
const files = [];
(function walk(d) {
  for (const n of readdirSync(d, { withFileTypes: true })) {
    if (n.isDirectory()) walk(join(d, n.name));
    else if (/\.tsx?$/.test(n.name)) files.push(join(d, n.name));
  }
})("src");
const PALETTE = /dark:(bg|text|border|divide|ring)-(gray|red|blue|green|amber|slate|zinc)-\d{2,3}/g;
let leftovers = 0;
for (const f of files) {
  const hits = readFileSync(f, "utf8").match(PALETTE);
  if (hits) leftovers += hits.length;
}
console.log(`${leftovers} paired dark: palette utilities remain (tail, not yet tokenised)`);

// Every theme must define the full token set, or a component falls back to
// whatever :root left behind and the theme is subtly broken rather than absent.
const REQUIRED = [...Object.keys(EXPECT), ...Object.keys(EXPECT_ALPHA)];
let incomplete = 0;
for (const theme of ["paper", "ink", "sepia", "nocturne"]) {
  const plain = mergedVarsAny(`[data-theme=${theme}]`);
  const missing = REQUIRED.filter((t) => !(t in plain));
  if (missing.length) {
    incomplete++;
    console.log(`  ${theme} is missing ${missing.length} token(s): ${missing.slice(0, 6).join(", ")}`);
  } else {
    console.log(`  ${theme}: all ${REQUIRED.length} tokens defined`);
  }
}
if (incomplete) process.exit(1);
