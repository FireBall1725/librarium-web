// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

/**
 * Turning a failed response body into something worth showing a person.
 *
 * The API answers a failure with `{"error": "invalid credentials"}`, so for a
 * long time reading `body.error` was enough. It is not, because the API is not
 * the only thing that can answer: an ingress, a reverse proxy or a CDN sitting
 * in front of it will happily replace the body on any non-2xx and never tell
 * the client it did.
 *
 * One such error-page service answers every 4xx and 5xx with
 *
 *   {"error": true, "code": 401, "message": "Unauthorized",
 *    "description": "The requested page needs a username and a password"}
 *
 * `body.error ?? fallback` then returns the boolean, because `??` only falls
 * back on null and undefined. That boolean reached `new Error(...)`, which
 * stringified it, and a failed login rendered the word "true" in a red box.
 *
 * So the rule here is narrow on purpose: a message is a non-empty string, and
 * anything else means the caller's own fallback. In particular this does NOT
 * scavenge `message` or `description` out of an unrecognised envelope. Those
 * fields are written to be read on an error page in a browser, and lifting them
 * into an app produces confident nonsense: telling someone who just mistyped a
 * password that "the requested page needs a username and a password" is worse
 * than a plain "Invalid username or password" that the caller supplies, because
 * it sounds specific while pointing at the wrong thing entirely.
 */
export function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const value = (body as Record<string, unknown>).error
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return fallback
}
