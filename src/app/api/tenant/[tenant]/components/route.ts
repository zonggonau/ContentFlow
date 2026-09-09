import { NextResponse } from "next/server"
import { getTenantDb } from "@/lib/database"
import { withStaffAuth } from "@/lib/api/route-helpers"

/** GET /api/tenant/[tenant]/components — components available to this workspace. */
export const GET = withStaffAuth(async (_request, context, { access }) => {
  const { tenant: tenantSlug } = await context.params
  const tenantDb = await getTenantDb(tenantSlug)

  // Scope in the query — global components, this tenant's own, or ones
  // assigned to it. Don't load every tenant's components into memory.
  const components = await tenantDb.component.findMany({
    where: {
      OR: [
        { tenantId: null },
        { tenantId: access.tenantId },
        { tenants: { some: { tenantId: access.tenantId } } },
      ],
    },
    include: { schemaFields: { orderBy: { order: "asc" } }, tenants: true },
    orderBy: { createdAt: "desc" },
  })

  // A global component with explicit assignments is only "available" to the
  // tenants it was assigned to.
  const available = components.filter(
    (c) => c.tenants.length === 0 || c.tenants.some((t) => t.tenantId === access.tenantId) || c.tenantId === access.tenantId,
  )
  return NextResponse.json(available)
})
