import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db, getTenantDbById } from "@/lib/database"
import { getTenantAccess } from "@/lib/tenant-access"
import { RolesClient } from "./roles-client"
import { Skeleton } from "@/components/ui/skeleton"
import { ensureSystemRoles } from "@/lib/permissions-engine"
import { EXCLUDE_PLATFORM_CONTENT_TYPES } from "@/lib/platform-content-types"
import { Metadata } from "next"

export const metadata: Metadata = { title: "Roles & Permissions" }

export default async function RolesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const access = await getTenantAccess(session, tenantSlug)
  if (!access) redirect(`/dashboard/${tenantSlug}`)

  // MemberRole/MemberRolePermission live in the tenant's own database for
  // dedicated-DB (enterprise) tenants, same as Member — resolve it once and
  // use it consistently instead of reading roles from the master `db`.
  const tenantDb = await getTenantDbById(access.tenantId)

  await ensureSystemRoles(access.tenantId, tenantDb)

  const [roles, contentTypes] = await Promise.all([
    tenantDb.memberRole.findMany({
      where: { tenantId: access.tenantId },
      include: {
        permissions: { orderBy: [{ contentTypeSlug: "asc" }, { action: "asc" }] },
        _count: { select: { permissions: true } },
      },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    }),
    db.contentType.findMany({
      where: {
        OR: [{ tenantId: access.tenantId }, { tenantId: null }],
        ...EXCLUDE_PLATFORM_CONTENT_TYPES,
      },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ])

  const memberCounts = await tenantDb.member.groupBy({
    by: ["role"],
    where: { tenantId: access.tenantId },
    _count: true,
  })
  const countMap = Object.fromEntries(memberCounts.map((r) => [r.role, r._count]))

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <RolesClient
        tenantSlug={tenantSlug}
        roles={roles.map(r => ({ ...r, memberCount: countMap[r.slug] ?? 0 })) as any}
        contentTypes={contentTypes as any}
      />
    </Suspense>
  )
}
