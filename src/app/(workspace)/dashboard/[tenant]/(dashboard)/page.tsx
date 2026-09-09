import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db, getTenantDb } from "@/lib/database"
import { getTenantAccess } from "@/lib/tenant-access"
import { enforcePlanLimit } from "@/lib/plan-enforcement"
import { redirect } from "next/navigation"
import TenantDashboardClient from "./client-page"

export default async function TenantDashboardPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const { tenant: tenantSlug } = await params
  const access = await getTenantAccess(session, tenantSlug)
  
  if (!access) redirect("/dashboard")

  const tenantId = access.tenantId
  const tenantDb = await getTenantDb(tenantSlug)

  // 1. Fetch Content Types (with safe fallback)
  const availableContentTypes = await tenantDb.contentType.findMany({
    where: {
      OR: [
        { tenantId: tenantId },
        { tenants: { some: { tenantId: tenantId, enabled: true } } }
      ]
    },
    include: { schemaFields: { orderBy: { order: "asc" } } },
    orderBy: { updatedAt: "desc" },
  }).catch(() => [])

  const contentTypes = await Promise.all(
    availableContentTypes.map(async (contentType) => {
      const entryCount = await tenantDb.contentEntry.count({
        where: { contentTypeId: contentType.id, tenantId: tenantId },
      }).catch(() => 0)

      const formattedFields = (contentType.schemaFields || []).map(field => {
        let parsedOptions = field.options
        if (typeof field.options === 'string') {
          try { parsedOptions = JSON.parse(field.options) } catch (e) { parsedOptions = {} }
        }
        return { ...field, options: parsedOptions }
      })

      return {
        ...contentType,
        fields: formattedFields,
        entryCount,
        isGlobal: false,
      }
    })
  )

  // 2. Fetch Stats (with safe fallbacks)
  const [
    tenantData,
    contentTypeCount,
    singleTypeCount,
    entriesByStatus,
    apiTokenCount,
    webhookCount,
    recentEntries,
    superAdmins,
    appMemberCount,
  ] = await Promise.all([
    tenantDb.tenant.findUnique({
      where: { id: tenantId },
      select: { _count: { select: { members: true, media: true } } }
    }).catch(() => null),
    tenantDb.tenantContentTypeAssignment.count({ where: { tenantId } }).catch(() => 0),
    tenantDb.tenantSingleTypeAssignment.count({ where: { tenantId } }).catch(() => 0),
    tenantDb.contentEntry.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    }).catch(() => []),
    tenantDb.apiToken.count({ where: { tenantId } }).catch(() => 0),
    tenantDb.webhook.count({ where: { tenantId } }).catch(() => 0),
    tenantDb.contentEntry.findMany({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        updatedBy: true,
        contentType: { select: { name: true, slug: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }).catch(() => []),
    db.user.findMany({ where: { role: "super_admin" }, select: { id: true } }).catch(() => []),
    tenantDb.member.count({ where: { tenantId } }).catch(() => 0),
  ])

  const superAdminIds = new Set((superAdmins || []).map(u => u.id))
  const filteredRecentEntries = (recentEntries || [])
    .filter(e => !e.updatedBy || !superAdminIds.has(e.updatedBy))
    .slice(0, 8)

  const statusMap = Object.fromEntries(
    (entriesByStatus || []).map((g) => [g.status.toLowerCase(), g._count._all])
  )

  const totalEntries: number = entriesByStatus ? (Object.values(statusMap).reduce<number>((a, b) => Number(a) + Number(b), 0)) : 0

  const stats = {
    tenant: access.tenant,
    contentTypeCount: contentTypeCount || contentTypes.length,
    singleTypeCount: singleTypeCount || 0,
    totalEntries: Number(totalEntries) || 0,
    mediaCount: tenantData?._count?.media || 0,
    memberCount: tenantData?._count?.members || 0,
    appMemberCount: appMemberCount || 0,
    apiTokenCount: apiTokenCount || 0,
    webhookCount: webhookCount || 0,
    entries: {
      draft: statusMap["draft"] || 0,
      in_review: statusMap["in_review"] || 0,
      approved: statusMap["approved"] || 0,
      scheduled: statusMap["scheduled"] || 0,
      published: statusMap["published"] || 0,
      archived: statusMap["archived"] || 0,
    },
    recentEntries: filteredRecentEntries.map((e) => ({
      id: e.id,
      status: e.status,
      contentType: e.contentType?.name || "Content",
      contentTypeSlug: e.contentType?.slug || "",
      updatedAt: e.updatedAt.toISOString(),
    })),
  }

  // 3. Fetch Usage
  const [entriesLimit, storageLimit, membersLimit] = await Promise.all([
    enforcePlanLimit(tenantId, "content_entries").catch(() => ({ current: 0, max: 1000, allowed: true })),
    enforcePlanLimit(tenantId, "storage").catch(() => ({ current: 0, max: 1024, allowed: true })),
    enforcePlanLimit(tenantId, "team_members").catch(() => ({ current: 0, max: 5, allowed: true }))
  ])

  const mediaSizeSum = await tenantDb.media.aggregate({
    where: { tenantId },
    _sum: { size: true }
  }).catch(() => ({ _sum: { size: 0 } }))

  const usage = [
    {
      label: "Content Entries",
      current: entriesLimit.current,
      limit: entriesLimit.max,
      unit: "entries"
    },
    {
      label: "Media Storage",
      current: Number((mediaSizeSum as any)?._sum?.size || 0),
      limit: storageLimit.max * 1024 * 1024,
      unit: "bytes"
    },
    {
      label: "Team Members",
      current: membersLimit.current,
      limit: membersLimit.max,
      unit: "members"
    }
  ]

  // 4. Determine Activity Log
  const activities = filteredRecentEntries.map((e) => ({
    id: e.id,
    type: "content",
    action: `Entri konten ${e.contentType?.name || ""} diperbarui (${e.status})`,
    time: e.updatedAt.toISOString(),
    user: "Pengguna",
  }))

  return (
    <TenantDashboardClient
      tenantId={tenantId}
      stats={stats}
      contentTypes={contentTypes}
      usage={usage}
      activities={activities}
    />
  )
}
