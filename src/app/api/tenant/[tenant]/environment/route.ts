import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { withStaffAuth, apiError } from "@/lib/api/route-helpers"
import { roleHasPermission, PERMISSIONS } from "@/lib/rbac/staff"
import { logAudit, AuditAction } from "@/lib/audit-log"

/**
 * Custom environment variables that get merged into the Vercel build for
 * this tenant's frontend (on top of the fixed SACMS_* vars the deploy route
 * always injects). Stored as one JSON Setting row per tenant.
 *
 * GET  → { systemVars: [{key, note}], customVars: [{key, value}] }
 * PUT  → { vars: [{key, value}] }  replaces the whole custom set
 */

const SETTING_KEY = (tenantId: string) => `${tenantId}_frontend_env_vars`

const KEY_RE = /^[A-Z_][A-Z0-9_]*$/

const SYSTEM_VARS = [
  { key: "NEXT_PUBLIC_SACMS_API_URL", note: "URL API SaCMS — di-set otomatis saat deploy" },
  { key: "NEXT_PUBLIC_SACMS_TENANT", note: "Slug workspace — di-set otomatis saat deploy" },
  { key: "SACMS_API_KEY", note: "API key headless — di-generate & di-set otomatis saat deploy" },
]

export const GET = withStaffAuth(async (_req, _context, { access }) => {
  if (!roleHasPermission(access.role, PERMISSIONS.SETTING_UPDATE)) {
    return apiError("forbidden", { message: "Missing settings.update permission" })
  }
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY(access.tenantId) } })
  let customVars: { key: string; value: string }[] = []
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value)
      if (Array.isArray(parsed)) customVars = parsed.filter((v) => v && typeof v.key === "string")
    } catch {
      /* ignore malformed */
    }
  }
  return NextResponse.json({ systemVars: SYSTEM_VARS, customVars })
})

export const PUT = withStaffAuth(async (req, _context, { access, session }) => {
  if (!roleHasPermission(access.role, PERMISSIONS.SETTING_UPDATE)) {
    return apiError("forbidden", { message: "Missing settings.update permission" })
  }
  const body = await req.json().catch(() => ({}))
  const rawVars: unknown = body.vars
  if (!Array.isArray(rawVars)) return apiError("validation", { message: "`vars` harus array." })

  const seen = new Set<string>()
  const vars: { key: string; value: string }[] = []
  for (const v of rawVars as any[]) {
    const key = String(v?.key ?? "").trim()
    const value = String(v?.value ?? "")
    if (!key) continue
    if (!KEY_RE.test(key)) {
      return apiError("validation", { message: `Nama variabel tidak valid: "${key}". Gunakan HURUF_BESAR dan _.` })
    }
    if (SYSTEM_VARS.some((s) => s.key === key)) {
      return apiError("validation", { message: `"${key}" adalah variabel sistem dan tidak bisa ditimpa.` })
    }
    if (seen.has(key)) continue
    seen.add(key)
    vars.push({ key, value })
  }
  if (vars.length > 50) return apiError("validation", { message: "Maksimal 50 variabel." })

  await db.setting.upsert({
    where: { key: SETTING_KEY(access.tenantId) },
    update: { value: JSON.stringify(vars) },
    create: { key: SETTING_KEY(access.tenantId), tenantId: access.tenantId, value: JSON.stringify(vars) },
  })

  logAudit({
    tenantId: access.tenantId,
    userId: session.user.id,
    action: AuditAction.SETTINGS_UPDATED,
    entity: "FrontendEnvVars",
    entityId: access.tenantId,
    data: { count: vars.length, keys: vars.map((v) => v.key) },
  })

  return NextResponse.json({ success: true, customVars: vars })
})

/** Shared by the deploy route to merge stored custom vars into the build. */
export async function getTenantCustomEnvVars(tenantId: string): Promise<Record<string, string>> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY(tenantId) } })
  if (!row?.value) return {}
  try {
    const parsed = JSON.parse(row.value)
    if (!Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const v of parsed) {
      if (v && typeof v.key === "string" && KEY_RE.test(v.key)) out[v.key] = String(v.value ?? "")
    }
    return out
  } catch {
    return {}
  }
}
