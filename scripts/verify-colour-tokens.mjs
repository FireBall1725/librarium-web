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
const cssFile = readdirSync(DIST).find((f) => f.endsWith(".css"));
if (!cssFile) {
  console.error("No built CSS in dist/assets. Run `npm run build` first.");
  process.exit(1);
}
const css = readFileSync(join(DIST, cssFile), "utf8");

function mergedVars(selectorLiteral) {
  const re = new RegExp(`${selectorLiteral}\\{([^}]*)\\}`, "g");
  const out = {};
  for (const m of css.matchAll(re)) {
    for (const v of m[1].matchAll(/--t-([a-z-]+):var\(--color-([a-z0-9-]+)\)/g)) out[v[1]] = v[2];
  }
  return out;
}

const light = mergedVars(":root");
const dark = mergedVars("\\.dark");

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

const alphaFound = Object.fromEntries(
  [...css.matchAll(/--t-([a-z-]+-surface):color-mix\(in oklab,\s*var\(--color-([a-z0-9-]+)\)\s*([0-9]+)%/g)]
    .map((m) => [m[1], [m[2], m[3]]])
);
for (const [tok, [wantL, wantDColour, wantPct]] of Object.entries(EXPECT_ALPHA)) {
  const gotL = light[tok];
  const got = alphaFound[tok];
  if (gotL === wantL && got && got[0] === wantDColour && got[1] === wantPct) { ok++; continue; }
  bad++;
  console.log(`  MISMATCH ${tok}: light ${gotL} (want ${wantL}), dark ${got ? got.join(" @ ") + "%" : "missing"} (want ${wantDColour} @ ${wantPct}%)`);
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
