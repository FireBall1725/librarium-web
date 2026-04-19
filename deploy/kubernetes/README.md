# Deploying librarium-web to Kubernetes

Minimal manifests to run the `librarium-web` static nginx bundle in Kubernetes. They assume the API is already deployed in the same namespace — if you haven't deployed the API yet, start here: [librarium-api/deploy/kubernetes](https://github.com/fireball1725/librarium-api/tree/main/deploy/kubernetes).

## What's in the box

| File | Purpose |
|---|---|
| `10-web.yaml` | Web Deployment + ClusterIP Service on :3000 |
| `20-ingress.example.yaml` | Example ingress that fronts the web service (which also proxies `/api` to the API internally) |

## Prerequisites

- `librarium-api` is already deployed in the `librarium` namespace with the service named `librarium-api` on port 8080 (matches the nginx config baked into the web image).
- An ingress controller if you want to expose the UI outside the cluster.

## Quickstart

```bash
kubectl apply -f 10-web.yaml

# (Optional) ingress — edit the host and TLS secret first
cp 20-ingress.example.yaml 20-ingress.yaml
# edit: spec.rules[0].host, tls.hosts, ingressClassName
kubectl apply -f 20-ingress.yaml
```

Then open the ingress host (or `kubectl port-forward -n librarium svc/librarium-web 3000:3000` and visit http://localhost:3000).

## Deploying in a different namespace

The image's bundled nginx.conf proxies `/api` to `http://librarium-api:8080`. If you deploy the api and web in **different namespaces**, DNS won't resolve the short name — you'll need to either:

- Redeploy the api into the same namespace as web (simplest).
- Override the nginx config via a ConfigMap mount that points at the fully-qualified service name (e.g. `librarium-api.<api-namespace>.svc.cluster.local`).

## Image tags

`10-web.yaml` uses `ghcr.io/fireball1725/librarium-web:latest`. **Pin to a specific release** (e.g. `:26.4.0`) in production.

## Upgrading

```bash
kubectl set image deploy/librarium-web librarium-web=ghcr.io/fireball1725/librarium-web:26.4.1 -n librarium
kubectl rollout status deploy/librarium-web -n librarium
```
