// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Checks for a sign-in PIN before it is sent. The server is the authority and
// answers 400 for anything but 4 to 8 digits; this mirrors that rule so the
// form can say what is wrong without a round trip.

export const PIN_MIN = 4
export const PIN_MAX = 8

const PIN_PATTERN = /^[0-9]{4,8}$/

export type PinProblem = 'format' | 'mismatch'

export function isPin(pin: string): boolean {
  return PIN_PATTERN.test(pin)
}

// What is wrong with a PIN and its confirmation, or null when it can be sent.
// The format is checked first, so a short PIN typed twice reads as too short
// rather than as matching.
export function pinProblem(pin: string, confirm: string): PinProblem | null {
  if (!isPin(pin)) return 'format'
  if (pin !== confirm) return 'mismatch'
  return null
}
