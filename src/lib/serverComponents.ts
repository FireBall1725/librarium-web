// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// What the connected server is built from.
//
// GET /api/v1/components answers with the Go modules linked into that server's
// binary. It is fetched rather than compiled into this client because a client
// can be pointed at several Librarium instances on several versions, so a list
// baked in here would be right for at most one of them.

/** One Go module linked into the API binary. */
export interface ServerComponent {
  name: string
  version: string
  /** SPDX identifier, or empty when the server has no entry for the module. */
  licence: string
}

export interface ServerComponents {
  version: string
  components: ServerComponent[]
}

/**
 * Trim a Go pseudo-version down to something a person can read.
 *
 * A module with no tagged release reports as `v0.0.0-20240606120523-5a60cdf6a761`:
 * a fourteen-digit timestamp and twelve hex of commit hash. Left whole it is
 * wider than the module name beside it, so the name — the part anyone is
 * actually reading — was the half that got truncated away. The date answers
 * "how old is this" and the hash answers nothing usable from a settings page,
 * so the date is what stays. The full string goes in the title attribute.
 *
 * Go writes two shapes. A module never tagged reports `v0.0.0-<stamp>-<hash>`;
 * one tagged and then committed to reports `v1.0.1-0.<stamp>-<hash>`, with a
 * pre-release counter before the timestamp. The optional group carries that
 * counter through, since dropping it would turn a commit after v1.0.1 into
 * something that reads like v1.0.1 itself.
 *
 * Anything that is not a pseudo-version is returned untouched: the full
 * fourteen-digit stamp and twelve hex characters both have to be there, so a
 * pre-release that merely looks like a date is left alone.
 */
export function shortVersion(v: string): string {
  return v.replace(/-((?:\d+\.)?)(\d{8})\d{6}-[0-9a-f]{12}$/, '-$1$2')
}
