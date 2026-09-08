import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db, getTenantDbById } from "@/lib/database"
import { getTenantAccess } from "@/lib/tenant-access"
import { MembersClient } from "./members-client"
import { Skeleton } from "@/components/ui/skeleton"
import { ensureSystemRoles } from "@/lib/permissions-engine"
import { Metadata } from "next"

export const metadata: Metadata = { title: "Application Users" }

export default async function MembersPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const access = await getTenantAccess(session, tenantSlug)
  if (!access) redirect(`/dashboard/${tenantSlug}`)

  const tenantDb = await getTenantDbById(access.tenantId)
  await ensureSystemRoles(access.tenantId, tenantDb)

  const [members, roles, total, tenant] = await Promise.all([
    tenantDb.member.findMany({
      where: { tenantId: access.tenantId },
      select: { id: true, email: true, name: true, avatar: true, role: true, status: true, createdAt: true, lastLoginAt: true, emailVerified: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    tenantDb.memberRole.findMany({
      where: { tenantId: access.tenantId },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    }),
    tenantDb.member.count({ where: { tenantId: access.tenantId } }),
    db.tenant.findUnique({
      where: { id: access.tenantId },
      select: { allowMemberRegistration: true, requireMemberEmailVerification: true },
    }),
  ])

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <MembersClient
        tenantSlug={tenantSlug}
        initialMembers={members as any}
        roles={roles as any}
        total={total}
        policy={{
          allowMemberRegistration: tenant?.allowMemberRegistration ?? true,
          requireMemberEmailVerification: tenant?.requireMemberEmailVerification ?? false,
        }}
      />
    </Suspense>
  )
}
