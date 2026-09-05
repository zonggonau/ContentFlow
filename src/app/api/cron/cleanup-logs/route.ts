import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { getPlatformSettings } from "@/lib/settings"
import { authorizeCronRequest } from "@/lib/cron-auth"

/**
 * GET /api/cron/cleanup-logs
 *
 * Enforces the platform's auditLogRetentionDays / apiLogRetentionDays
 * settings, which previously saved to the DB via /admin/settings but were
 * never read anywhere — old audit and API request logs accumulated forever
 * regardless of what an admin configured.
 *
 * Requires CRON_SECRET header for security.
 */
export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request)
  if (unauthorized) return unauthorized

  try {
    const settings = await getPlatformSettings()
    const auditDays = parseInt(settings.auditLogRetentionDays, 10) || 90
    const apiDays = parseInt(settings.apiLogRetentionDays, 10) || 14

    const auditThreshold = new Date()
    auditThreshold.setDate(auditThreshold.getDate() - auditDays)

    const apiThreshold = new Date()
    apiThreshold.setDate(apiThreshold.getDate() - apiDays)

    const [deletedAuditLogs, deletedApiRequests] = await Promise.all([
      db.auditLog.deleteMany({ where: { createdAt: { lt: auditThreshold } } }),
      db.apiRequest.deleteMany({ where: { createdAt: { lt: apiThreshold } } }),
    ])

    return NextResponse.json({
      success: true,
      deletedAuditLogs: deletedAuditLogs.count,
      deletedApiRequests: deletedApiRequests.count,
      auditLogRetentionDays: auditDays,
      apiLogRetentionDays: apiDays,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Cron cleanup-logs error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
