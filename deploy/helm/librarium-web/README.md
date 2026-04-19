# librarium-web Helm chart

Helm chart for deploying [librarium-web](https://github.com/fireball1725/librarium-web) to Kubernetes.

Built on top of [firelabs-helm-common](https://github.com/FireBall1725/firelabs-helm-common) (a k8s-at-home library-chart fork). Companion to [`librarium-api`](https://github.com/fireball1725/librarium-api).

## Prerequisites

- Kubernetes 1.25+
- Helm 3.8+
- An already-deployed `librarium-api` reachable at `http://librarium-api:8080` in the same namespace

## Install

```bash
cd deploy/helm/librarium-web

# Fetch the common library chart
helm dependency update

# Install into the same namespace as librarium-api
helm install librarium-web . \
  --namespace librarium
```

Once the pod is ready, port-forward or set up ingress:

```bash
kubectl -n librarium port-forward svc/librarium-web 3000:3000
# then open http://localhost:3000
```

## Upgrade

```bash
# Bump the image tag
helm upgrade librarium-web . \
  --namespace librarium --reuse-values \
  --set image.tag=26.4.1
```

## Uninstall

```bash
helm uninstall librarium-web -n librarium
```

The web tier has no PVCs or Secrets — uninstall is clean.

## Configuration

Most of the schema comes from [firelabs-helm-common](https://github.com/FireBall1725/firelabs-helm-common/blob/main/values.yaml). The librarium-specific knobs:

### Image

| Key | Default | Notes |
|---|---|---|
| `image.repository` | `ghcr.io/fireball1725/librarium-web` | |
| `image.tag` | `latest` | Pin in production. |
| `image.pullPolicy` | `IfNotPresent` | |

### Namespace requirement

The image's bundled `nginx.conf` proxies `/api` and `/health` to `http://librarium-api:8080` by bare service name. That short name only resolves inside the same namespace as `librarium-api`, so both releases **must** share a namespace.

If you need to split namespaces, build a custom image with an `nginx.conf` that points at the fully-qualified service name (e.g. `librarium-api.other-ns.svc.cluster.local`).

### Replicas

The web tier is stateless static nginx — safe to scale horizontally:

```yaml
controller:
  replicas: 3
  strategy: RollingUpdate
```

### Ingress

Disabled by default. Enable and point at your controller:

```yaml
ingress:
  main:
    enabled: true
    ingressClassName: nginx
    hosts:
      - host: librarium.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: librarium-web-tls
        hosts: [librarium.example.com]
```

### Resources

Defaults are light (25m CPU request, 32Mi/128Mi memory) since the pod only serves static files through nginx.

## Chart vs. raw manifests

The raw manifests under [`../kubernetes/`](../kubernetes/) are equivalent for a simple deployment. Use this chart when you want templating or reusable values across environments.
