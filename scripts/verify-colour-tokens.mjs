// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Guard for the semantic colour tokens in src/index.css.
//
// What this used to check: that every token still resolved to the exact palette
// colour the `dark:` utilities it replaced had been using. That was the right
// assertion while the token layer was a mechanical conversion meant to change
// nothing on screen, and it is the wrong one now — the themes carry the
// reference implementation's palette on purpose, so pinning them to the old
// blue and grey would forbid the redesign it was written to protect.
//
// What it checks instead is the property that still has to hold: a theme is
// complete. Every theme defines the full sixteen-colour palette, every derived
// token is defined once, and the aliases the ported reference CSS reads are all
// present. A theme missing a colour renders one surface from another theme's
// value, which is the failure that actually reaches a reader.
//
// Run against a production build:  npm run build && node scripts/verify-colour-tokens.mjs
//
// Note: Tailwind splits a selector across several rules when a value uses
// `--alpha()`, so every matching block has to be merged before checking.
// Reading only the first one reports whole families as missing.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist/assets";
const cssFile = readdirSync(DIST).filter((f) => f.endsWith(".css")).sort().pop();
if (!cssFile) {
  console.error("No built CSS in dist/assets. Run `npm run build` first.");
  process.exit(1);
}
const css = readFileSync(join(DIST, cssFile), "utf8");

/** Every custom property declared by rules whose selector list mentions needle. */
function mergedVars(needle) {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    if (!selector.replace(/["']/g, "").includes(needle)) continue;
    for (const v of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
      out[v[1].trim()] = v[2].trim();
    }
  }
  return out;
}

// The sixteen a theme must name. Everything else is derived from these.
const PALETTE = [
  "--r-bg", "--r-bg-raise", "--r-card",
  "--r-text", "--r-text-2", "--r-text-3",
  "--r-line", "--r-line-2",
  "--r-accent", "--r-accent-2", "--r-accent-sf",
  "--r-good", "--r-warn", "--r-bad", "--r-shadow",
];

// The tokens components actually consume.
const TOKENS = [
  "surface", "surface-raised", "surface-muted", "surface-inset", "surface-strong",
  "content", "content-strong", "content-secondary", "content-tertiary",
  "content-muted", "content-subtle", "content-faint",
  "line", "line-strong", "line-subtle",
  "accent", "accent-strong", "accent-surface", "accent-line",
  "danger", "danger-strong", "danger-surface", "danger-line",
  "success", "success-strong", "success-surface", "success-line",
  "warning", "warning-strong", "warning-surface", "warning-line",
].map((n) => `--t-${n}`);

// What the ported reference stylesheet reads. A missing alias renders a ported
// component with no colour at all, which is far louder than a wrong shade.
const ALIASES = [
  "--bg", "--bg-raise", "--card", "--text", "--text-2", "--text-3",
  "--line", "--line-2", "--accent", "--accent-2", "--accent-sf",
  "--good", "--warn", "--gold", "--bad", "--shadow",
];

const THEMES = [
  ["paper", ':root'],
  ["ink", '[data-theme=ink]'],
  ["sepia", '[data-theme=sepia]'],
  ["nocturne", '[data-theme=nocturne]'],
];

let failed = 0;

for (const [name, selector] of THEMES) {
  const vars = mergedVars(selector);
  const missing = PALETTE.filter((p) => !(p in vars));
  if (missing.length) {
    console.error(`  ${name}: missing ${missing.length} palette colours: ${missing.join(" ")}`);
    failed++;
  } else {
    console.log(`  ${name}: all ${PALETTE.length} palette colours defined`);
  }
}

// Derived tokens and aliases live on a bare :root, so they are checked once.
const root = mergedVars(":root");

for (const [label, list] of [["tokens", TOKENS], ["reference aliases", ALIASES]]) {
  const missing = list.filter((n) => !(n in root));
  if (missing.length) {
    console.error(`  ${label}: missing ${missing.length}: ${missing.join(" ")}`);
    failed++;
  } else {
    console.log(`  ${label}: all ${list.length} defined`);
  }
}

// A token that resolves to nothing is worse than one that resolves oddly: the
// property is dropped and the element inherits, which looks like a bug
// somewhere else entirely.
const empty = [...TOKENS, ...ALIASES].filter((n) => root[n] !== undefined && root[n] === "");
if (empty.length) {
  console.error(`  empty values: ${empty.join(" ")}`);
  failed++;
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll themes complete.");
