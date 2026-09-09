import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getTenantDb } from "@/lib/database"
import { getTenantAccess } from "@/lib/tenant-access"
import { redirect, notFound } from "next/navigation"
import { parseSchemaFieldOptions } from "@/actions/content-pipeline"
import CMSCreateEntryClient from "./create-entry-client"

export default async function CMSCreateEntryPage({
  params,
}: {
  params: Promise<{ tenant: string; slug: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const { tenant: tenantSlug, slug: contentTypeSlug } = await params
  const access = await getTenantAccess(session, tenantSlug)
  if (!access) redirect("/dashboard")

  const tenantDb = await getTenantDb(tenantSlug)

  const contentType = await tenantDb.contentType.findFirst({
    where: { 
      slug: contentTypeSlug,
      OR: [
        { tenantId: access.tenantId },
        { tenantId: null, tenants: { some: { tenantId: access.tenantId, enabled: true } } },
        ...(access.isGlobal ? [{ tenantId: null }] : [])
      ]
    },
    include: { schemaFields: { orderBy: { order: 'asc' } } },
  })

  if (!contentType) notFound()

  const formattedFields = parseSchemaFieldOptions(contentType.schemaFields)
  const mappedContentType = {
    ...contentType,
    fields: formattedFields
  }

  // Fetch available locales
  let availableLocales = [{ locale: "id", name: "Bahasa Indonesia" }]
  try {
    const dbLocales = await (tenantDb as any).locale?.findMany({
      where: { tenantId: access.tenantId },
      orderBy: { isDefault: 'desc' }
    })
    if (dbLocales && dbLocales.length > 0) {
      availableLocales = dbLocales.map((l: any) => ({ locale: l.code, name: l.name }))
    }
  } catch {
    // Fallback default
  }

  // Plan limit enforcement
  const { enforcePlanLimit } = await import("@/lib/plan-enforcement")
  const enforcement = await enforcePlanLimit(access.tenantId, "content_entries", session.user.id)
  const isLimitReached = !enforcement.allowed
  const entriesLimit = enforcement.max

  // Preview URL setting
  let previewUrl: string | null = null
  try {
    const setting = await tenantDb.setting.findFirst({
      where: { key: { in: [`${access.tenantId}_previewUrl`, "previewUrl"] } }
    })
    if (setting?.value) previewUrl = setting.value
  } catch {
    // Ignore setting fetch error
  }

  return (
    <CMSCreateEntryClient 
      tenantSlug={tenantSlug} 
      contentTypeSlug={contentTypeSlug} 
      initialContentType={mappedContentType as any}
      initialAvailableLocales={availableLocales}
      initialIsLimitReached={isLimitReached}
      initialEntriesLimit={entriesLimit}
      initialPreviewUrl={previewUrl}
      userRole={access.role}
      customPermissions={(access as any).customPermissions}
    />
  )
}
