/**
 * GET /api/admin/license/list — list all enterprise licenses.
 */
import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { withAdminAuth } from "@/lib/api/route-helpers"

export const GET = withAdminAuth(
  async (request) => {
    const status = new URL(request.url).searchParams.get("status") // active | expired | revoked
    const where: any = {}
    if (status) where.status = status

    const licenses = await db.enterpriseLicense.findMany({ where, orderBy: { createdAt: "desc" } })
    const now = new Date()

    const enriched = licenses.map((l) => ({
      id: l.id,
      displayKey: `${l.licenseKey.slice(0, 10)}...${l.licenseKey.slice(-6)}`,
      customerName: l.customerName,
      customerEmail: l.customerEmail,
      organization: l.organization,
      type: l.type,
      expiresAt: l.expiresAt,
      isExpired: l.expiresAt < now,
      daysRemaining: Math.max(0, Math.floor((l.expiresAt.getTime() - now.getTime()) / 86400000)),
      status: l.status,
      lastValidatedAt: l.lastValidatedAt,
      validatedCount: l.validatedCount,
      createdAt: l.createdAt,
    }))

    return NextResponse.json({ licenses: enriched, total: enriched.length })
  },
)
