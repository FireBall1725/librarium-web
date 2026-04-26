# Contributing to librarium-web

Thanks for your interest in contributing. This document covers how to submit changes, what's expected in a PR, and the legal terms your contribution is made under.

## Before you start

- Check the open issues — your change may already be in progress or planned differently.
- For anything non-trivial, open an issue to discuss before writing code.
- Business logic belongs in [`librarium-api`](https://github.com/fireball1725/librarium-api), not here. This repo consumes the API; it doesn't reimplement it.
- Self-hosted is the primary deployment target. Don't introduce features that only work in a cloud-hosted context.

## Development setup

```bash
git clone https://github.com/fireball1725/librarium-web.git
cd librarium-web
npm ci
npm run dev
```

You'll need Node.js 22+. Point `VITE_API_BASE_URL` at a running [`librarium-api`](https://github.com/fireball1725/librarium-api).

## Making changes

- Keep changes focused. One PR = one feature/fix.
- Run `npm run lint` and `npm run build` before submitting.
- Prefer the existing design primitives (Tailwind v4 utility classes + shared components in `src/components/`) over introducing a new UI kit.
- For server data, use `callApi` from the auth context — it handles auth, refresh, and the `{data: ...}` envelope. Don't reach for separate fetching libraries.

## Commit messages

Short, imperative, reference the scope: `feat(shelf): inline edit for book titles`, `fix(auth): redirect to login on 401`, `chore(deps): bump vite to 6.2`.

## Pull requests

- Rebase on `main` before opening the PR.
- The PR description should explain the *why*, not just the *what* — link to the issue if there is one.
- CI must pass before review.
- Don't hand-edit a `CHANGELOG.md` — release notes are auto-generated from PR titles by the release workflow. Write a clear, descriptive title.

## License

The project is licensed under the **GNU Affero General Public License v3.0 only** ([LICENSE](./LICENSE)). Contributions are accepted under the same license — nothing is assigned to the maintainer and no separate commercial-relicensing grant is involved.

## Sign your commits (DCO)

Every commit in a pull request must carry a `Signed-off-by:` trailer certifying the [Developer Certificate of Origin 1.1](./DCO). It says you have the right to contribute the code and you're fine with it being distributed under the project's license.

To sign off, just pass `-s` to `git commit`:

```bash
git commit -s -m "feat(shelf): inline edit for book titles"
```

That appends a line like this to the commit message, using your `user.name` and `user.email` from git config:

```
Signed-off-by: Jane Contributor <jane@example.com>
```

If you forget on one commit, amend it:

```bash
git commit --amend -s --no-edit
```

If you forget on several, rebase with `--signoff`:

```bash
git rebase --signoff main
```

The [DCO GitHub App](https://github.com/apps/dco) runs on every PR and blocks the merge if any commit is missing a sign-off.

## Code of conduct

Be decent. Assume good faith. Technical disagreements are fine; personal attacks aren't.
