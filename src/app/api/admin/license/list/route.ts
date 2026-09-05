/**
 * GET /api/admin/license/list — list all enterprise licenses.
 */
import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { withAdminAuth } from "@/lib/api/route-helpers"

export const GET = withAdminAuth(
  async (request) => {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") // active | expired | revoked
    const search = searchParams.get("search") || ""
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")

    const where: any = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { customerEmail: { contains: search, mode: "insensitive" } },
        { organization: { contains: search, mode: "insensitive" } },
      ]
    }

    const skip = (page - 1) * limit

    const [licenses, total] = await Promise.all([
      db.enterpriseLicense.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.enterpriseLicense.count({ where }),
    ])
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

    return NextResponse.json({ licenses: enriched, total, page, totalPages: Math.ceil(total / limit) })
  },
)
