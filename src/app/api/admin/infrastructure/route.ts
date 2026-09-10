import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { withAdminAuth } from "@/lib/api/route-helpers"

export const GET = withAdminAuth(async (req) => {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    const globalId = await (await import("@/lib/settings")).getGlobalWorkspaceId()
    const notSystemTenant = { slug: { notIn: [globalId] } }

    const where: any = {
      tenant: notSystemTenant
    }
    if (status) where.status = status
    if (search) {
      where.AND = [
        { tenant: notSystemTenant },
        {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { hostname: { contains: search, mode: "insensitive" } },
            { ipv4: { contains: search, mode: "insensitive" } },
            { tenant: { name: { contains: search, mode: "insensitive" } } },
            { tenant: { slug: { contains: search, mode: "insensitive" } } },
          ]
        }
      ]
    }

    const servers = await db.infrastructureServer.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            logo: true,
            status: true,
          }
        },
      },
      orderBy: { createdAt: "desc" }
    })

    const summary = {
      total: servers.length,
      active: servers.filter(s => s.status === 'active').length,
      provisioning: servers.filter(s => s.status === 'provisioning' || s.status === 'configuring').length,
      error: servers.filter(s => s.status === 'error').length,
      suspended: servers.filter(s => s.status === 'suspended').length,
    }

    const { CONTABO_PLANS, CONTABO_REGIONS, DEFAULT_CONTABO_REGION, CONTABO_STANDARD_IMAGES } = await import("@/lib/infrastructure/contabo")

    // Only return tenants eligible for dedicated infra (paid VPS/VDS/Storage or Enterprise)
    const eligiblePlans = Object.keys(CONTABO_PLANS).concat(["pro", "enterprise", "ENTERPRISE"])

    const tenants = await db.tenant.findMany({
      where: {
        ...notSystemTenant,
        OR: [
          { plan: { in: eligiblePlans } },
          { databaseUrl: { not: null } },
          { subscriptions: { some: { status: "active" } } }
        ]
      },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({
      servers,
      summary,
      meta: {
        plans: Object.values(CONTABO_PLANS),
        regions: CONTABO_REGIONS,
        defaultRegion: DEFAULT_CONTABO_REGION,
        images: Object.entries(CONTABO_STANDARD_IMAGES).map(([label, id]) => ({ label, id })),
        tenants,
      }
    })
})
