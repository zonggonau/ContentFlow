import { NextResponse } from "next/server"
import { z } from "zod"
import { getTenantDbById } from "@/lib/database"
import { ensureSystemRoles } from "@/lib/permissions-engine"
import { withStaffAuth, apiError, readJson } from "@/lib/api/route-helpers"

const CreateRoleSchema = z.object({
  name: z.string().min(1).max(60).trim(),
  slug: z.string().min(1).max(60).toLowerCase().regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric and hyphens"),
  description: z.string().optional(),
})

export const GET = withStaffAuth(async (_request, _context, { access }) => {
  const tenantDb = await getTenantDbById(access.tenantId)
  await ensureSystemRoles(access.tenantId, tenantDb)

  const roles = await tenantDb.memberRole.findMany({
    where: { tenantId: access.tenantId },
    include: { _count: { select: { permissions: true } } },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
  })

  const memberCounts = await tenantDb.member.groupBy({ by: ["role"], where: { tenantId: access.tenantId }, _count: true })
  const countMap = Object.fromEntries(memberCounts.map((r) => [r.role, r._count]))

  return NextResponse.json({
    roles: roles.map((r) => ({ ...r, memberCount: countMap[r.slug] ?? 0 })),
  })
})

export const POST = withStaffAuth(
  async (request, _context, { access }) => {
    const body = await readJson(request, CreateRoleSchema)
    if (!body.ok) return body.response
    const { name, slug, description } = body.data

    if (slug === "public" || slug === "authenticated") {
      return apiError("validation", { message: `"${slug}" is a reserved system role slug` })
    }

    const tenantDb = await getTenantDbById(access.tenantId)
    const existing = await tenantDb.memberRole.findFirst({ where: { tenantId: access.tenantId, slug } })
    if (existing) return apiError("conflict", { message: "A role with this slug already exists" })

    const role = await tenantDb.memberRole.create({ data: { tenantId: access.tenantId, name, slug, description } })
    return NextResponse.json({ role }, { status: 201 })
  },
  { minRole: "admin" },
)
