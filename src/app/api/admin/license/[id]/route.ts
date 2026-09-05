import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { withAdminAuth, apiError } from "@/lib/api/route-helpers"

// GET /api/admin/license/[id] - reveal the full plaintext license key for
// one license on demand (audited). The list endpoint only ever returns a
// truncated displayKey, so the UI's "copy key" action calls this instead.
export const GET = withAdminAuth(async (_req, context, { session }) => {
  const { id } = await context.params

  const license = await db.enterpriseLicense.findUnique({ where: { id } })
  if (!license) return apiError("not_found", { message: "License not found" })

  logAudit({
    userId: session.user.id,
    action: AuditAction.SETTINGS_UPDATED,
    entity: "EnterpriseLicenseRevealed",
    entityId: id,
  })

  return NextResponse.json({ licenseKey: license.licenseKey })
})

export const DELETE = withAdminAuth(async (_req, context) => {
  const { id } = await context.params

  const license = await db.enterpriseLicense.findUnique({ where: { id } })
  if (!license) return apiError("not_found", { message: "License not found" })

  const [usedInCache, usedInTenant] = await Promise.all([
    db.licenseCache.findFirst({ where: { licenseKey: license.licenseKey } }),
    db.tenant.findFirst({ where: { licenseKey: license.licenseKey } }),
  ])
  if (usedInCache || usedInTenant) {
    return apiError("conflict", {
      message:
        "Cannot delete this license because it is currently in use by one or more users or workspaces.",
    })
  }

  await db.enterpriseLicense.delete({ where: { id } })
  return NextResponse.json({ success: true, message: "License deleted successfully" })
})
