// Waits for the end-to-end stack's API to answer.
//
// Not a container healthcheck: the API image is distroless, so there is no
// shell and no wget for one to run. Compose would report the container healthy
// or unhealthy on the strength of a command that cannot exist, which is how a
// healthcheck that never worked went unnoticed locally and failed only in CI.
const url = `${process.env.E2E_API_URL ?? 'http://localhost:8090'}/health`
const deadline = Date.now() + 90_000

while (Date.now() < deadline) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) })
    if (res.ok) {
      const body = await res.json()
      console.log(`api ready: ${body.status} ${body.version ?? ''}`.trim())
      process.exit(0)
    }
  } catch {
    // Not up yet. The loop is the retry.
  }
  await new Promise(r => setTimeout(r, 1_000))
}

console.error(`api did not answer ${url} within 90s`)
process.exit(1)
