import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { diagnoseDomainDns } from "@/lib/domain-dns"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { withAdminAuth, apiError } from "@/lib/api/route-helpers"

export const GET = withAdminAuth(
  async (request) => {
    const { searchParams } = request.nextUrl
    const search = searchParams.get("search") || ""
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const where: any = {}
    if (search) {
      where.OR = [
        { domain: { contains: search, mode: "insensitive" } },
        { tenant: { name: { contains: search, mode: "insensitive" } } },
        { tenant: { slug: { contains: search, mode: "insensitive" } } },
      ]
    }

    const skip = (page - 1) * limit

    const [domains, total, verifiedCount, pendingCount] = await Promise.all([
      db.customDomain.findMany({
        where,
        include: {
          tenant: { select: { id: true, name: true, slug: true, plan: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.customDomain.count({ where }),
      db.customDomain.count({ where: { ...where, status: "verified" } }),
      db.customDomain.count({ where: { ...where, status: "pending" } }),
    ])
    return NextResponse.json({
      domains,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      verifiedCount,
      pendingCount,
    })
  },
  { allowRoles: ["admin"] },
)

export const POST = withAdminAuth(
  async (request, _context, { session }) => {
    const { domainId, action } = await request.json()
    if (!domainId) return apiError("validation", { message: "Domain ID is required" })

    const existingDomain = await db.customDomain.findUnique({ where: { id: domainId } })
    if (!existingDomain) return apiError("not_found", { message: "Custom domain not found" })

    if (action === "verify") {
      // Run the same live DNS check the tenant-facing verify flow uses —
      // an admin "Verify" click used to flip status to verified with no
      // check at all, which could mark a domain the platform can't
      // actually route to as verified.
      const diagnostics = await diagnoseDomainDns(existingDomain.domain, existingDomain.tenantId)
      if (!diagnostics.verified) {
        return apiError("validation", {
          message: "DNS check failed — the domain's records do not yet point to SaCMS. Fix DNS and try again.",
        })
      }

      const updated = await db.customDomain.update({
        where: { id: domainId },
        data: { status: "verified", verifiedAt: new Date() },
      })
      logAudit({
        userId: session.user.id,
        action: AuditAction.SETTINGS_UPDATED,
        entity: "CustomDomainVerified",
        entityId: domainId,
      })
      return NextResponse.json({ success: true, domain: updated })
    }
    if (action === "set_pending") {
      const updated = await db.customDomain.update({
        where: { id: domainId },
        data: { status: "pending", verifiedAt: null },
      })
      logAudit({
        userId: session.user.id,
        action: AuditAction.SETTINGS_UPDATED,
        entity: "CustomDomainSetPending",
        entityId: domainId,
      })
      return NextResponse.json({ success: true, domain: updated })
    }
    return apiError("validation", { message: "Invalid action" })
  },
  { allowRoles: ["admin"] },
)

export const DELETE = withAdminAuth(
  async (request) => {
    const id = new URL(request.url).searchParams.get("id")
    if (!id) return apiError("validation", { message: "Domain ID is required" })

    await db.customDomain.delete({ where: { id } })
    return NextResponse.json({ success: true })
  },
  { allowRoles: ["admin"] },
)
