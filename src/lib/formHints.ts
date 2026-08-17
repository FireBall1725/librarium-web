// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

/**
 * Keep password managers off an input that is not a credential.
 *
 * They offer to fill any lone text field, and a field mentioning a name or an
 * email is the most likely to trigger it. `autoComplete="off"` does not stop
 * them; these three vendor attributes do, one each for 1Password, LastPass and
 * Bitwarden.
 *
 * Worth more than tidiness: 1Password's inline menu takes over the field, which
 * on this project blocked keyboard input to the shelf form entirely until the
 * page was reloaded.
 *
 * Spread onto the input: `<input className="lb-field" {...NO_AUTOFILL} />`.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
} as const
