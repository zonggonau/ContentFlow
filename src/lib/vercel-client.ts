/**
 * Vercel REST API Client
 * Handles deployments, custom domains, and DNS configuration for SaCMS AI Website Builder
 * Docs: https://vercel.com/docs/rest-api
 */

import { getPlatformSettings } from "./settings"
import { isMockAllowed, requireCredentialOutsideMock } from "./dev-mode"

const VERCEL_API_BASE = "https://api.vercel.com"

export async function getVercelToken(): Promise<string> {
  try {
    const settings = await getPlatformSettings()
    if (settings?.vercelAccessToken?.trim()) {
      return settings.vercelAccessToken.trim()
    }
  } catch {}
  return (process.env.VERCEL_ACCESS_TOKEN || process.env.VERCEL_API_TOKEN || "").trim()
}

async function getVercelHeaders() {
  const token = await getVercelToken()
  if (!token) throw new Error("VERCEL_ACCESS_TOKEN is not configured in settings or environment")
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  }
}

function getTeamQuery() {
  const teamId = process.env.VERCEL_TEAM_ID
  return teamId ? `?teamId=${teamId}` : ""
}

export interface VercelDeploymentFile {
  file: string
  data: string
  encoding?: "base64" | "utf-8"
}

export interface VercelDeploymentResult {
  id: string
  url: string
  state: string
  projectId?: string
  projectName?: string
  /** true when VERCEL_ACCESS_TOKEN isn't configured and this is a fabricated,
   *  non-functional result — callers MUST surface this, never present it as a
   *  real deployment. */
  simulated?: boolean
}

export interface VercelDomainResult {
  name: string
  cname?: string
  aValue?: string
  verified: boolean
  verificationRequired: boolean
  verificationRecords?: {
    type: string
    domain: string
    value: string
  }[]
  /** true when VERCEL_ACCESS_TOKEN isn't configured — see VercelDeploymentResult. */
  simulated?: boolean
}

/**
 * Create a deployment on Vercel from a set of files
 */
export async function deployToVercel(
  projectName: string,
  files: { name: string; content: string }[],
  envVars?: Record<string, string>
): Promise<VercelDeploymentResult> {
  const token = await getVercelToken()
  
  // Fallback for local dev without a token: fabricate a result so the flow is
  // exercisable end-to-end, but it MUST be flagged `simulated` — callers are
  // expected to reject/warn on this in any environment that isn't local dev,
  // rather than presenting it as a real deployment.
  if (!token) {
    if (!isMockAllowed("vercel", false)) requireCredentialOutsideMock("vercel", "VERCEL_ACCESS_TOKEN")
    console.warn("[Vercel Client] VERCEL_ACCESS_TOKEN not set in settings or env. Simulating instant deployment.")
    const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-")
    return {
      id: `dpl_${Date.now()}`,
      url: `https://${sanitizedName}.vercel.app`,
      state: "READY",
      projectId: `prj_${Date.now()}`,
      projectName: sanitizedName,
      simulated: true,
    }
  }

  const headers = await getVercelHeaders()

  const deployFiles: VercelDeploymentFile[] = files.map(f => ({
    file: f.name,
    data: f.content,
    encoding: "utf-8"
  }))

  const body: Record<string, any> = {
    name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    files: deployFiles,
    projectSettings: {
      framework: "nextjs",
    },
    target: "production"
  }

  if (envVars && Object.keys(envVars).length > 0) {
    body.env = envVars
  }

  const res = await fetch(`${VERCEL_API_BASE}/v13/deployments${getTeamQuery()}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(`Vercel deployment failed: ${error.error?.message || error.message || res.statusText}`)
  }

  const data = await res.json()
  // `data.url` is the unique per-deployment URL (the random-suffix hostname
  // like project-abc123-team.vercel.app) — Vercel's "Vercel Authentication"
  // deployment protection gates THAT hostname by default on every project
  // that has it enabled, even for a `target: "production"` deploy like this
  // one. `data.alias` is the assigned production alias (the clean
  // project.vercel.app domain, or a custom domain) that Vercel protection
  // leaves public by default — prefer it so the link we hand back is
  // actually viewable without a Vercel login.
  const publicUrl: string | undefined = Array.isArray(data.alias) ? data.alias[0] : undefined
  return {
    id: data.id,
    url: publicUrl ? `https://${publicUrl}` : (data.url ? `https://${data.url}` : ""),
    state: data.readyState || data.state || "BUILDING",
    projectId: data.projectId,
    projectName: data.name
  }
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(deploymentId: string): Promise<{ state: string; url: string; simulated?: boolean }> {
  const token = await getVercelToken()
  if (!token) {
    if (!isMockAllowed("vercel", false)) requireCredentialOutsideMock("vercel", "VERCEL_ACCESS_TOKEN")
    return { state: "READY", url: `https://sacms-site.vercel.app`, simulated: true }
  }

  const res = await fetch(`${VERCEL_API_BASE}/v13/deployments/${deploymentId}${getTeamQuery()}`, {
    headers: await getVercelHeaders()
  })

  if (!res.ok) throw new Error("Failed to get deployment status")
  const data = await res.json()
  return {
    state: data.readyState || data.state || "BUILDING",
    url: data.url ? `https://${data.url}` : ""
  }
}

/**
 * Whether the project's "Vercel Authentication" deployment protection is on
 * (and, if so, which deployment types it covers) — read-only, used to warn
 * the caller instead of guessing from a single deployment's response shape.
 */
export async function getVercelDeploymentProtectionStatus(
  projectId: string,
): Promise<{ protected: boolean; scope?: string } | null> {
  const token = await getVercelToken()
  if (!token) return null

  const res = await fetch(`${VERCEL_API_BASE}/v9/projects/${projectId}${getTeamQuery()}`, {
    headers: await getVercelHeaders(),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => ({}))
  const sso = data?.ssoProtection
  return { protected: !!sso, scope: sso?.deploymentType }
}

/**
 * Turn off Vercel's "Vercel Authentication" deployment protection for a
 * project, so its deployment URLs (including the per-deployment ones with a
 * random suffix, not just the production alias) are viewable by anyone with
 * the link — no Vercel login required. This is a project-wide, security-
 * relevant setting change, so it's only ever called when a caller explicitly
 * asks for it (the `make_vercel_deployment_public` MCP tool / dashboard
 * action) — never automatically on every deploy.
 */
export async function disableVercelDeploymentProtection(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getVercelToken()
  if (!token) {
    if (!isMockAllowed("vercel", false)) requireCredentialOutsideMock("vercel", "VERCEL_ACCESS_TOKEN")
    return { ok: true }
  }

  const res = await fetch(`${VERCEL_API_BASE}/v9/projects/${projectId}${getTeamQuery()}`, {
    method: "PATCH",
    headers: await getVercelHeaders(),
    // Clearing both known protection fields — Vercel's API has used
    // `ssoProtection` (Vercel Authentication) and, on some plans,
    // `passwordProtection` for the same "require login to view" behavior.
    body: JSON.stringify({ ssoProtection: null, passwordProtection: null }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error?.message || data.message || res.statusText }
  }
  return { ok: true }
}

export type VercelEnvTarget = "production" | "preview" | "development"

export interface VercelEnvResult {
  key: string
  targets: VercelEnvTarget[]
  type: "encrypted" | "plain" | "sensitive"
  created: boolean
  updated: boolean
  simulated?: boolean
}

/**
 * Create or update an environment variable on a Vercel project (upsert).
 * Secret values are stored `encrypted`; anything prefixed `NEXT_PUBLIC_` is
 * stored `plain` since it's exposed to the browser anyway.
 */
export async function upsertVercelProjectEnv(
  projectId: string,
  key: string,
  value: string,
  targets: VercelEnvTarget[] = ["production", "preview", "development"],
): Promise<VercelEnvResult> {
  const type: VercelEnvResult["type"] = key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted"
  const token = await getVercelToken()
  if (!token) {
    if (!isMockAllowed("vercel", false)) requireCredentialOutsideMock("vercel", "VERCEL_ACCESS_TOKEN")
    return { key, targets, type, created: true, updated: false, simulated: true }
  }

  const res = await fetch(
    `${VERCEL_API_BASE}/v10/projects/${projectId}/env${getTeamQuery() ? `${getTeamQuery()}&upsert=true` : "?upsert=true"}`,
    {
      method: "POST",
      headers: await getVercelHeaders(),
      body: JSON.stringify({ key, value, type, target: targets }),
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Failed to set Vercel env "${key}": ${data.error?.message || data.message || res.statusText}`)
  }

  const created = data?.created?.key === key || data?.key === key
  return { key, targets, type, created: !!created, updated: !created }
}

/**
 * Add a custom domain to a Vercel project
 */
export async function addDomainToProject(
  projectId: string,
  domain: string
): Promise<VercelDomainResult> {
  const token = await getVercelToken()
  if (!token) {
    if (!isMockAllowed("vercel", false)) requireCredentialOutsideMock("vercel", "VERCEL_ACCESS_TOKEN")
    return {
      name: domain,
      verified: true,
      verificationRequired: false,
      verificationRecords: [],
      simulated: true,
    }
  }

  const res = await fetch(`${VERCEL_API_BASE}/v10/projects/${projectId}/domains${getTeamQuery()}`, {
    method: "POST",
    headers: await getVercelHeaders(),
    body: JSON.stringify({ name: domain })
  })

  const data = await res.json()

  if (!res.ok && res.status !== 409) {
    throw new Error(`Failed to add domain: ${data.error?.message || data.message || res.statusText}`)
  }

  return {
    name: domain,
    verified: data.verified ?? false,
    verificationRequired: !!(data.verification && data.verification.length > 0),
    verificationRecords: data.verification?.map((v: any) => ({
      type: v.type,
      domain: v.domain,
      value: v.value
    })) || []
  }
}

/**
 * Get the recommended DNS configuration for a domain
 */
export async function getDomainConfig(domain: string): Promise<{
  cname?: string
  aRecord?: string
  configured: boolean
  simulated?: boolean
  /** Set when the Vercel API call itself failed (bad token, rate limit,
   *  5xx, etc.) — `configured: false` in that case does NOT mean the
   *  domain's DNS is actually misconfigured, it means we couldn't check.
   *  Callers MUST surface this distinctly rather than telling the user
   *  their DNS is wrong when it's really our API call that failed. */
  error?: string
}> {
  const token = await getVercelToken()
  if (!token) {
    if (!isMockAllowed("vercel", false)) requireCredentialOutsideMock("vercel", "VERCEL_ACCESS_TOKEN")
    return { cname: "cname.vercel-dns.com", aRecord: "76.76.21.21", configured: true, simulated: true }
  }

  const res = await fetch(`${VERCEL_API_BASE}/v6/domains/${domain}/config${getTeamQuery()}`, {
    headers: await getVercelHeaders()
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }))
    return {
      configured: false,
      error: `Failed to check domain configuration with Vercel: ${errBody.error?.message || errBody.message || res.statusText}`,
    }
  }

  const data = await res.json()
  return {
    cname: data.cnames?.[0] || data.recommendedCNAME?.[0]?.value || "cname.vercel-dns.com",
    aRecord: data.aValues?.[0] || data.recommendedIPv4?.[0]?.value?.[0] || "76.76.21.21",
    configured: data.misconfigured === false
  }
}

/**
 * List all projects on Vercel account
 */
export async function listVercelProjects(): Promise<{ id: string; name: string; url: string }[]> {
  const token = await getVercelToken()
  if (!token) return []

  const res = await fetch(`${VERCEL_API_BASE}/v9/projects?limit=20${getTeamQuery().replace("?", "&")}`, {
    headers: await getVercelHeaders()
  })

  if (!res.ok) return []
  const data = await res.json()
  return (data.projects || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    url: p.alias?.[0]?.domain ? `https://${p.alias[0].domain}` : ""
  }))
}

export function isVercelConfigured(): Promise<boolean> {
  return getVercelToken().then((t) => Boolean(t))
}

export interface VercelProjectSummary {
  id: string
  name: string
  framework: string | null
  nodeVersion: string | null
  url: string
  latestDeploymentState: string | null
  latestDeploymentUrl: string | null
  latestDeploymentAt: number | null
  createdAt: number | null
  gitRepo: string | null
}

/**
 * Richer project listing for the admin infrastructure dashboard's "Vercel
 * Hosting" tab — every project on the account/team, with its latest
 * production deployment state. Read-only; returns [] (never throws) when no
 * Vercel token is configured or the API call fails.
 */
export async function listVercelProjectsDetailed(): Promise<VercelProjectSummary[]> {
  const token = await getVercelToken()
  if (!token) return []

  try {
    const headers = await getVercelHeaders()
    const teamParam = getTeamQuery().replace("?", "&")
    const out: VercelProjectSummary[] = []
    let until: string | undefined
    let guard = 0

    while (guard < 20) {
      guard += 1
      const pageParam = until ? `&until=${until}` : ""
      const res = await fetch(
        `${VERCEL_API_BASE}/v9/projects?limit=100${teamParam}${pageParam}`,
        { headers },
      )
      if (!res.ok) {
        console.warn(`[Vercel Client] listVercelProjectsDetailed failed (${res.status})`)
        break
      }
      const data = await res.json()
      for (const p of data.projects || []) {
        const latest = p.latestDeployments?.[0] || p.targets?.production || null
        out.push({
          id: p.id,
          name: p.name,
          framework: p.framework ?? null,
          nodeVersion: p.nodeVersion ?? null,
          url: p.alias?.[0]?.domain
            ? `https://${p.alias[0].domain}`
            : latest?.url
              ? `https://${latest.url}`
              : "",
          latestDeploymentState: latest?.readyState || latest?.state || null,
          latestDeploymentUrl: latest?.url ? `https://${latest.url}` : null,
          latestDeploymentAt: latest?.createdAt ?? latest?.buildingAt ?? null,
          createdAt: p.createdAt ?? null,
          gitRepo: p.link?.repo
            ? `${p.link.org || p.link.owner || ""}/${p.link.repo}`.replace(/^\//, "")
            : null,
        })
      }
      const next = data.pagination?.next
      if (!next) break
      until = String(next)
    }

    return out
  } catch (err: any) {
    console.warn("[Vercel Client] listVercelProjectsDetailed error:", err?.message || err)
    return []
  }
}
