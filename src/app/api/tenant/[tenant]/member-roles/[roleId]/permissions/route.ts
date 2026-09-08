import { NextResponse } from "next/server"
import { z } from "zod"
import { getTenantDbById } from "@/lib/database"
import { invalidatePermissionCache } from "@/lib/permissions-engine"
import { withStaffAuth, apiError, readJson } from "@/lib/api/route-helpers"

const PermissionsSchema = z.object({
  permissions: z.array(z.object({
    contentTypeSlug: z.string().min(1),
    action: z.enum(["find", "findOne", "create", "update", "delete"]),
    granted: z.boolean().default(true),
    conditions: z.record(z.string(), z.unknown()).optional(),
  })),
})

export const GET = withStaffAuth(async (_request, context, { access }) => {
  const { roleId } = await context.params
  const tenantDb = await getTenantDbById(access.tenantId)
  const perms = await tenantDb.memberRolePermission.findMany({
    where: { memberRoleId: roleId },
    orderBy: [{ contentTypeSlug: "asc" }, { action: "asc" }],
  })
  return NextResponse.json({ permissions: perms })
})

/** PUT replaces the entire permission set for a role (idempotent matrix save). */
export const PUT = withStaffAuth(
  async (request, context, { access }) => {
    const { roleId } = await context.params
    const tenantDb = await getTenantDbById(access.tenantId)
    const role = await tenantDb.memberRole.findFirst({ where: { id: roleId, tenantId: access.tenantId } })
    if (!role) return apiError("not_found", { message: "Role not found" })

    const body = await readJson(request, PermissionsSchema)
    if (!body.ok) return body.response
    const { permissions } = body.data

    await tenantDb.$transaction([
      tenantDb.memberRolePermission.deleteMany({ where: { memberRoleId: roleId } }),
      tenantDb.memberRolePermission.createMany({
        data: permissions.map((p) => ({
          memberRoleId: roleId,
          contentTypeSlug: p.contentTypeSlug,
          action: p.action,
          granted: p.granted,
          conditions: (p.conditions ?? null) as any,
        })),
        skipDuplicates: true,
      }),
    ])

    await invalidatePermissionCache(access.tenantId, role.slug)
    return NextResponse.json({ ok: true, count: permissions.length })
  },
  { minRole: "admin" },
)
