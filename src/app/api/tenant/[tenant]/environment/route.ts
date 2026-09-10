import { NextResponse } from "next/server"
import { withStaffAuth, apiError } from "@/lib/api/route-helpers"
import { roleHasPermission, PERMISSIONS } from "@/lib/rbac/staff"
import { logAudit, AuditAction } from "@/lib/audit-log"
import {
  ENV_KEY_RE,
  RESERVED_ENV_KEYS,
  SYSTEM_ENV_VARS,
  getTenantCustomEnvVarList,
  setTenantCustomEnvVars,
  type EnvVar,
} from "@/lib/infrastructure/frontend-env"

/**
 * Custom environment variables merged into every deploy of this tenant's
 * frontend (Vercel project env + a `.env` file on a dedicated VPS), on top
 * of the fixed SACMS_* connection vars. Stored as one JSON Setting row.
 *
 * GET → { systemVars, customVars }
 * PUT → { vars: [{key,value}] }  replaces the whole custom set
 */

export const GET = withStaffAuth(async (_req, _context, { access }) => {
  if (!roleHasPermission(access.role, PERMISSIONS.SETTING_UPDATE)) {
    return apiError("forbidden", { message: "Missing settings.update permission" })
  }
  const customVars = await getTenantCustomEnvVarList(access.tenantId)
  return NextResponse.json({ systemVars: SYSTEM_ENV_VARS, customVars })
})

export const PUT = withStaffAuth(async (req, _context, { access, session }) => {
  if (!roleHasPermission(access.role, PERMISSIONS.SETTING_UPDATE)) {
    return apiError("forbidden", { message: "Missing settings.update permission" })
  }
  const body = await req.json().catch(() => ({}))
  const rawVars: unknown = body.vars
  if (!Array.isArray(rawVars)) return apiError("validation", { message: "`vars` harus array." })

  const seen = new Set<string>()
  const vars: EnvVar[] = []
  for (const v of rawVars as any[]) {
    const key = String(v?.key ?? "").trim()
    const value = String(v?.value ?? "")
    if (!key) continue
    if (!ENV_KEY_RE.test(key)) {
      return apiError("validation", { message: `Nama variabel tidak valid: "${key}". Gunakan HURUF_BESAR dan _.` })
    }
    if (RESERVED_ENV_KEYS.includes(key)) {
      return apiError("validation", { message: `"${key}" adalah variabel sistem dan tidak bisa ditimpa.` })
    }
    if (seen.has(key)) continue
    seen.add(key)
    vars.push({ key, value })
  }
  if (vars.length > 50) return apiError("validation", { message: "Maksimal 50 variabel." })

  await setTenantCustomEnvVars(access.tenantId, vars)

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
