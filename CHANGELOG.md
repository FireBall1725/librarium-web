# Changelog

All notable changes to **librarium-web** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Versioning

This project uses **`YY.MM.revision`** (e.g. `26.4.0`, `26.4.1`):

- `YY` — two-digit release year.
- `MM` — release month, *not* zero-padded.
- `revision` — feature counter within the month, starting at `0`. Resets to `0` when the month rolls over.
- `-dev` suffix marks local unshipped builds; never released.

Versions `0.1.0` → `0.13.0` predate this scheme. `26.4.0` is the first release cut under the new format and the first release of `librarium-web` as an independent repository.

## [26.4.1] — AI-powered book suggestions

Client-side surfaces for the AI suggestions feature landing in `librarium-api` 26.4.1. Also ships the previously-merged Helm chart and associated packaging work.

### Added

- **Admin → Connections → AI** page: provider configuration cards driven by server-declared `config_fields` (so new provider backends don't need client changes), test-connection button, active-provider selector, and two-layer AI permissions toggles (reading history / ratings / favourites / full library / taste profile).
- **Profile → AI Privacy**: master opt-in toggle plus a taste profile form — three-way chip UX (neutral → love → avoid) for genres, themes and formats; single-select era; free-text favourite authors and hard-nos. Empty categories simply aren't sent to the AI.
- **Admin → Settings → Jobs → AI suggestions**: expandable job card with enabled toggle, cadence preset + custom interval, per-type suggestion caps (buy / read-next), taste-profile inclusion switch, per-user run rate limit with an "Unlimited" checkbox for local free providers, and `Run now` trigger.
- **Dashboard widgets** — "Read next from your library" and "Suggestions to buy" rows, each rendering a horizontal carousel of suggestion cards with cover, reasoning tooltip, and three actions (Interested / Open, Dismiss, Block with book / author scope). Action buttons are bottom-aligned so cards with shorter titles don't have their actions float mid-card. Widgets are hidden entirely when empty, so fresh installs stay clean.
- **`/suggestions`** full-list page with type filter tabs (All blends buy + read-next by add date, newest first), a user-scoped `Run now` button that respects the admin-configured daily rate limit, and an Osaurus provider configuration surface in `Connections → AI`.
- Helm chart at `deploy/helm/librarium-web` for self-hosted deployments.
- `en-CA` and `fr-FR` translations for all new AI-related surfaces.

## [26.4.0] — Initial independent release

First release of `librarium-web` as a standalone repository under the `YY.MM.revision` versioning scheme. Feature parity with the pre-split workspace as of April 2026 — see the archived workspace changelog for the full history up to this point.
