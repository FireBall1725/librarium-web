# AGENTS.md

Guidance for AI coding agents working in `librarium-web`. Humans should read
[CONTRIBUTING.md](./CONTRIBUTING.md) first; this file assumes you have and does
not repeat it.

## What this repo is

The web client for Librarium: a self-hosted, privacy-focused tracker for
physical book, manga, and comic collections. It is a browser client for a
Librarium server and holds no data of its own.

Librarium is five repos that ship independently:

| Repo | Role |
| --- | --- |
| [`librarium`](https://github.com/FireBall1725/librarium) | Marketing site at librarium.press |
| [`librarium-api`](https://github.com/FireBall1725/librarium-api) | Go backend, the contract every client consumes |
| **`librarium-web`** | **This repo. React, TypeScript, Tailwind v4, Vite** |
| [`librarium-ios`](https://github.com/FireBall1725/librarium-ios) | SwiftUI client |
| [`librarium-mcp`](https://github.com/FireBall1725/librarium-mcp) | MCP server |

Each repo versions on its own. A web release does not imply an api release.

## Product rules that shape design decisions

- **The API owns the logic.** If a feature needs a new computed value, a new
  filter, or a new aggregate, that belongs in `librarium-api` and arrives here
  as a field. Recomputing server data in React is the wrong fix and will be
  asked out of the PR.
- **Self-hosted is canon.** There is no paid tier, no feature gating, no
  licence check. Both editions are free.
- **Multi-server.** A user can connect to several Librarium instances at once
  and switch between them. Never hardcode a single origin or cache anything
  under a key that ignores which server it came from.
- **Everything is admin-configurable, nothing is env-configurable.** Instance
  settings live in the API and are edited through the admin UI, not through
  build-time variables.
- **Telemetry is opt-in and off by default.**

## Stack

React 19, TypeScript, Vite, Tailwind v4 (through `@tailwindcss/vite`, no
`tailwind.config.js`), React Router, i18next, Vitest with Testing Library and
jsdom. No component library. No state management library: server state comes
through `callApi` and local state through hooks.

## Layout

```
src/
  App.tsx                 route table and the shell
  types.ts                TypeScript mirrors of the API's wire shapes
  auth/AuthContext.tsx    auth state plus callApi, the single fetch wrapper
  pages/                  one directory per area: admin, jobs, libraries,
                          import, profile, plus the top-level pages
  components/             shared UI. Anything used by two or more pages
  hooks/                  reusable behaviour, each with its own test where it has one
  lib/search.ts           client-side search and filter helpers
  i18n/                   i18next setup; strings live in public/locales
public/locales/           en-CA and fr-FR translation JSON
```

Every network call goes through `callApi` from `useAuth()`. It handles the
active server, the bearer token, re-auth on expiry, and error shaping. Do not
call `fetch` directly.

## Build and test

The full local stack (api, web, db, mcp) lives in the umbrella
[`librarium`](https://github.com/FireBall1725/librarium) workspace under
`local/docker-compose.yml`. For web-only work, `npm run dev` is faster and
proxies to whatever `VITE_API_PROXY_TARGET` points at.

Before opening a PR, run what CI runs:

```bash
npm ci
npx tsc -b        # typecheck
npm run lint      # eslint
npm run test      # vitest
npm run build
```

CI also runs `editorconfig-checker` and a Docker build, on Node 26 to match the
Dockerfile. The jobs live in
[FireBall1725/workflows](https://github.com/FireBall1725/workflows), so change
them there rather than in this repo's `ci.yml`.

`npm run lint` currently reports pre-existing warnings and exits 0. Do not
silence them wholesale, and do not add new ones.

## Things that will bite you

- **Never hand-edit the version.** Releases are `YY.M.revision` (`26.8.0`,
  `26.8.1`, resetting to `.0` when the month rolls over) and CI computes it from
  the latest tag. No version is committed to source: `vite.config.ts` reads
  `LIBRARIUM_VERSION`, which the Dockerfile receives from the release workflow.
  Local builds report `0.0.0-dev` on purpose.
- **Never edit `CHANGELOG.md`.** Release notes are generated from PR titles.
- **`types.ts` is a mirror, not a source.** When an API response shape changes,
  update it here to match what the server actually sends. It is hand-maintained
  and drifts silently.
- **A PUT to a settings endpoint usually replaces the whole record.** Sending a
  partial object clears the fields you left out. Read the current value, change
  one field, send it all back.
- **Tailwind v4 has no config file.** Everything lives in `src/index.css`,
  which imports Tailwind, declares the dark variant, and defines the semantic
  colour tokens. There is no `tailwind.config.js` to add to.
- **Dark mode is class-based, not media-query-based.** The variant is
  `@custom-variant dark (&:where(.dark, .dark *))`, so it follows a `.dark`
  class on an ancestor rather than the OS setting.
- **Colour comes from semantic tokens, not palette shades.** Write
  `bg-surface`, `text-content-muted`, `border-line`; do not write `bg-white
  dark:bg-gray-900`. The token resolves per theme, so one class covers both and
  a third theme costs no component changes. `src/index.css` is the only file
  that names a raw shade. Run `node scripts/verify-colour-tokens.mjs` after a
  build to confirm the tokens still resolve to the intended colours.
- Around 980 `dark:` utilities remain from before the token layer, mostly
  unpaired or in colour families with no token yet. Convert the ones you touch
  rather than adding more.
- **Every string a user reads goes through i18next.** New copy needs keys in
  both `en-CA` and `fr-FR`; an English string in the French bundle is worse than
  a missing one, so leave a real translation or flag it in the PR.
- A component that only looks right in one theme is not finished. Using a
  semantic token gets you both for free; a raw palette shade does not.

## Conventions

- Every file starts with the SPDX header and copyright line already used
  throughout the repo. Copy the form from a neighbouring file.
- Comments explain why a thing is the way it is. The codebase carries a lot of
  rationale comments above non-obvious decisions; match that.
- Components are function declarations with typed props, default export for the
  page or component itself.
- Prefer widening an existing component over adding a near-duplicate.
- Commit messages are short and imperative with a scope:
  `fix(jobs): keep schedule config on toggle`.
- Every commit needs a DCO sign-off (`git commit -s`).

## End-to-end tests

`e2e/` holds Playwright specs that drive the app in a real browser against a
real API and a real database.

```bash
npm run e2e:stack        # postgres + api, on 8090, throwaway
npm run e2e              # headless
npm run e2e:headed       # watch it happen
npm run e2e:ui           # time-travel debugger, a DOM snapshot per step
npm run e2e:stack:down   # takes the database with it
```

**Drive the interface, verify through the API.** Asserting on the page alone
cannot tell a write that landed from one that was only drawn: an optimistic
control shows the new state either way. Click the button, then ask the server
what came of it, then check the reader can see it. All three, in that order.

The stack is deliberately disposable. The journey starts at "set up a new
instance" and the setup route refuses once an instance has an admin, so a suite
that reused a database could only run its most important test once. `down -v`
and a tmpfs volume are what make it repeatable.

Seeding through the API is not cheating. A test about pagination wants a
hundred books, and clicking a hundred times tests the add form a hundred times
rather than testing pagination once. Drive the interface for the thing under
test; get everything else into place the fast way.

New specs get the session for free: the `setup` project signs in once and saves
`storageState`, and every other project depends on it.
