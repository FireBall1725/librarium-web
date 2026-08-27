/**
 * Where this app is mounted.
 *
 * A server hosting several apps behind one hostname puts each on a path rather
 * than a port, so Librarium has to be able to live at `/librarium/` instead of
 * at the root. Vite's own `base` is a build-time setting, and baking the path
 * into the bundle would mean a different image per deployment — which is the
 * opposite of what a container is for. So the path arrives at runtime: the
 * entrypoint writes it into `index.html` before nginx starts, and everything
 * that builds a URL reads it from here.
 *
 * Empty is the ordinary case and means mounted at the root.
 */
declare global {
  interface Window {
    __LIBRARIUM_BASE_PATH__?: string
  }
}

/**
 * Normalised to either `''` or `/segment`, with a leading slash and no
 * trailing one, whatever shape the operator wrote it in. `librarium`,
 * `/librarium` and `/librarium/` all mean the same deployment, and an env var
 * somebody types by hand will eventually be all three.
 */
export function normaliseBasePath(raw: string | undefined | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  // The placeholder, when the entrypoint did not run: a bundle opened straight
  // from `dist/` or served by something that is not our image. Mounted at the
  // root is the right guess, and it is what every deployment before this
  // existed did.
  if (!trimmed || trimmed.startsWith('%%')) return ''
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const withoutTrailing = withLeading.replace(/\/+$/, '')
  return withoutTrailing === '' ? '' : withoutTrailing
}

export const basePath = normaliseBasePath(
  typeof window === 'undefined' ? '' : window.__LIBRARIUM_BASE_PATH__,
)

/**
 * Prefixes a root-relative path with the mount point.
 *
 * Only for URLs that leave the app: requests and image sources. Router paths
 * go through React Router's `basename`, which does the same job for links and
 * would double up if these were applied on top of it.
 */
export function withBase(path: string, base: string = basePath): string {
  if (!base) return path
  // Anything already absolute belongs to somebody else. Cover URLs from a
  // provider are fully qualified, and prefixing one would point it at this
  // host.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path
  if (!path.startsWith('/')) return path
  // Already prefixed. `withBase` is applied at the few places a URL is built,
  // and a value that has been through one of them can reach another.
  if (path === base || path.startsWith(`${base}/`)) return path
  return `${base}${path}`
}
