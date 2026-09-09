import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getTenantDb } from "@/lib/database"
import { getTenantAccess } from "@/lib/tenant-access"
import { redirect, notFound } from "next/navigation"
import { parseSchemaFieldOptions } from "@/actions/content-pipeline"
import CMSEditEntryClient from "./edit-entry-client"

export default async function CMSEditEntryPage({
  params,
}: {
  params: Promise<{ tenant: string; slug: string; id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const { tenant: tenantSlug, slug: contentTypeSlug, id: entryId } = await params
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

  // Fetch entry
  const entry = await tenantDb.contentEntry.findFirst({
    where: {
      id: entryId,
      contentTypeId: contentType.id,
      tenantId: access.tenantId,
    }
  })

  if (!entry) notFound()

  let parsedData = entry.data
  if (typeof entry.data === 'string') {
    try { parsedData = JSON.parse(entry.data) } catch { parsedData = {} }
  }

  const initialEntry = {
    ...entry,
    data: parsedData as Record<string, unknown>,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    publishedAt: entry.publishedAt ? entry.publishedAt.toISOString() : null,
    scheduledAt: entry.scheduledAt ? entry.scheduledAt.toISOString() : null,
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
    <CMSEditEntryClient 
      tenantSlug={tenantSlug} 
      contentTypeSlug={contentTypeSlug} 
      entryId={entryId}
      initialEntry={initialEntry as any}
      initialContentType={mappedContentType as any}
      initialAvailableLocales={availableLocales}
      initialPreviewUrl={previewUrl}
      userRole={access.role}
      customPermissions={(access as any).customPermissions}
    />
  )
}
