# librarium-web

The web client for **[Librarium](https://librarium.press)** — a self-hosted, privacy-focused tracker for your physical book, manga, and comic collection. A self-hosted alternative to Libib and similar cloud catalog services.

React 19 · TypeScript · Vite · Tailwind CSS v4 · TanStack Query. Talks to [`librarium-api`](https://github.com/fireball1725/librarium-api) over HTTP.

> ⚠︎ **Early beta.** Things are changing fast, some edges are rough, and self-hosters should expect to read release notes before upgrading.

Part of the Librarium stack:

| Repo                                                                              | Role                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`librarium`](https://github.com/fireball1725/librarium)                          | Marketing site at [librarium.press](https://librarium.press), planning docs |
| [`librarium-api`](https://github.com/fireball1725/librarium-api)                  | Backend · Go · Postgres · River jobs                                       |
| [`librarium-web`](https://github.com/fireball1725/librarium-web) ← **you are here** | Web client · React · TypeScript · Tailwind · Vite                        |
| [`librarium-ios`](https://github.com/fireball1725/librarium-ios)                  | Native iOS client · SwiftUI · iOS 26+ (TestFlight)                         |
| [`librarium-mcp`](https://github.com/fireball1725/librarium-mcp)                  | MCP server · Go · chat with your library from Claude / Cursor / etc.       |

## Quickstart

```bash
npm ci
npm run dev
```

Dev server runs on `:5173` by default. Point it at a running API with `VITE_API_BASE_URL` (see `.env.example`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | TypeScript check + production build into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |

## Deployment

### Docker Compose (whole stack — recommended)

To self-host the full Librarium stack (api + web + postgres), use the compose file in the api repo. It pulls published images from GHCR and wires everything up correctly:

👉 **[`librarium-api/deploy/docker-compose/`](https://github.com/fireball1725/librarium-api/tree/main/deploy/docker-compose)** — see the [api repo's deployment docs](https://github.com/fireball1725/librarium-api#deployment) for setup.

Running `librarium-web` on its own isn't useful — it's a static bundle that needs an API to talk to.

### Kubernetes

Manifests for the web service live in [`deploy/kubernetes/`](./deploy/kubernetes/). They assume `librarium-api` is already deployed in the same namespace — start with the [api repo's k8s manifests](https://github.com/fireball1725/librarium-api/tree/main/deploy/kubernetes), then apply the web manifests.

See [`deploy/kubernetes/README.md`](./deploy/kubernetes/README.md) for the walkthrough.

### Docker (web only, advanced)

If you already have the API running elsewhere and just want to build the web image locally:

```bash
docker build -t librarium-web .
docker run -p 3000:3000 librarium-web
```

You'll need to override `nginx.conf` (or rebuild the image with a patched one) so `/api` proxies to your API host instead of the default `http://librarium-api:8080`.

## Versioning

Format: **`YY.MM.revision`** (e.g. `26.4.0`).

- `YY` — two-digit release year.
- `MM` — release month, *not* zero-padded (`26.4`, not `26.04`).
- `revision` — feature counter within the month, starting at `0`. Resets to `0` when the month rolls over.
- `-dev` suffix — local, unshipped builds. Never used for released artifacts.

Release history in [CHANGELOG.md](./CHANGELOG.md).

## Releasing

Releases are cut from `main` via the `release` GitHub Actions workflow (`workflow_dispatch`). It:

1. Computes the next `YY.MM.revision` from the latest tag.
2. Updates `package.json` + `package-lock.json`, commits `release: <version>`, tags `v<version>`.
3. Builds a multi-arch Docker image and pushes it to `ghcr.io/fireball1725/librarium-web:<version>` and `:latest`.
4. Bumps `package.json` to the next `-dev` revision, commits, pushes.
5. Creates a GitHub Release with auto-generated notes.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). PRs must sign off on the [Developer Certificate of Origin](./DCO) (`git commit -s`) — a CI check enforces this.

## License

AGPL-3.0-only. See [LICENSE](./LICENSE) for the full text.
