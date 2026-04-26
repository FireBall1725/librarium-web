# Security policy

## Reporting a vulnerability

**Please report security issues privately**, not via public issues.

Use GitHub's private vulnerability reporting on this repo:

→ https://github.com/fireball1725/librarium-web/security/advisories/new

That keeps the report visible only to maintainers until a fix is ready, and gives us a paper trail to coordinate disclosure on.

## What's in scope

Anything that lets an attacker:

- Read or modify another user's data when they're signed in
- Bypass authentication, the multi-server account boundary, or admin-only UI
- Inject script or markup that runs in another user's session (XSS in book titles, descriptions, reviews, library names, etc.)
- Smuggle data through CSV import preview, ISBN scan results, or cover URLs
- Leak tokens or session state to third-party origins

For server-side issues that the API is responsible for, file on [librarium-api](https://github.com/fireball1725/librarium-api/security/advisories/new) instead — this repo is the React client.

## Out of scope

- Self-XSS that requires the user to paste attacker-supplied JS into their own console
- Findings from automated scanners that aren't reproducible against a real deployment
- Issues only reproducible with browser extensions or modified clients

## Response

This is a small, self-hosted project run by a single maintainer. Best-effort response targets:

- **Acknowledgement**: within 1 week
- **Initial triage**: within 2 weeks
- **Fix or mitigation plan**: within 4 weeks for high-severity issues

We'll credit you in the release notes when the fix ships, unless you'd prefer to stay anonymous.
