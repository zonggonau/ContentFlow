/**
 * Central policy for "should this paid/external service be mocked?"
 *
 * Every integration in SaCMS that depends on a paid third-party service
 * (Midtrans, Vercel, v0.dev, Contabo, Cloudflare R2) should gate its mock
 * fallback through `shouldUseMockServices()` / `isMockAllowed()` rather than
 * inventing its own ad-hoc check. Before this module existed, each client
 * decided independently whether to simulate — several (Vercel, Contabo,
 * v0.dev) only checked "is the API key missing?" with no regard for
 * NODE_ENV, which meant a misconfigured production deployment (env var
 * typo'd or simply forgotten) would silently start fabricating successful
 * deployments/VPS provisions instead of failing loudly. Others (Midtrans,
 * R2) had no fallback at all, so the full payment/storage test matrix
 * could never run without real, billable credentials.
 *
 * The rule enforced here:
 *   - In `production`, mocking is NEVER allowed, even if a credential is
 *     missing — the real call is attempted and its real error surfaces.
 *     A production deployment must fail loudly on a missing key, not
 *     quietly pretend to succeed.
 *   - In every other NODE_ENV (`development`, `test`, or unset), mocking
 *     is allowed whenever the real credential for that specific service
 *     is absent — so local development and the automated test suite never
 *     require a live, paid subscription to exercise these flows end to
 *     end, but a developer who DOES set real sandbox/test credentials
 *     locally still exercises the real integration.
 */

export type MockableService =
  | "midtrans"
  | "vercel"
  | "v0"
  | "contabo"
  | "r2"

/** True outside of `production` — covers local dev (`next dev`) and the
 *  automated test suite (Vitest sets `NODE_ENV=test`) alike. */
export function isNonProduction(): boolean {
  return process.env.NODE_ENV !== "production"
}

/**
 * Whether a mock fallback may be used for `service` right now, given
 * whether its real credential (`hasCredential`) is configured.
 *
 * Always call this — passing the actual presence/absence of the real
 * credential — rather than checking `!credential` on its own, so the
 * NODE_ENV guard is never accidentally skipped.
 */
export function isMockAllowed(service: MockableService, hasCredential: boolean): boolean {
  if (hasCredential) return false
  return isNonProduction()
}

/**
 * Throws a clear, consistent error for the case a mock is NOT allowed
 * (i.e. production with no credential) so every integration reports the
 * same kind of failure instead of a provider-specific stack trace deep
 * inside a third-party SDK.
 */
export function requireCredentialOutsideMock(service: MockableService, envVarHint: string): never {
  throw new Error(
    `[${service}] No credential configured and mocking is disabled in production. ` +
    `Set ${envVarHint} (via Platform Settings or the environment) before using this feature in production.`
  )
}
