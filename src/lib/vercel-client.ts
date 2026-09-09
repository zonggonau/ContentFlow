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
  return {
    id: data.id,
    url: data.url ? `https://${data.url}` : "",
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
