import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { db, getTenantDb } from "@/lib/database"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { getCache, setCache } from "@/lib/cache"
import { logApiRequest } from "@/lib/monitoring"
import { isWorkflowStatus } from "@/lib/content-workflow-rules"
import {
  resolvePublicApiActor,
  authorizeActor,
  toContentActor,
  serviceErrorStatus,
} from "@/lib/public-api-actor"
import { createContentEntry } from "@/lib/content/entry-service"
import {
  parseFilters,
  buildFilterSQL,
  parseFieldSelection,
  parsePopulate,
  parseSort,
  applyFieldSelection,
  isSafeFieldIdentifier,
} from "@/lib/filters"

/**
 * Public API - Get entries with advanced filtering, field selection, and locale support.
 *
 * Query params:
 *   ?filters[field][$op]=value   — Strapi-style filtering
 *   ?fields=title,slug           — Field selection
 *   ?populate=author,tags        — Relation expansion
 *   ?locale=id                   — Locale filter
 *   ?sort=createdAt:desc         — Sorting
 *   ?pagination[page]=1&pagination[pageSize]=25
 *   ?search=keyword              — Full-text search (basic)
 *   ?status=PUBLISHED            — Status filter (default: PUBLISHED only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; contentType: string }> }
) {
  const startTime = Date.now()
  let resolvedTenantId: string | null = null
  try {
    const { tenant: tenantSlug, contentType: contentTypeSlug } = await params
    resolvedTenantId = tenantSlug

    const logResponse = (res: NextResponse) => {
      const duration = Date.now() - startTime
      logApiRequest({
        tenantId: resolvedTenantId,
        endpoint: request.nextUrl.pathname,
        method: request.method,
        statusCode: res.status,
        duration,
      }).catch(() => {})
      return res
    }

    const fullUrl = request.url

    // Resolve the caller: API token (full-access/read-only), member JWT, or
    // anonymous "public" — and gate the "find" action against the Strapi-parity
    // RBAC engine for member/public callers. API tokens remain trusted
    // credentials (read-only tokens may only read, matching prior behavior).
    const resolution = await resolvePublicApiActor(request, tenantSlug)
    if (!resolution.ok) {
      return logResponse(NextResponse.json({ error: resolution.error }, { status: resolution.status }))
    }
    const actor = resolution.actor

    const denial = await authorizeActor(actor, contentTypeSlug, "find")
    if (denial) {
      return logResponse(NextResponse.json({ error: denial.error }, { status: denial.status }))
    }

    const tenantId: string = actor.tenantId
    const apiTokenType = actor.kind === "api-token" ? actor.accessLevel : "read-only"
    const apiTokenId = actor.kind === "api-token" ? actor.tokenId : ""
    const isApiKey = actor.kind === "api-token" && actor.isApiKey

    // Update resolved tenant ID once the actor is verified
    resolvedTenantId = tenantId

    // Rate-limit only after authentication.
    const rateLimitKey =
      actor.kind === "api-token"
        ? `public:${createHash("sha256").update(actor.tokenId).digest("hex")}`
        : actor.kind === "member"
          ? `public:read:member:${actor.memberId}`
          : `public:read:public:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`
    const rateLimitResult = await rateLimit(rateLimitKey, RATE_LIMITS.publicApi)
    if (!rateLimitResult.success) {
      return logResponse(NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rateLimitResult.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetAt / 1000)),
            "Retry-After": String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
          },
        }
      ))
    }

    // Get the correct DB client (Shared or Dedicated)
    const { getTenantDb } = await import("@/lib/database")
    const tenantDb = await getTenantDb(tenantId)

    // Get content type with fields (must belong to this tenant or be global and assigned to this tenant)
    const contentType = await tenantDb.contentType.findFirst({
      where: { 
        slug: contentTypeSlug,
        OR: [
          { tenantId: tenantId },
          { tenantId: null }
        ]
      },
      include: { schemaFields: { orderBy: { order: "asc" } },
        tenants: true,
      },
    })

    if (!contentType) {
      return logResponse(NextResponse.json({ error: "Content type not found" }, { status: 404 }))
    }

    // A content type is available if:
    // 1. It is global (has no tenant assignments)
    // 2. It is explicitly assigned to this tenant
    const isGlobal = contentType.tenants.length === 0
    const isAssigned = contentType.tenants.some(t => t.tenantId === tenantId && t.enabled)

    if (!isGlobal && !isAssigned) {
      return logResponse(NextResponse.json(
        { error: "Content type not available for this tenant" },
        { status: 403 }
      ))
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("pagination[page]") || searchParams.get("page") || "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pagination[pageSize]") || searchParams.get("pageSize") || "25")))

    // Locale + fallback logic
    const requestedLocale = searchParams.get("locale")
    
    // Resolve the tenant's default locale (used for fallback)
    const tenantDefaultLocale = await tenantDb.tenantLocale.findFirst({
      where: { tenantId: tenantId, isDefault: true },
      select: { locale: true },
    })
    const defaultLocale = tenantDefaultLocale?.locale ?? "id"
    const locale = requestedLocale ?? defaultLocale

    // Status (default: only PUBLISHED for public API)
    const statusParam = searchParams.get("status")
    if (apiTokenType !== "full-access" && statusParam && statusParam !== "PUBLISHED") {
      return logResponse(NextResponse.json(
        { error: "A full-access API token is required to read non-published content" },
        { status: 403 }
      ))
    }
    const status = apiTokenType === "full-access" ? (statusParam || "PUBLISHED") : "PUBLISHED"

    if (!isWorkflowStatus(status)) {
      return logResponse(NextResponse.json({ error: "Invalid content status" }, { status: 400 }))
    }

    // Cache is checked only after actor, tenant, content type, and status
    // authorization. The cache-scope segment distinguishes full-access
    // tokens (which may see non-published content) from everyone else —
    // members and anonymous callers share a cache entry per URL since both
    // only ever see PUBLISHED content with no per-actor row filtering.
    const cacheScope = apiTokenType === "full-access" ? apiTokenId : "public"
    const cacheKey = `public_api:${tenantSlug}:${contentTypeSlug}:${cacheScope}:${fullUrl}`
    const cachedResponse = await getCache(cacheKey)
    if (cachedResponse) {
      return logResponse(NextResponse.json(cachedResponse, {
        headers: {
          "X-RateLimit-Limit": String(rateLimitResult.limit),
          "X-RateLimit-Remaining": String(rateLimitResult.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetAt / 1000)),
          "X-Cache": "HIT",
          "Cache-Control": "private, max-age=0, s-maxage=60, stale-while-revalidate=300",
        },
      }))
    }

    // Sort
    const { field: sortField, order: sortOrder } = parseSort(searchParams)

    // Field selection
    const allowedFieldNames = new Set(contentType.schemaFields.map((f) => f.slug))
    const selectedFields = parseFieldSelection(searchParams, allowedFieldNames)

    // Search
    const search = searchParams.get("search")

    // Build base WHERE conditions using Prisma
    const baseWhere: Record<string, unknown> = {
      contentTypeId: contentType.id,
      tenantId: tenantId,
      status,
    }
    if (locale) baseWhere.locale = locale

    // Parse advanced filters
    const { conditions, orGroups } = parseFilters(searchParams, allowedFieldNames)

    let entries: Array<Record<string, unknown>>
    let total: number

    // Check if sortField is a dynamic field inside JSON data.
    // It must be a known content-type slug AND a plain SQL identifier — the value
    // is interpolated into a raw `"data"->>'<slug>'` expression below.
    const validSystemColumns = new Set(["createdAt", "updatedAt", "publishedAt", "id", "status", "locale"])
    const isDynamicSort =
      allowedFieldNames.has(sortField) &&
      !validSystemColumns.has(sortField) &&
      isSafeFieldIdentifier(sortField)

    if (conditions.length > 0 || orGroups.length > 0 || search || isDynamicSort) {
      // Use raw query for advanced filtering or dynamic sorting on JSON data field
      const whereParts: string[] = [
        `"contentTypeId" = $1`,
        `"tenantId" = $2`,
        `"status"::text = $3`,
      ]
      const queryParams: unknown[] = [contentType.id, tenantId, status]
      let paramIdx = 4

      if (locale) {
        whereParts.push(`"locale" = $${paramIdx}`)
        queryParams.push(locale)
        paramIdx++
      }

      // Apply advanced filters
      const filterResult = buildFilterSQL(conditions, orGroups, paramIdx)
      whereParts.push(...filterResult.fragments)
      queryParams.push(...filterResult.params)
      paramIdx = filterResult.nextParam

      // Full-text search using PostgreSQL tsvector (High Performance)
      if (search) {
        // Sanitize search input — strip characters that could disrupt tsquery
        const safeSearch = search.replace(/[&|!():*<>'"\\]/g, " ").trim().slice(0, 200)
        if (safeSearch) {
          // Priority 1: Search using optimized tsvector with GIN index (@@ operator)
          // Priority 2: Fallback to basic ILIKE search for non-indexed fields
          whereParts.push(`("searchVector" @@ plainto_tsquery('english', $${paramIdx}) OR "data"::text ILIKE $${paramIdx + 1})`)
          queryParams.push(safeSearch, `%${safeSearch}%`)
          paramIdx += 2
        }
      }

      const whereClause = whereParts.join(" AND ")

      // Dynamic sorting for raw SQL
      let sanitizedSortField = validSystemColumns.has(sortField) ? `"${sortField}"` : `"createdAt"`
      if (isDynamicSort) {
        if (["price", "order", "step"].includes(sortField)) {
          sanitizedSortField = `NULLIF("data"->>'${sortField}', '')::numeric`
        } else {
          sanitizedSortField = `"data"->>'${sortField}'`
        }
      }

      const safeSortOrder = sortOrder === "asc" ? "ASC" : "DESC"

      // Count query
      const countResult = await tenantDb.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM "content_entries" WHERE ${whereClause}`,
        ...queryParams
      )
      total = Number(countResult[0].count)

      // Data query with sorting and pagination
      entries = await tenantDb.$queryRawUnsafe(
        `SELECT 
          "id", "documentId", "contentTypeId", "tenantId", "locale", 
          "data", "status", "reviewComment", "publishedAt", 
          "scheduledAt", "archivedAt", "createdBy", "updatedBy", 
          "createdAt", "updatedAt"
         FROM "content_entries" 
         WHERE ${whereClause} 
         ORDER BY ${sanitizedSortField} ${safeSortOrder} 
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        ...queryParams,
        pageSize,
        (page - 1) * pageSize
      )

    } else {
      // Simple query without advanced filters
      const [rawEntries, count] = await Promise.all([
        tenantDb.contentEntry.findMany({
          where: baseWhere,
          orderBy: { [sortField]: sortOrder },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tenantDb.contentEntry.count({ where: baseWhere }),
      ])
      entries = rawEntries
      total = count
    }

    // --- Optimized Relation Population (Fix N+1) ---
    const populateParam = parsePopulate(searchParams)
    const relationFields = contentType.schemaFields.filter(f => f.type === "relation")
    
    // Determine which fields to populate (defaults to NONE if not specified, follows Strapi)
    let fieldsToPopulate: string[] = []
    if (populateParam === "*") {
      fieldsToPopulate = relationFields.map(f => f.slug)
    } else if (Array.isArray(populateParam)) {
      fieldsToPopulate = populateParam.filter(p => relationFields.some(rf => rf.slug === p))
    }

    // 1. Collect all unique relation IDs from all entries
    const allRelatedIds = new Set<string>()
    if (fieldsToPopulate.length > 0) {
      entries.forEach((entry: any) => {
        let parsedData: Record<string, unknown> = {}
        try {
          parsedData = typeof entry.data === "string" ? JSON.parse(entry.data) : entry.data
        } catch { return }

        for (const fieldSlug of fieldsToPopulate) {
          const val = parsedData[fieldSlug]
          if (typeof val === 'string' && val.length > 10) {
            allRelatedIds.add(val)
          } else if (Array.isArray(val)) {
            val.forEach(id => {
              if (typeof id === 'string') allRelatedIds.add(id)
            })
          }
        }
      })
    }

    // 2. Batch fetch all related entries in ONE query
    const relatedEntriesMap = new Map<string, any>()
    if (allRelatedIds.size > 0) {
      const relatedEntries = await tenantDb.contentEntry.findMany({
        where: {
          id: { in: Array.from(allRelatedIds) },
          tenantId: tenantId,
          ...(apiTokenType === "full-access" ? {} : { status: "PUBLISHED" as const }),
        },
        select: { id: true, data: true, locale: true, status: true }
      })
      
      relatedEntries.forEach(re => {
        let rd: any = {}
        try {
          rd = typeof re.data === 'string' ? JSON.parse(re.data as string) : re.data
        } catch { rd = {} }
        
        relatedEntriesMap.set(re.id, {
          id: re.id,
          ...rd,
          locale: re.locale,
          status: re.status
        })
      })
    }

    // 3. Map relations back to entries + availableLocales (Synchronously)
    // Collect documentIds to batch-fetch available locales
    const documentIds = entries
      .map((e: any) => e.documentId as string | null)
      .filter((id): id is string => !!id)

    // Batch fetch all locale variants for the documentIds in this result set
    const localeVariants = documentIds.length > 0
      ? await tenantDb.contentEntry.findMany({
          where: {
            documentId: { in: documentIds },
            contentTypeId: contentType.id,
            tenantId: tenantId,
            ...(apiTokenType === "full-access" ? {} : { status: "PUBLISHED" as const }),
          },
          select: { documentId: true, locale: true, status: true },
        })
      : []

    // Build a map: documentId → available locales
    const localesByDoc = new Map<string, string[]>()
    for (const v of localeVariants) {
      if (!v.documentId) continue
      if (!localesByDoc.has(v.documentId)) localesByDoc.set(v.documentId, [])
      localesByDoc.get(v.documentId)!.push(v.locale)
    }

    // Locale fallback: if locale was requested and entry has no data in that
    // locale, attempt to fall back to the tenant's default locale
    let finalEntries = entries
    if (requestedLocale && requestedLocale !== defaultLocale) {
      // Find document IDs for entries that may have a default-locale equivalent
      const docIdsNeedingFallback = entries
        .filter((e: any) => {
          const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data
          return !data || Object.keys(data).length === 0
        })
        .map((e: any) => e.documentId as string | null)
        .filter((id): id is string => !!id)

      if (docIdsNeedingFallback.length > 0) {
        const fallbacks = await tenantDb.contentEntry.findMany({
          where: {
            documentId: { in: docIdsNeedingFallback },
            locale: defaultLocale,
            contentTypeId: contentType.id,
            tenantId: tenantId,
            ...(apiTokenType === "full-access" ? {} : { status: "PUBLISHED" as const }),
          },
        })
        const fallbackMap = new Map(fallbacks.map((f) => [f.documentId, f]))
        finalEntries = entries.map((e: any) => {
          let currentData: Record<string, unknown> = {}
          try {
            currentData = typeof e.data === "string" ? JSON.parse(e.data) : (e.data || {})
          } catch {
            currentData = {}
          }
          const needsFallback = Object.keys(currentData).length === 0
          return needsFallback && e.documentId && fallbackMap.has(e.documentId)
            ? fallbackMap.get(e.documentId)!
            : e
        })
      }
    } else {
      finalEntries = entries
    }

    const parsedEntries = finalEntries.map((entry: any) => {
      let parsedData: Record<string, unknown>
      try {
        parsedData = typeof entry.data === "string" ? JSON.parse(entry.data) : entry.data
      } catch {
        parsedData = {}
      }

      const populatedData = { ...parsedData }
      for (const fieldSlug of fieldsToPopulate) {
        const val = parsedData[fieldSlug]
        if (typeof val === 'string') {
          populatedData[fieldSlug] = relatedEntriesMap.get(val) || val
        } else if (Array.isArray(val)) {
          populatedData[fieldSlug] = val.map(id => 
            typeof id === 'string' ? (relatedEntriesMap.get(id) || id) : id
          )
        }
      }

      const shaped = applyFieldSelection(populatedData, selectedFields)

      return {
        id: entry.id,
        ...shaped,
        locale: entry.locale,
        availableLocales: entry.documentId ? (localesByDoc.get(entry.documentId) ?? [entry.locale]) : [entry.locale],
        status: entry.status,
        publishedAt: entry.publishedAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }
    })
    // ----------------------------------------------

    // Update last used (fire and forget) — only applies to API-token actors
    if (actor.kind === "api-token") {
      if (isApiKey) {
        db.apiKey.update({
          where: { id: apiTokenId },
          data: { lastUsed: new Date() },
        }).catch(() => {})
      } else {
        db.apiToken.update({
          where: { id: apiTokenId },
          data: { lastUsedAt: new Date() },
        }).catch(() => {})
      }
    }

    const headers = new Headers({
      "X-RateLimit-Limit": String(rateLimitResult.limit),
      "X-RateLimit-Remaining": String(rateLimitResult.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetAt / 1000)),
      "X-Cache": "MISS",
      "Cache-Control": "private, max-age=0, s-maxage=60, stale-while-revalidate=300",
    })

    const responsePayload = {
      data: parsedEntries,
      meta: {
        contentType: {
          name: contentType.name,
          slug: contentType.slug,
        },
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    }

    // SET CACHE (ttl 5 mins)
    await setCache(cacheKey, responsePayload, 300)

    return logResponse(NextResponse.json(responsePayload, { headers }))
  } catch (error) {
    console.error("Error fetching content:", error)
    // Handle error logging
    const duration = Date.now() - startTime
    logApiRequest({
      tenantId: resolvedTenantId,
      endpoint: request.nextUrl.pathname,
      method: request.method,
      statusCode: 500,
      duration,
    }).catch(() => {})

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * Public API — create an entry.
 *
 * Authorized via the RBAC permission engine: the caller's role (member JWT or the
 * anonymous "public" role) must be granted the `create` action for this content
 * type. Full-access API tokens are also accepted.
 *
 * Body: `{ data: { ...fields }, locale?: string }`
 * New entries are always created as DRAFT; publishing goes through the CMS workflow.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; contentType: string }> }
) {
  const startTime = Date.now()
  const { tenant: tenantParam, contentType: contentTypeSlug } = await params

  const logResponse = (res: NextResponse, tenantId: string | null) => {
    logApiRequest({
      tenantId,
      endpoint: request.nextUrl.pathname,
      method: "POST",
      statusCode: res.status,
      duration: Date.now() - startTime,
    }).catch(() => {})
    return res
  }

  try {
    const resolution = await resolvePublicApiActor(request, tenantParam)
    if (!resolution.ok) {
      return logResponse(NextResponse.json({ error: resolution.error }, { status: resolution.status }), null)
    }
    const actor = resolution.actor

    const denial = await authorizeActor(actor, contentTypeSlug, "create")
    if (denial) {
      return logResponse(NextResponse.json({ error: denial.error }, { status: denial.status }), actor.tenantId)
    }

    // Per-actor write rate limit (10 writes / 10s).
    const rlKey =
      actor.kind === "member"
        ? `public:write:member:${actor.memberId}`
        : actor.kind === "api-token"
          ? `public:write:token:${actor.tokenId}`
          : `public:write:public:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`
    const rl = await rateLimit(rlKey, { limit: 10, windowSeconds: 10 })
    if (!rl.success) {
      return logResponse(
        NextResponse.json({ error: "Write rate limit exceeded. Slow down." }, { status: 429 }),
        actor.tenantId
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || typeof body.data !== "object" || body.data === null) {
      return logResponse(
        NextResponse.json({ error: "Request body must be { data: { ...fields } }" }, { status: 400 }),
        actor.tenantId
      )
    }

    const tenantDb = await getTenantDb(actor.tenantId)
    const result = await createContentEntry(
      { client: tenantDb, tenantId: actor.tenantId, tenantSlug: actor.tenantSlug, enforcePlan: true },
      toContentActor(actor),
      {
        contentTypeSlug,
        data: body.data as Record<string, unknown>,
        // Headless callers always create DRAFT; the service enforces this too.
        status: "DRAFT",
        locale: typeof body.locale === "string" ? body.locale : null,
      },
    )
    if (!result.ok) {
      return logResponse(
        NextResponse.json({ error: result.message, ...(result.details ? { details: result.details } : {}) }, {
          status: serviceErrorStatus(result.code),
        }),
        actor.tenantId
      )
    }

    const created = result.data
    const createdData =
      created.data && typeof created.data === "object" ? (created.data as Record<string, unknown>) : {}
    return logResponse(
      NextResponse.json(
        {
          data: {
            id: created.id,
            documentId: created.documentId,
            ...createdData,
            locale: created.locale,
            status: created.status,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          },
        },
        { status: 201 }
      ),
      actor.tenantId
    )
  } catch (error) {
    console.error("Error creating content:", error)
    return logResponse(
      NextResponse.json({ error: "Internal server error" }, { status: 500 }),
      null
    )
  }
}
