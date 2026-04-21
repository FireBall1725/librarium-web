# librarium-web

The web client for [Librarium](https://github.com/fireball1725) — a self-hosted personal library tracker.

React 19 · TypeScript · Vite · Tailwind CSS v4 · TanStack Query.

Talks to [`librarium-api`](https://github.com/fireball1725/librarium-api) over HTTP.

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

If you already have the API running elsewhere and just want to run the web image:

```bash
docker build -t librarium-web .
docker run -p 3000:3000 -e API_UPSTREAM=my-api.internal -e API_UPSTREAM_PORT=8080 librarium-web
```

The container's nginx config is generated from [`nginx.conf.template`](./nginx.conf.template) at boot (via nginx's built-in envsubst). Set `API_UPSTREAM` and `API_UPSTREAM_PORT` to point `/api` at your API host. Defaults are `librarium-api` and `8080`, matching the full-stack Docker Compose deployment.

### Railway (managed PaaS)

The repo ships a `railway.toml` so Railway builds with the right Dockerfile. Deploy it alongside [`librarium-api`](https://github.com/FireBall1725/librarium-api) in the same Railway project and set `API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}` on the web service. Full walkthrough: [`librarium-api/deploy/railway/`](https://github.com/fireball1725/librarium-api/tree/main/deploy/railway).

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
