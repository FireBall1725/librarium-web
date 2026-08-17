// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// One-shot codemod: rewrite paired light/dark colour utilities into the semantic
// tokens defined in src/index.css.
//
//   bg-white dark:bg-gray-900         ->  bg-surface
//   text-gray-500 dark:text-gray-400  ->  text-content-muted
//
// Run with --dry to print the plan without writing.
//
// Two things this has to get right, both learned the hard way:
//
//   1. Class strings are not only in className attributes. 265 of them live in
//      helper functions and consts, so this walks STRING LITERALS instead of
//      JSX attributes.
//   2. Every className template literal in this codebase contains a ${...}
//      expression. A naive regex over the whole literal produces tokens like
//      `dark:text-gray-200'` by swallowing quotes from the embedded ternary.
//      So template literals are split on their expressions and only the static
//      chunks are rewritten. A pair split across a boundary is left alone and
//      reported.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");

const MAP = {
  bg: {
    "bg-white":     { "bg-gray-900": "surface", "bg-gray-900/60": "surface", "bg-gray-950": "surface",
                      "bg-gray-800": "surface-raised" },
    "bg-gray-50":   { "bg-gray-800": "surface-muted", "bg-gray-800/50": "surface-muted",
                      "bg-gray-800/60": "surface-muted", "bg-gray-950": "surface-muted",
                      "bg-gray-950/50": "surface-muted", "bg-gray-900": "surface-muted",
                      "bg-gray-900/50": "surface-muted", "bg-gray-900/40": "surface-muted" },
    "bg-gray-100":  { "bg-gray-800": "surface-inset", "bg-gray-700": "surface-inset",
                      "bg-gray-900": "surface-inset" },
    "bg-gray-200":  { "bg-gray-700": "surface-strong", "bg-gray-600": "surface-strong",
                      "bg-gray-800": "surface-strong" },
    "bg-red-50":    { "bg-red-950/50": "danger-surface", "bg-red-950/30": "danger-surface",
                      "bg-red-900/20": "danger-surface" },
    "bg-blue-50":   { "bg-blue-900/30": "accent-surface", "bg-blue-950/30": "accent-surface",
                      "bg-blue-950/50": "accent-surface", "bg-blue-950/40": "accent-surface",
                      "bg-blue-900/20": "accent-surface" },
    "bg-green-50":  { "bg-green-950/50": "success-surface", "bg-green-950/30": "success-surface" },
    "bg-amber-50":  { "bg-amber-900/20": "warning-surface", "bg-amber-950/50": "warning-surface",
                      "bg-amber-950/30": "warning-surface" },
  },
  text: {
    "text-gray-900": { "text-white": "content", "text-gray-100": "content" },
    "text-gray-800": { "text-gray-200": "content-strong" },
    "text-gray-700": { "text-gray-300": "content-secondary", "text-gray-200": "content-secondary",
                       "text-gray-500": "content-secondary" },
    "text-gray-600": { "text-gray-400": "content-tertiary", "text-gray-300": "content-tertiary" },
    "text-gray-500": { "text-gray-400": "content-muted", "text-gray-500": "content-muted" },
    "text-gray-400": { "text-gray-500": "content-subtle" },
    "text-gray-300": { "text-gray-600": "content-faint" },
    "text-red-600":  { "text-red-400": "danger" },
    "text-red-700":  { "text-red-400": "danger-strong", "text-red-300": "danger-strong" },
    "text-red-500":  { "text-red-400": "danger" },
    "text-blue-600": { "text-blue-400": "accent" },
    "text-blue-700": { "text-blue-300": "accent-strong", "text-blue-400": "accent-strong" },
    "text-green-600":{ "text-green-400": "success" },
    "text-green-700":{ "text-green-400": "success-strong", "text-green-300": "success-strong" },
    "text-amber-600":{ "text-amber-400": "warning" },
    "text-amber-700":{ "text-amber-400": "warning-strong", "text-amber-300": "warning-strong" },
    "text-amber-800":{ "text-amber-300": "warning-strong", "text-amber-200": "warning-strong" },
  },
  border: {
    "border-gray-200": { "border-gray-700": "line", "border-gray-800": "line", "border-gray-600": "line" },
    "border-gray-300": { "border-gray-600": "line-strong", "border-gray-700": "line-strong" },
    "border-gray-100": { "border-gray-800": "line-subtle", "border-gray-700": "line-subtle",
                         "border-gray-700/60": "line-subtle" },
    "border-red-200":  { "border-red-800": "danger-line", "border-red-900": "danger-line" },
    "border-blue-300": { "border-blue-700": "accent-line", "border-blue-600": "accent-line" },
    "border-blue-200": { "border-blue-800": "accent-line" },
    "border-green-200":{ "border-green-800": "success-line" },
    "border-amber-200":{ "border-amber-800": "warning-line", "border-amber-700": "warning-line" },
  },
  divide: {
    "divide-gray-100": { "divide-gray-800": "line-subtle", "divide-gray-700": "line-subtle" },
    "divide-gray-200": { "divide-gray-700": "line", "divide-gray-800": "line" },
  },
  ring: {
    "ring-green-200": { "ring-green-800": "success-line" },
    "ring-gray-200":  { "ring-gray-700": "line" },
  },
};

const stats = { exact: 0, normalised: 0, files: 0 };
const normalised = new Map();
const skipped = new Map();
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

// Rewrite one contiguous run of class text. Never sees a ${...} boundary.
//
// Utilities may carry variant prefixes (hover:, focus:, group-hover:, md:).
// A pair is two utilities with the SAME variant list, one of which also has
// `dark`. So `hover:bg-gray-100` pairs with `dark:hover:bg-gray-800`, and both
// collapse to `hover:bg-surface-inset`.
function splitVariants(word) {
  const bits = word.split(":");
  const utility = bits.pop();
  return { variants: bits, utility };
}

function rewriteChunk(text) {
  if (!text.includes("dark:")) return text;
  const parts = text.split(/(\s+)/);
  const words = parts.filter((p) => p.trim());

  // key = variants without `dark`, joined; value = list of {word, utility}
  const darkBy = new Map();
  for (const w of words) {
    const { variants, utility } = splitVariants(w);
    if (!variants.includes("dark")) continue;
    const key = variants.filter((v) => v !== "dark").join(":");
    if (!darkBy.has(key)) darkBy.set(key, []);
    darkBy.get(key).push({ word: w, utility });
  }

  const replace = new Map();
  const drop = new Set();

  for (const w of words) {
    const { variants, utility } = splitVariants(w);
    if (variants.includes("dark")) continue;
    const prop = utility.split("-")[0];
    const table = MAP[prop]?.[utility];
    if (!table) continue;

    const key = variants.join(":");
    const candidates = darkBy.get(key) || [];
    const hit = candidates.find((c) => table[c.utility]);
    if (!hit) {
      if (candidates.length) bump(skipped, `${w} + ${candidates[0].word}`);
      continue;
    }

    const token = table[hit.utility];
    const canonical = Object.entries(table).find(([, t]) => t === token)[0];
    if (hit.utility === canonical) stats.exact++;
    else { stats.normalised++; bump(normalised, `${w} + ${hit.word} -> ${key ? key + ":" : ""}${prop}-${token}`); }

    replace.set(w, `${key ? key + ":" : ""}${prop}-${token}`);
    drop.add(hit.word);
    darkBy.set(key, candidates.filter((c) => c !== hit));
  }

  if (!replace.size) return text;

  const out = [];
  for (const p of parts) {
    if (!p.trim()) { out.push(p); continue; }
    if (drop.has(p)) continue;
    out.push(replace.get(p) ?? p);
  }
  return out.join("").replace(/[ \t]{2,}/g, " ");
}

// Walk the source, tracking string state, and rewrite only literal text.
// Template literals are entered but their ${...} expressions are skipped, so a
// class run never spans one.
function transform(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let chunkStart = -1;   // start of literal text we may rewrite
  let quote = null;      // ' " or `
  const tmplStack = [];  // brace depth inside ${ } within a template literal

  const flush = (end) => {
    if (chunkStart === -1) return;
    out += rewriteChunk(src.slice(chunkStart, end));
    chunkStart = -1;
  };

  while (i < n) {
    const c = src[i];

    if (quote === null) {
      // line and block comments: copy through untouched
      if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); const j = e === -1 ? n : e; out += src.slice(i, j); i = j; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i); const j = e === -1 ? n : e + 2; out += src.slice(i, j); i = j; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; chunkStart = i; continue; }
      out += c; i++; continue;
    }

    // inside a string
    if (c === "\\") {                       // escape: keep both chars in the chunk
      i += 2; continue;
    }
    if (quote === "`" && c === "$" && src[i + 1] === "{") {
      flush(i);                             // rewrite the static run so far
      out += "${";
      i += 2;
      let depth = 1;                        // copy the expression verbatim
      while (i < n && depth > 0) {
        const d = src[i];
        if (d === "{") depth++;
        else if (d === "}") depth--;
        if (depth === 0) break;
        out += d; i++;
      }
      out += "}"; i++;
      chunkStart = i;                       // a fresh static run starts here
      continue;
    }
    if (c === quote) {
      flush(i);
      out += c; i++; quote = null; continue;
    }
    i++;
  }
  flush(n);
  return out;
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})("src");

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const out = transform(src);
  if (out !== src) {
    stats.files++;
    if (!DRY) writeFileSync(file, out);
  }
}

console.log(DRY ? "DRY RUN, nothing written\n" : "applied\n");
console.log(`files changed        ${stats.files}`);
console.log(`utilities -> tokens  ${stats.exact + stats.normalised}`);
console.log(`  exact pairing      ${stats.exact}`);
console.log(`  normalised drift   ${stats.normalised}`);
if (normalised.size) {
  console.log("\nnormalised (dark value shifted onto the canonical one):");
  [...normalised].sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log(`  ${String(c).padStart(4)}  ${k}`));
}
if (skipped.size) {
  console.log("\nleft with dark: variants (no token):");
  [...skipped].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, c]) => console.log(`  ${String(c).padStart(4)}  ${k}`));
}
