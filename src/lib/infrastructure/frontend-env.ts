import { db } from "@/lib/database"
import { randomBytes } from "crypto"

/**
 * The environment a deployed SaCMS frontend needs — nothing more than what
 * it takes to talk to the SaCMS API (base URL, tenant slug, service token)
 * plus whatever custom vars the workspace added on the Environment tab.
 *
 * This is the single source of truth used by every deploy path (the
 * dashboard deploy route, the `deploy_to_vercel` MCP tool, and the Contabo
 * VPS deployer) so the frontend's `.env` is assembled the same way whether
 * it ships to Vercel or to a dedicated VPS.
 */

/** Setting row (one JSON array per tenant) holding the user's custom vars. */
export const FRONTEND_ENV_SETTING_KEY = (tenantId: string) => `${tenantId}_frontend_env_vars`

/** Valid POSIX-ish env var name. */
export const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/

/** Fixed vars injected on every deploy; may not be overridden by custom vars. */
export const SYSTEM_ENV_VARS = [
  { key: "NEXT_PUBLIC_SACMS_API_URL", note: "URL API SaCMS — di-set otomatis saat deploy" },
  { key: "NEXT_PUBLIC_SACMS_TENANT", note: "Slug workspace — di-set otomatis saat deploy" },
  { key: "SACMS_API_KEY", note: "API key headless — di-generate & di-set otomatis saat deploy" },
] as const

export const RESERVED_ENV_KEYS = SYSTEM_ENV_VARS.map((v) => v.key) as string[]

export interface EnvVar {
  key: string
  value: string
}

/** Read the workspace's custom env vars from its Setting row. */
export async function getTenantCustomEnvVars(tenantId: string): Promise<Record<string, string>> {
  const row = await db.setting.findUnique({ where: { key: FRONTEND_ENV_SETTING_KEY(tenantId) } })
  return parseEnvSetting(row?.value)
}

export async function getTenantCustomEnvVarList(tenantId: string): Promise<EnvVar[]> {
  const row = await db.setting.findUnique({ where: { key: FRONTEND_ENV_SETTING_KEY(tenantId) } })
  const map = parseEnvSetting(row?.value)
  return Object.entries(map).map(([key, value]) => ({ key, value }))
}

/** Replace the whole custom set. Caller is responsible for validation. */
export async function setTenantCustomEnvVars(tenantId: string, vars: EnvVar[]): Promise<void> {
  await db.setting.upsert({
    where: { key: FRONTEND_ENV_SETTING_KEY(tenantId) },
    update: { value: JSON.stringify(vars) },
    create: { key: FRONTEND_ENV_SETTING_KEY(tenantId), tenantId, value: JSON.stringify(vars) },
  })
}

/** Merge/overwrite a single var into the stored set. */
export async function upsertTenantCustomEnvVar(tenantId: string, key: string, value: string): Promise<void> {
  const list = await getTenantCustomEnvVarList(tenantId)
  const idx = list.findIndex((v) => v.key === key)
  if (idx >= 0) list[idx].value = value
  else list.push({ key, value })
  await setTenantCustomEnvVars(tenantId, list)
}

function parseEnvSetting(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const v of parsed) {
      if (v && typeof v.key === "string" && ENV_KEY_RE.test(v.key) && !RESERVED_ENV_KEYS.includes(v.key)) {
        out[v.key] = String(v.value ?? "")
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Get-or-create the dedicated service token a deployed frontend uses to
 *  authenticate against this workspace's SaCMS API. */
export async function getFrontendDeployToken(tenantId: string, tenantSlug: string): Promise<string> {
  const name = `Vercel Site (${tenantSlug})`
  let rec = await db.apiToken.findFirst({ where: { tenantId, name } })
  if (!rec) {
    rec = await db.apiToken.create({
      data: {
        tenantId,
        name,
        token: `sacms_live_${randomBytes(24).toString("hex")}`,
        type: "service",
        permissions: ["read", "write"],
      },
    })
  }
  return rec.token
}

/**
 * The complete env set for a deployed frontend: the workspace's custom vars
 * plus the three fixed SACMS_* connection vars (which always win).
 */
export async function resolveFrontendEnv(
  tenantId: string,
  tenantSlug: string,
  apiOrigin: string,
): Promise<Record<string, string>> {
  const custom = await getTenantCustomEnvVars(tenantId).catch(() => ({}))
  const token = await getFrontendDeployToken(tenantId, tenantSlug)
  return {
    ...custom,
    NEXT_PUBLIC_SACMS_API_URL: apiOrigin.replace(/\/$/, ""),
    NEXT_PUBLIC_SACMS_TENANT: tenantSlug,
    SACMS_API_KEY: token,
  }
}

/** Render an env record as `.env` file content. */
export function renderDotEnv(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${/[\s"'#\n]/.test(v) ? JSON.stringify(v) : v}`)
      .join("\n") + "\n"
  )
}

/**
 * Persist every env var onto the Vercel project itself (upsert), so a
 * redeploy triggered from Vercel's own dashboard still has them — not just
 * the one deployment SaCMS pushed.
 */
export async function pushEnvToVercelProject(
  projectId: string,
  env: Record<string, string>,
): Promise<{ applied: string[]; failed: { key: string; error: string }[] }> {
  const { upsertVercelProjectEnv } = await import("@/lib/vercel-client")
  const applied: string[] = []
  const failed: { key: string; error: string }[] = []
  for (const [key, value] of Object.entries(env)) {
    try {
      await upsertVercelProjectEnv(projectId, key, value)
      applied.push(key)
    } catch (e: any) {
      failed.push({ key, error: e?.message || "unknown error" })
    }
  }
  return { applied, failed }
}
