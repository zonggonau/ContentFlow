/**
 * Platform-internal content types — SaCMS's own billing/pricing data
 * (account plans, workspace plans, AI credit packs, add-ons), seeded as
 * global content types (`tenantId: null`) so the platform's own pricing
 * pages can read them the same way tenant content is read.
 *
 * They are NOT shared templates a tenant can build on. Any tenant-facing
 * listing of "content types available to me" (the CMS sidebar, the
 * Roles & Permissions matrix, the OpenAPI/dev-tools generators, etc.)
 * must exclude these — a tenant's own end-users have no reason to ever
 * see "SaCMS Account Plans" as something they could grant a permission on.
 *
 * Identified by slug prefix rather than a schema flag: all four were
 * deliberately named with this prefix specifically to be internal-only.
 */
const PLATFORM_CONTENT_TYPE_PREFIX = "sacms-"

export function isPlatformContentTypeSlug(slug: string): boolean {
  return slug.startsWith(PLATFORM_CONTENT_TYPE_PREFIX)
}

/** Prisma filter fragment: `NOT: { slug: { startsWith: "sacms-" } }` */
export const EXCLUDE_PLATFORM_CONTENT_TYPES = {
  NOT: { slug: { startsWith: PLATFORM_CONTENT_TYPE_PREFIX } },
} as const
