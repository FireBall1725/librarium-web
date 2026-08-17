// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Guard for CSS that only breaks once it has been minified.
//
// verify-colour-tokens.mjs reads src/index.css, which is the right place to
// check what we wrote. This reads dist/ instead, because the shell has already
// shipped one bug that existed only after the build: the rail's desktop rule
// carried both `translate` and `transform` resets, the minifier folded the
// individual transform properties into `transform` and dropped the `translate`
// line, and the sidebar stayed parked at -100% on every desktop viewport. It
// was correct under `npm run dev`, where nothing is minified, so nothing local
// caught it and it reached a release.
//
// Assertions are deliberately about the built bytes rather than about
// behaviour. A browser test would be a better check and a much heavier one;
// this costs milliseconds and catches the specific class of failure that has
// actually happened.
//
// Run after `npm run build`.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist/assets";

/** The checks, each against the whole concatenated CSS bundle. */
const CHECKS = [
  {
    name: "desktop rail cancels the drawer's translate",
    // The rail is pushed off-canvas with Tailwind's -translate-x-full, which
    // compiles to the standalone `translate` property. If the desktop rule
    // stops cancelling it, the sidebar is invisible on every desktop viewport.
    test: css => {
      const block = containerShellBlock(css);
      if (!block) return "no `@container shell` block found in the built CSS";
      if (!/\.app-sidebar\{[^}]*translate:/.test(block)) {
        return "the .app-sidebar rule inside `@container shell` sets no `translate`.\n" +
          "      A `transform` reset does not cancel Tailwind's -translate-x-full.\n" +
          "      If you added a `transform` declaration to that rule, the minifier\n" +
          "      just dropped the `translate` one — they cannot share a rule.\n" +
          `      Rule as built: ${(block.match(/\.app-sidebar\{[^}]*\}/) || ["<none>"])[0]}`;
      }
      return null;
    },
  },
  {
    name: "the drawer utility survived the build",
    // The other half of the pair. If Tailwind stops emitting this, the mobile
    // drawer never hides and the check above is testing nothing.
    test: css =>
      /\.-translate-x-full\{[^}]*translate:/.test(css)
        ? null
        : "`.-translate-x-full` is missing or no longer sets `translate`; the mobile drawer cannot hide",
  },
];

/** The text of the `@container shell (...)` block, braces balanced. */
function containerShellBlock(css) {
  const start = css.indexOf("@container shell");
  if (start === -1) return null;
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return css.slice(start);
}

let css;
try {
  const files = readdirSync(DIST).filter(f => f.endsWith(".css"));
  if (files.length === 0) throw new Error(`no .css in ${DIST}`);
  css = files.map(f => readFileSync(join(DIST, f), "utf8")).join("\n");
} catch (err) {
  console.error(`Cannot read the built CSS (${err.message}). Run \`npm run build\` first.`);
  process.exit(1);
}

const failures = CHECKS.map(c => ({ name: c.name, problem: c.test(css) })).filter(c => c.problem);

for (const f of failures) console.error(`  ✗ ${f.name}\n      ${f.problem}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} built-CSS check(s) failed.`);
  process.exit(1);
}
console.log(`Built CSS OK (${CHECKS.length} checks).`);
