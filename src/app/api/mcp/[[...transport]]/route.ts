/**
 * SaCMS Model Context Protocol (MCP) Server
 *
 * Full CRUD capabilities for Content Types, Single Types, Components,
 * Content Entries, and Webhooks.
 *
 * Documented/supported IDE agents: Antigravity and VS Code (GitHub Copilot
 * Chat, Agent mode). The server itself speaks standard MCP over Streamable
 * HTTP, so any compliant MCP client can in principle connect — see
 * docs/11-User_Manual_and_Integrations.md §15 for the two supported setups.
 *
 * Auth: Standard HTTP Bearer token (Authorization: Bearer <API_TOKEN>)
 * URL:  /api/mcp
 */

import { createMcpHandler } from "mcp-handler"
import { z } from "zod"
import { db, getTenantDb } from "@/lib/database"
import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { AsyncLocalStorage } from "async_hooks"
import { deployToVercel, getDeploymentStatus, addDomainToProject, getDomainConfig, upsertVercelProjectEnv, disableVercelDeploymentProtection, type VercelEnvTarget } from "@/lib/vercel-client"
import { provisionTenantInfrastructure } from "@/lib/infrastructure/provisioner"
import { FIELD_TYPES, FIELD_CATEGORIES } from "@/lib/field-types"
import { hashMemberPassword } from "@/lib/member-auth"
import { safeFetch } from "@/lib/safe-url"
import { rateLimit, getTenantRateLimit } from "@/lib/rate-limit"

// ─── Auth Helper & Payment Gatekeeper ─────────────────────────────────────────

interface AuthContext {
  tenantId: string
  tenantSlug: string
  tenantName: string
  permissions: string[]
  plan: string
  isPaid: boolean
  hostingType: "shared_vercel" | "dedicated_vps"
  vpsHost?: string
  isSuperAdmin?: boolean
  paymentError?: string
}

const authContext = new AsyncLocalStorage<AuthContext>()

async function resolveToken(rawToken: string): Promise<AuthContext | null> {
  if (!rawToken?.trim()) return null
  const clean = rawToken.trim()
  const hashed = createHash("sha256").update(clean).digest("hex")

  let tenantData: { id: string; slug: string; name: string; plan: string; status: string; hostingStatus: string | null } | null = null
  let permissions: string[] = ["read", "write", "delete"]

  // Look up by hashed token first, then plain token
  const token = await db.apiToken.findFirst({
    where: {
      OR: [
        { token: hashed },
        { token: clean },
      ]
    },
    select: { 
      tenantId: true, 
      permissions: true,
      tenant: { select: { id: true, slug: true, name: true, plan: true, status: true, hostingStatus: true } } 
    },
  })

  if (token?.tenant) {
    db.apiToken.updateMany({
      where: { OR: [{ token: hashed }, { token: clean }] },
      data: { lastUsedAt: new Date() }
    }).catch(() => {})

    tenantData = token.tenant
    if (Array.isArray(token.permissions)) {
      permissions = token.permissions as string[]
    }
  } else {
    // Fallback to ApiKey (plain key)
    const apiKey = await db.apiKey.findUnique({
      where: { key: clean },
      include: { tenant: { select: { id: true, slug: true, name: true, plan: true, status: true, hostingStatus: true } } },
    })

    if (apiKey?.tenant) {
      db.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsed: new Date() },
      }).catch(() => {})

      tenantData = apiKey.tenant
      if (Array.isArray(apiKey.permissions)) {
        permissions = apiKey.permissions as string[]
      }
    }
  }

  if (!tenantData) return null

  // ─── Payment Status & Active Subscription Check ────────────────────────────
  const activeSubscription = await db.subscription.findFirst({
    where: {
      tenantId: tenantData.id,
      status: { in: ["active", "paid", "trialing"] }
    }
  })

  // Verify whether tenant is PAID or has active hosting
  const isPaid = (tenantData.status === "active" && !!activeSubscription) || tenantData.hostingStatus === "active"
  let paymentError: string | undefined = undefined

  if (!isPaid) {
    paymentError = `❌ Payment Required: Akses MCP dinonaktifkan untuk workspace '${tenantData.slug}'. Status langganan Anda belum aktif/dibayar (status: ${activeSubscription?.status || "unpaid"}). Silakan aktifkan pembayaran melalui dashboard workspace.`
  }

  // ─── Plan & Dedicated VPS vs Shared Vercel Resolution ──────────────────────
  const isVpsPlan = tenantData.plan.startsWith("vps-") || tenantData.plan === "enterprise"
  let hostingType: "shared_vercel" | "dedicated_vps" = "shared_vercel"
  let vpsHost: string | undefined = undefined

  if (isVpsPlan) {
    const vpsServer = await db.infrastructureServer.findFirst({
      where: {
        tenantId: tenantData.id,
        status: { in: ["active", "configuring", "provisioning"] }
      },
      orderBy: { createdAt: "desc" }
    })

    if (vpsServer) {
      hostingType = "dedicated_vps"
      vpsHost = vpsServer.hostname || vpsServer.ipv4 || undefined
    }
  }

  return {
    tenantId: tenantData.id,
    tenantSlug: tenantData.slug,
    tenantName: tenantData.name,
    permissions,
    plan: tenantData.plan,
    isPaid,
    hostingType,
    vpsHost,
    isSuperAdmin: false,
    paymentError,
  }
}

const UNAUTHORIZED = {
  content: [{
    type: "text" as const,
    text: "❌ Unauthorized: Invalid or missing API token. Please provide a valid Bearer token for your SaCMS workspace."
  }]
}

/**
 * Scope enforcement for API tokens.
 *
 * `AuthContext.permissions` was resolved from the token's own `permissions`
 * array (e.g. a token minted as read-only: `["read"]`) but was previously
 * only ever *read* by the `inspect_api_capabilities` tool to describe what a
 * token could do — no write/delete/schema/webhook tool actually checked it,
 * so a read-only token could still call `delete_content_type` and every
 * other mutating tool. Every mutating/schema/webhook tool now calls
 * `hasScope()` right after its `UNAUTHORIZED` check.
 *
 * `full_access` or `isSuperAdmin` bypasses all scopes, matching the
 * `can*` booleans already computed in `inspect_api_capabilities`.
 */
type Scope = "read" | "write" | "delete" | "schema" | "webhooks"

function hasScope(auth: AuthContext, scope: Scope): boolean {
  if (auth.isSuperAdmin) return true
  if (auth.permissions.includes("full_access")) return true
  return auth.permissions.includes(scope)
}

function permissionDenied(scope: Scope) {
  return {
    content: [{
      type: "text" as const,
      text: `❌ Forbidden: this API token does not have the "${scope}" permission. Ask a workspace admin to grant it under Developer & API → API Tokens, or use a token with "full_access".`
    }],
    isError: true,
  }
}


// ─── MCP Handler with Complete CRUD Capabilities ─────────────────────────────

const handler = createMcpHandler(
  async (server) => {

    // =========================================================================
    // 1. FULL SCHEMA & INTROSPECTION TOOLS
    // =========================================================================

    // ── get_full_schema ──────────────────────────────────────────────────────
    server.registerTool(
      "get_full_schema",
      {
        title: "Get Full Schema",
        description: "Get the complete database schema of the workspace — all Content Types (collections), Single Types (one-off pages), and Components (reusable blocks) with their fields and configurations. Call this FIRST when building or scaffolding frontend applications.",
        inputSchema: {},
      },
      async () => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const [contentTypes, singleTypes, components] = await Promise.all([
          tenantDb.contentType.findMany({ 
            where: { tenantId: auth.tenantId }, 
            include: { schemaFields: { orderBy: { order: "asc" } } } 
          }),
          tenantDb.singleType.findMany({ 
            where: { tenantId: auth.tenantId }, 
            include: { 
              schemaFields: { orderBy: { order: "asc" } },
              tenants: { where: { tenantId: auth.tenantId }, take: 1 }
            } 
          }),
          tenantDb.component.findMany({ 
            where: { tenantId: auth.tenantId }, 
            include: { schemaFields: { orderBy: { order: "asc" } } } 
          }),
        ])

        const mapFields = (fields: any[]) => fields.map((f) => ({
          name: f.name,
          slug: f.slug,
          type: f.type,
          required: f.required,
          unique: f.unique,
          localizable: f.localizable,
          ...(f.relationSlug ? { relationSlug: f.relationSlug } : {}),
          ...(f.options ? { options: f.options } : {}),
        }))

        const schema = {
          workspace: { id: auth.tenantId, name: auth.tenantName, slug: auth.tenantSlug },
          contentTypes: contentTypes.map((ct) => ({ 
            id: ct.id, 
            name: ct.name, 
            slug: ct.slug, 
            description: ct.description, 
            fields: mapFields(ct.schemaFields) 
          })),
          singleTypes: singleTypes.map((st) => ({ 
            id: st.id, 
            name: st.name, 
            slug: st.slug, 
            description: st.description, 
            hasData: !!st.tenants[0]?.data,
            data: st.tenants[0]?.data || null,
            fields: mapFields(st.schemaFields) 
          })),
          components: components.map((c) => ({ 
            id: c.id, 
            name: c.name, 
            slug: c.slug, 
            category: c.category, 
            description: c.description, 
            fields: mapFields(c.schemaFields) 
          })),
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(schema, null, 2) }] }
      }
    )

    // ── list_field_types ─────────────────────────────────────────────────────
    server.registerTool(
      "list_field_types",
      {
        title: "List Supported Field Types",
        description: "List all 33 supported field types in SaCMS (text, textarea, richText, markdown, number, currency, percent, date, datetime, time, dateRange, select, multiselect, tags, icon, boolean, email, password, url, phone, uid, media, mediaMultiple, file, relation, component, repeater, location, seo, code, json, color, rating). Call this to discover allowed types, validation rules, and schema configuration options before creating or modifying content types.",
        inputSchema: {
          category: z.enum([
            "Basic",
            "Number",
            "Date & Time",
            "Selection",
            "Boolean",
            "Validation",
            "Media",
            "Relations",
            "Advanced"
          ]).optional().describe("Optional category to filter field types"),
        },
      },
      async ({ category }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        let types = FIELD_TYPES as unknown as any[]
        if (category) {
          types = types.filter(t => t.category.toLowerCase() === category.toLowerCase())
        }

        const fieldDocs = types.map((ft) => {
          const supportedOptions: Record<string, string> = {
            required: "boolean (default false)",
            unique: "boolean (default false)",
            localizable: "boolean (default true - i18n translation)",
          }
          const exampleField: Record<string, any> = {
            name: ft.label,
            slug: ft.type.toLowerCase().replace(/[^a-z0-9]/g, "_"),
            type: ft.type,
            required: false,
          }

          if (ft.type === "relation") {
            supportedOptions.relationSlug = "string (target collection slug, e.g. 'categories')"
            supportedOptions.relationType = "oneToOne | oneToMany | manyToOne | manyToMany"
            exampleField.relationSlug = "categories"
          } else if (ft.type === "component") {
            supportedOptions.options = "{ componentSlug: string } (e.g. { componentSlug: 'hero_section' })"
            exampleField.options = { componentSlug: "hero_section" }
          } else if (ft.type === "repeater") {
            supportedOptions.options = "{ componentSlugs: string[] } (dynamic polymorphic zone)"
            exampleField.options = { componentSlugs: ["hero_section", "cta_banner", "testimonial_card"] }
          } else if (ft.type === "select" || ft.type === "multiselect") {
            supportedOptions.options = "{ choices: Array<{ label: string, value: string }> }"
            exampleField.options = {
              choices: [
                { label: "Option A", value: "option_a" },
                { label: "Option B", value: "option_b" }
              ]
            }
          } else if (ft.type === "currency") {
            supportedOptions.options = "{ currencyCode: 'IDR' | 'USD' | 'EUR', min?: number, max?: number }"
            exampleField.options = { currencyCode: "IDR", min: 0 }
          } else if (ft.type === "number" || ft.type === "percent") {
            supportedOptions.options = "{ min?: number, max?: number, step?: number }"
            exampleField.options = { min: 0, max: 100 }
          } else if (ft.type === "media" || ft.type === "mediaMultiple") {
            supportedOptions.options = "{ allowedTypes: ['image', 'video', 'document'], maxFileSizeMb?: number }"
            exampleField.options = { allowedTypes: ["image"] }
          }

          return {
            type: ft.type,
            label: ft.label,
            category: ft.category,
            description: ft.description,
            supportedOptions,
            exampleSchemaField: exampleField,
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              totalCount: fieldDocs.length,
              categories: FIELD_CATEGORIES,
              fieldTypes: fieldDocs,
              usageNote: "Pass these field definitions in the 'fields' array of 'create_content_type', 'create_single_type', or 'create_component'."
            }, null, 2)
          }]
        }
      }
    )

    // =========================================================================
    // 2. CONTENT TYPES (COLLECTIONS) CRUD
    // =========================================================================

    // ── list_content_types ───────────────────────────────────────────────────
    server.registerTool(
      "list_content_types",
      {
        title: "List Content Types",
        description: "List all Content Types (collections like articles, products, categories, authors) with their field schemas and total entry counts.",
        inputSchema: {},
      },
      async () => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const contentTypes = await tenantDb.contentType.findMany({
          where: { tenantId: auth.tenantId },
          include: { 
            schemaFields: { orderBy: { order: "asc" } },
            _count: { select: { entries: true } }
          },
          orderBy: { name: "asc" },
        })

        const result = contentTypes.map((ct) => ({
          id: ct.id,
          name: ct.name,
          slug: ct.slug,
          description: ct.description,
          entryCount: ct._count.entries,
          fields: ct.schemaFields.map((f) => ({
            name: f.name,
            slug: f.slug,
            type: f.type,
            required: f.required,
            unique: f.unique,
            relationSlug: f.relationSlug,
            options: f.options
          })),
        }))

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── get_content_type ─────────────────────────────────────────────────────
    server.registerTool(
      "get_content_type",
      {
        title: "Get Content Type Schema",
        description: "Get detailed field schema and metadata for a specific Content Type by its slug or ID.",
        inputSchema: {
          slug: z.string().describe("Slug of the Content Type (e.g. 'articles', 'products')"),
        },
      },
      async ({ slug }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const ct = await tenantDb.contentType.findFirst({
          where: {
            OR: [
              { slug, tenantId: auth.tenantId },
              { id: slug, tenantId: auth.tenantId },
            ]
          },
          include: { 
            schemaFields: { orderBy: { order: "asc" } },
            _count: { select: { entries: true } }
          }
        })

        if (!ct) return { content: [{ type: "text" as const, text: `❌ Content Type '${slug}' not found.` }] }

        const result = {
          id: ct.id,
          name: ct.name,
          slug: ct.slug,
          description: ct.description,
          showInCms: ct.showInCms,
          entryCount: ct._count.entries,
          fields: ct.schemaFields.map(f => ({
            id: f.id,
            name: f.name,
            slug: f.slug,
            type: f.type,
            required: f.required,
            unique: f.unique,
            localizable: f.localizable,
            relationSlug: f.relationSlug,
            options: f.options
          }))
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── create_content_type ──────────────────────────────────────────────────
    server.registerTool(
      "create_content_type",
      {
        title: "Create Content Type",
        description: "Create a new Content Type collection schema with fields. Call 'list_field_types' to discover all 33 supported field types (text, textarea, richText, markdown, number, currency, percent, date, datetime, time, dateRange, select, multiselect, tags, icon, boolean, email, password, url, phone, uid, media, mediaMultiple, file, relation, component, repeater, location, seo, code, json, color, rating).",
        inputSchema: {
          name: z.string().describe("Display name (e.g. 'Blog Post', 'Product Item')"),
          slug: z.string().describe("URL-safe slug (e.g. 'articles', 'products')"),
          description: z.string().optional().describe("Description of this collection"),
          showInCms: z.boolean().default(true).describe("Whether to display in CMS sidebar"),
          fields: z.array(
            z.object({
              name: z.string().describe("Field display name (e.g. 'Title', 'Price')"),
              slug: z.string().describe("Field slug (e.g. 'title', 'price')"),
              type: z.string().describe("Field type identifier (e.g. 'text', 'textarea', 'richText', 'currency', 'date', 'mediaMultiple', 'relation', 'repeater', etc. See 'list_field_types' for full list)"),
              required: z.boolean().optional().default(false),
              unique: z.boolean().optional().default(false),
              localizable: z.boolean().optional().default(true),
              relationSlug: z.string().optional().describe("For relation type: slug of target content type"),
              options: z.record(z.string(), z.any()).optional().describe("Extra field options (e.g. { currencyCode: 'IDR' }, { choices: [{label, value}] }, { componentSlug: 'hero' })"),
            })
          ).optional().describe("List of field definitions to create for this Content Type"),
        },
      },
      async ({ name, slug, description, showInCms, fields }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "-")
        const tenantDb = await getTenantDb(auth.tenantSlug)

        // Check if slug already exists
        const existing = await tenantDb.contentType.findFirst({
          where: { tenantId: auth.tenantId, slug: cleanSlug }
        })
        if (existing) {
          return { content: [{ type: "text" as const, text: `❌ A Content Type with slug '${cleanSlug}' already exists.` }] }
        }

        const created = await tenantDb.contentType.create({
          data: {
            tenantId: auth.tenantId,
            name: name.trim(),
            slug: cleanSlug,
            description: description || null,
            showInCms: showInCms ?? true,
            isPublished: true,
            schemaFields: {
              create: (fields || []).map((f, idx) => ({
                name: f.name,
                slug: f.slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "_"),
                type: f.type,
                required: f.required || false,
                unique: f.unique || false,
                localizable: f.localizable ?? true,
                relationSlug: f.relationSlug || null,
                options: f.options || {},
                order: idx,
              }))
            },
            tenants: {
              create: {
                tenantId: auth.tenantId,
              }
            }
          },
          include: {
            schemaFields: { orderBy: { order: "asc" } }
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Content Type '${created.name}' (slug: '${created.slug}') created successfully with ${created.schemaFields.length} fields.\n\n${JSON.stringify(created, null, 2)}`
          }]
        }
      }
    )

    // ── update_content_type ──────────────────────────────────────────────────
    server.registerTool(
      "update_content_type",
      {
        title: "Update Content Type",
        description: "Update an existing Content Type's name, description, or add/replace its schema fields.",
        inputSchema: {
          slug: z.string().describe("Current slug or ID of the Content Type to update"),
          name: z.string().optional().describe("New display name"),
          description: z.string().optional().describe("New description"),
          showInCms: z.boolean().optional().describe("Show in CMS navigation"),
          fields: z.array(
            z.object({
              name: z.string(),
              slug: z.string(),
              type: z.string(),
              required: z.boolean().optional().default(false),
              unique: z.boolean().optional().default(false),
              localizable: z.boolean().optional().default(true),
              relationSlug: z.string().optional(),
              options: z.record(z.string(), z.any()).optional(),
            })
          ).optional().describe("New list of fields. If provided, replaces the schema field set."),
        },
      },
      async ({ slug, name, description, showInCms, fields }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const ct = await tenantDb.contentType.findFirst({
          where: {
            OR: [
              { slug, tenantId: auth.tenantId },
              { id: slug, tenantId: auth.tenantId },
            ]
          }
        })
        if (!ct) return { content: [{ type: "text" as const, text: `❌ Content Type '${slug}' not found.` }] }

        // Update fields if provided
        if (fields && fields.length > 0) {
          await tenantDb.schemaField.deleteMany({
            where: { contentTypeId: ct.id }
          })
          await tenantDb.schemaField.createMany({
            data: fields.map((f, idx) => ({
              contentTypeId: ct.id,
              name: f.name,
              slug: f.slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "_"),
              type: f.type,
              required: f.required || false,
              unique: f.unique || false,
              localizable: f.localizable ?? true,
              relationSlug: f.relationSlug || null,
              options: f.options || {},
              order: idx,
            }))
          })
        }

        const updated = await tenantDb.contentType.update({
          where: { id: ct.id },
          data: {
            ...(name ? { name: name.trim() } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(showInCms !== undefined ? { showInCms } : {}),
          },
          include: {
            schemaFields: { orderBy: { order: "asc" } }
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Content Type '${updated.name}' updated successfully.\n\n${JSON.stringify(updated, null, 2)}`
          }]
        }
      }
    )

    // ── delete_content_type ──────────────────────────────────────────────────
    server.registerTool(
      "delete_content_type",
      {
        title: "Delete Content Type",
        description: "Permanently delete a Content Type collection, its schema fields, and all its stored content entries.",
        inputSchema: {
          slug: z.string().describe("Slug or ID of the Content Type to delete"),
        },
      },
      async ({ slug }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "delete")) return permissionDenied("delete")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const ct = await tenantDb.contentType.findFirst({
          where: {
            OR: [
              { slug, tenantId: auth.tenantId },
              { id: slug, tenantId: auth.tenantId },
            ]
          }
        })
        if (!ct) return { content: [{ type: "text" as const, text: `❌ Content Type '${slug}' not found.` }] }

        await tenantDb.contentType.delete({
          where: { id: ct.id }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Content Type '${ct.name}' (slug: '${ct.slug}') has been permanently deleted.`
          }]
        }
      }
    )

    // =========================================================================
    // 3. CONTENT ENTRIES CRUD (DATA ENTITIES)
    // =========================================================================

    // ── query_content ────────────────────────────────────────────────────────
    server.registerTool(
      "query_content",
      {
        title: "Query Content Entries",
        description: "Fetch published or draft content entries from a Content Type collection with pagination, search, locale filtering, and sorting.",
        inputSchema: {
          contentTypeSlug: z.string().describe("Slug of the Content Type (e.g. 'articles', 'products')"),
          limit: z.number().default(10).describe("Number of items to return (max 100)"),
          page: z.number().default(1).describe("Page number (1-indexed)"),
          status: z.enum(["PUBLISHED", "DRAFT", "IN_REVIEW", "ARCHIVED", "ALL"]).default("PUBLISHED"),
          search: z.string().optional().describe("Search term"),
          locale: z.string().optional().describe("Filter by locale code (e.g. 'id', 'en')"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
        },
      },
      async ({ contentTypeSlug, limit, page, status, search, locale, sortOrder }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const ct = await tenantDb.contentType.findFirst({ 
          where: { 
            OR: [
              { slug: contentTypeSlug, tenantId: auth.tenantId },
              { id: contentTypeSlug, tenantId: auth.tenantId },
            ]
          } 
        })
        if (!ct) return { content: [{ type: "text" as const, text: `❌ Content Type '${contentTypeSlug}' not found.` }] }

        const safeLimit = Math.min(limit ?? 10, 100)
        const safePage = Math.max(page ?? 1, 1)

        const whereClause: any = {
          contentTypeId: ct.id,
          tenantId: auth.tenantId,
        }
        if (status && status !== "ALL") {
          whereClause.status = status
        }
        if (locale) {
          whereClause.locale = locale
        }

        const [entries, total] = await Promise.all([
          tenantDb.contentEntry.findMany({
            where: whereClause,
            skip: (safePage - 1) * safeLimit,
            take: safeLimit,
            orderBy: { createdAt: sortOrder ?? "desc" },
          }),
          tenantDb.contentEntry.count({ where: whereClause })
        ])

        const result = {
          contentType: ct.slug,
          pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.ceil(total / safeLimit)
          },
          data: entries.map((e) => ({
            _id: e.id,
            _status: e.status,
            _locale: e.locale,
            _createdAt: e.createdAt,
            _publishedAt: e.publishedAt,
            ...(typeof e.data === "object" && e.data !== null ? e.data : {}),
          })),
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── get_content_entry ────────────────────────────────────────────────────
    server.registerTool(
      "get_content_entry",
      {
        title: "Get Content Entry",
        description: "Fetch a specific content entry record by its unique ID, including all JSON fields, locale, status, and metadata.",
        inputSchema: {
          id: z.string().describe("Unique ID of the content entry (e.g. 'cmtcsh...')"),
        },
      },
      async ({ id }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const entry = await tenantDb.contentEntry.findFirst({
          where: { id, tenantId: auth.tenantId },
          include: {
            contentType: {
              select: { id: true, name: true, slug: true }
            }
          }
        })
        if (!entry) {
          return {
            content: [{ type: "text" as const, text: `❌ Content entry with ID '${id}' not found.` }],
            isError: true,
          }
        }

        const result = {
          _id: entry.id,
          _contentType: entry.contentType.slug,
          _contentTypeName: entry.contentType.name,
          _status: entry.status,
          _locale: entry.locale,
          _createdAt: entry.createdAt,
          _updatedAt: entry.updatedAt,
          _publishedAt: entry.publishedAt,
          ...(typeof entry.data === "object" && entry.data !== null ? entry.data : {}),
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── create_content_entry ─────────────────────────────────────────────────
    server.registerTool(
      "create_content_entry",
      {
        title: "Create Content Entry",
        description: "Insert a new content entry record into a Content Type collection with JSON payload data.",
        inputSchema: {
          contentTypeSlug: z.string().describe("Slug of the target Content Type (e.g. 'articles')"),
          data: z.record(z.string(), z.any()).describe("JSON object containing the field values (e.g. { title: 'Hello', slug: 'hello', content: '...' })"),
          status: z.enum(["PUBLISHED", "DRAFT", "IN_REVIEW"]).default("PUBLISHED").describe("Initial entry status"),
          locale: z.string().default("id").describe("Content locale (default 'id')"),
        },
      },
      async ({ contentTypeSlug, data, status, locale }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const ct = await tenantDb.contentType.findFirst({
          where: {
            OR: [
              { slug: contentTypeSlug, tenantId: auth.tenantId },
              { id: contentTypeSlug, tenantId: auth.tenantId },
            ]
          }
        })
        if (!ct) return { content: [{ type: "text" as const, text: `❌ Content Type '${contentTypeSlug}' not found.` }] }

        const entry = await tenantDb.contentEntry.create({
          data: {
            contentTypeId: ct.id,
            tenantId: auth.tenantId,
            data: data || {},
            status: status || "PUBLISHED",
            locale: locale || "id",
            publishedAt: status === "PUBLISHED" ? new Date() : null,
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Content entry created successfully in '${ct.slug}' with ID '${entry.id}'.\n\n${JSON.stringify(entry, null, 2)}`
          }]
        }
      }
    )

    // ── update_content_entry ─────────────────────────────────────────────────
    server.registerTool(
      "update_content_entry",
      {
        title: "Update Content Entry",
        description: "Update an existing content entry record by its ID.",
        inputSchema: {
          id: z.string().describe("ID of the content entry to update"),
          data: z.record(z.string(), z.any()).optional().describe("Updated JSON field values (will be merged with existing data)"),
          status: z.enum(["PUBLISHED", "DRAFT", "IN_REVIEW", "ARCHIVED"]).optional().describe("Updated status"),
        },
      },
      async ({ id, data, status }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const existing = await tenantDb.contentEntry.findFirst({
          where: { id, tenantId: auth.tenantId }
        })
        if (!existing) return { content: [{ type: "text" as const, text: `❌ Content entry with ID '${id}' not found.` }] }

        const existingData = typeof existing.data === "object" && existing.data !== null ? existing.data : {}
        const mergedData = data ? { ...existingData, ...data } : existingData

        const updated = await tenantDb.contentEntry.update({
          where: { id },
          data: {
            data: mergedData,
            ...(status ? { status } : {}),
            ...(status === "PUBLISHED" && !existing.publishedAt ? { publishedAt: new Date() } : {}),
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Content entry '${id}' updated successfully.\n\n${JSON.stringify(updated, null, 2)}`
          }]
        }
      }
    )

    // ── delete_content_entry ─────────────────────────────────────────────────
    server.registerTool(
      "delete_content_entry",
      {
        title: "Delete Content Entry",
        description: "Delete a specific content entry by its ID.",
        inputSchema: {
          id: z.string().describe("ID of the content entry to delete"),
        },
      },
      async ({ id }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "delete")) return permissionDenied("delete")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const existing = await tenantDb.contentEntry.findFirst({
          where: { id, tenantId: auth.tenantId }
        })
        if (!existing) return { content: [{ type: "text" as const, text: `❌ Content entry with ID '${id}' not found.` }] }

        await tenantDb.contentEntry.delete({ where: { id } })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Content entry '${id}' deleted successfully.`
          }]
        }
      }
    )

    // =========================================================================
    // 4. SINGLE TYPES (SINGLETON PAGES) CRUD
    // =========================================================================

    // ── list_single_types ────────────────────────────────────────────────────
    server.registerTool(
      "list_single_types",
      {
        title: "List Single Types",
        description: "List all Single Types (one-off page schemas like Homepage, About Page, Global Site Settings).",
        inputSchema: {},
      },
      async () => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const singleTypes = await tenantDb.singleType.findMany({
          where: { tenantId: auth.tenantId },
          include: { 
            schemaFields: { orderBy: { order: "asc" } },
            tenants: { where: { tenantId: auth.tenantId }, take: 1 }
          },
          orderBy: { name: "asc" },
        })

        const result = singleTypes.map((st) => ({
          id: st.id,
          name: st.name,
          slug: st.slug,
          description: st.description,
          hasData: !!st.tenants[0]?.data,
          fields: st.schemaFields.map((f) => ({
            name: f.name,
            slug: f.slug,
            type: f.type,
            required: f.required,
            unique: f.unique,
          })),
        }))

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── get_single_type ──────────────────────────────────────────────────────
    server.registerTool(
      "get_single_type",
      {
        title: "Get Single Type Content & Schema",
        description: "Fetch the schema fields and actual saved content data for a specific Single Type.",
        inputSchema: {
          singleTypeSlug: z.string().describe("Slug or ID of the Single Type (e.g. 'homepage', 'global-settings', 'about')"),
          locale: z.string().optional().default("id").describe("Content locale (default 'id')"),
        },
      },
      async ({ singleTypeSlug, locale }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const targetLocale = locale || "id"
        const st = await tenantDb.singleType.findFirst({
          where: {
            OR: [
              { slug: singleTypeSlug, tenantId: auth.tenantId },
              { id: singleTypeSlug, tenantId: auth.tenantId },
            ]
          },
          include: { 
            schemaFields: { orderBy: { order: "asc" } },
            tenants: { where: { tenantId: auth.tenantId } }
          },
        })
        if (!st) return { content: [{ type: "text" as const, text: `❌ Single Type '${singleTypeSlug}' not found.` }], isError: true }

        const matchingAssignment = st.tenants.find(t => t.locale === targetLocale) || st.tenants[0]

        const result = {
          singleType: {
            id: st.id,
            name: st.name,
            slug: st.slug,
            description: st.description,
            fields: st.schemaFields.map(f => ({
              name: f.name,
              slug: f.slug,
              type: f.type,
              required: f.required,
              options: f.options
            })),
          },
          locale: matchingAssignment?.locale || targetLocale,
          data: matchingAssignment?.data || {}
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── create_single_type ───────────────────────────────────────────────────
    server.registerTool(
      "create_single_type",
      {
        title: "Create Single Type",
        description: "Create a new Single Type (singleton page schema e.g. 'Homepage', 'Contact Page') with fields and optional initial content data.",
        inputSchema: {
          name: z.string().describe("Display name (e.g. 'Homepage', 'Site Settings')"),
          slug: z.string().describe("URL-friendly slug (e.g. 'homepage', 'site-settings')"),
          description: z.string().optional().describe("Description of this single type"),
          fields: z.array(
            z.object({
              name: z.string(),
              slug: z.string(),
              type: z.string(),
              required: z.boolean().optional().default(false),
              options: z.record(z.string(), z.any()).optional(),
            })
          ).optional().describe("Field definitions"),
          initialData: z.record(z.string(), z.any()).optional().describe("Initial singleton content values"),
          locale: z.string().default("id").describe("Initial content locale (default 'id')"),
        },
      },
      async ({ name, slug, description, fields, initialData, locale }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "-")
        const tenantDb = await getTenantDb(auth.tenantSlug)

        const existing = await tenantDb.singleType.findFirst({
          where: { tenantId: auth.tenantId, slug: cleanSlug }
        })
        if (existing) return { content: [{ type: "text" as const, text: `❌ Single Type '${cleanSlug}' already exists.` }] }

        const initialLocale = locale || "id"
        const created = await tenantDb.singleType.create({
          data: {
            tenantId: auth.tenantId,
            name: name.trim(),
            slug: cleanSlug,
            description: description || null,
            isPublished: true,
            schemaFields: {
              create: (fields || []).map((f, idx) => ({
                name: f.name,
                slug: f.slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "_"),
                type: f.type,
                required: f.required || false,
                options: f.options || {},
                order: idx,
              }))
            },
            tenants: {
              create: {
                tenantId: auth.tenantId,
                locale: initialLocale,
                data: initialData || {},
                publishedAt: new Date()
              }
            }
          },
          include: {
            schemaFields: { orderBy: { order: "asc" } },
            tenants: true
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Single Type '${created.name}' (slug: '${created.slug}') created successfully.\n\n${JSON.stringify(created, null, 2)}`
          }]
        }
      }
    )

    // ── update_single_type_content ───────────────────────────────────────────
    server.registerTool(
      "update_single_type_content",
      {
        title: "Update Single Type Content",
        description: "Save or update the singleton content values stored in a Single Type (e.g. hero banner title, footer links).",
        inputSchema: {
          singleTypeSlug: z.string().describe("Slug of the Single Type (e.g. 'homepage')"),
          data: z.record(z.string(), z.any()).describe("JSON object of content values"),
          locale: z.string().default("id").describe("Content locale (default 'id')"),
        },
      },
      async ({ singleTypeSlug, data, locale }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const targetLocale = locale || "id"
        const st = await tenantDb.singleType.findFirst({
          where: {
            OR: [
              { slug: singleTypeSlug, tenantId: auth.tenantId },
              { id: singleTypeSlug, tenantId: auth.tenantId },
            ]
          }
        })
        if (!st) return { content: [{ type: "text" as const, text: `❌ Single Type '${singleTypeSlug}' not found.` }] }

        const assignment = await tenantDb.tenantSingleTypeAssignment.upsert({
          where: {
            tenantId_singleTypeId_locale: {
              tenantId: auth.tenantId,
              singleTypeId: st.id,
              locale: targetLocale
            }
          },
          update: {
            data: data || {},
            publishedAt: new Date(),
          },
          create: {
            tenantId: auth.tenantId,
            singleTypeId: st.id,
            locale: targetLocale,
            data: data || {},
            publishedAt: new Date(),
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Single Type '${st.slug}' (${targetLocale}) content saved successfully.\n\n${JSON.stringify(assignment, null, 2)}`
          }]
        }
      }
    )

    // ── update_single_type ───────────────────────────────────────────────────
    server.registerTool(
      "update_single_type",
      {
        title: "Update Single Type Schema",
        description: "Update an existing Single Type's name, description, or add/replace its schema fields.",
        inputSchema: {
          singleTypeSlug: z.string().describe("Slug or ID of the Single Type to update"),
          name: z.string().optional().describe("New display name"),
          description: z.string().optional().describe("New description"),
          fields: z.array(
            z.object({
              name: z.string(),
              slug: z.string(),
              type: z.string(),
              required: z.boolean().optional().default(false),
              options: z.record(z.string(), z.any()).optional(),
            })
          ).optional().describe("New list of fields. If provided, replaces the schema field set."),
        },
      },
      async ({ singleTypeSlug, name, description, fields }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const st = await tenantDb.singleType.findFirst({
          where: {
            OR: [
              { slug: singleTypeSlug, tenantId: auth.tenantId },
              { id: singleTypeSlug, tenantId: auth.tenantId },
            ]
          }
        })
        if (!st) return { content: [{ type: "text" as const, text: `❌ Single Type '${singleTypeSlug}' not found.` }] }

        // Update fields if provided
        if (fields && fields.length > 0) {
          await tenantDb.schemaField.deleteMany({
            where: { singleTypeId: st.id }
          })
          await tenantDb.schemaField.createMany({
            data: fields.map((f, idx) => ({
              singleTypeId: st.id,
              name: f.name,
              slug: f.slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "_"),
              type: f.type,
              required: f.required || false,
              options: f.options || {},
              order: idx,
            }))
          })
        }

        const updated = await tenantDb.singleType.update({
          where: { id: st.id },
          data: {
            ...(name ? { name: name.trim() } : {}),
            ...(description !== undefined ? { description } : {}),
          },
          include: {
            schemaFields: { orderBy: { order: "asc" } },
            tenants: { where: { tenantId: auth.tenantId }, take: 1 },
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Single Type '${updated.name}' updated successfully.\n\n${JSON.stringify(updated, null, 2)}`
          }]
        }
      }
    )

    // ── delete_single_type ───────────────────────────────────────────────────
    server.registerTool(
      "delete_single_type",
      {
        title: "Delete Single Type",
        description: "Permanently delete a Single Type, its schema fields, and its stored content data.",
        inputSchema: {
          singleTypeSlug: z.string().describe("Slug or ID of the Single Type to delete"),
        },
      },
      async ({ singleTypeSlug }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "delete")) return permissionDenied("delete")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const st = await tenantDb.singleType.findFirst({
          where: {
            OR: [
              { slug: singleTypeSlug, tenantId: auth.tenantId },
              { id: singleTypeSlug, tenantId: auth.tenantId },
            ]
          }
        })
        if (!st) return { content: [{ type: "text" as const, text: `❌ Single Type '${singleTypeSlug}' not found.` }] }

        await tenantDb.singleType.delete({ where: { id: st.id } })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Single Type '${st.name}' (slug: '${st.slug}') deleted successfully.`
          }]
        }
      }
    )

    // =========================================================================
    // 5. COMPONENTS (REUSABLE NESTED BLOCKS) CRUD
    // =========================================================================

    // ── list_components ──────────────────────────────────────────────────────
    server.registerTool(
      "list_components",
      {
        title: "List Components",
        description: "List all reusable Components (e.g. Hero Section, Feature Card, FAQ Item, SEO Meta block) with their field schemas.",
        inputSchema: {},
      },
      async () => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const components = await tenantDb.component.findMany({
          where: { tenantId: auth.tenantId },
          include: { schemaFields: { orderBy: { order: "asc" } } },
          orderBy: { name: "asc" },
        })

        const result = components.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          category: c.category,
          description: c.description,
          fields: c.schemaFields.map((f) => ({
            name: f.name,
            slug: f.slug,
            type: f.type,
            required: f.required,
            options: f.options
          })),
        }))

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── create_component ─────────────────────────────────────────────────────
    server.registerTool(
      "create_component",
      {
        title: "Create Component",
        description: "Create a new reusable Component schema definition that can be embedded inside Content Types and Single Types.",
        inputSchema: {
          name: z.string().describe("Display name (e.g. 'Hero Banner', 'Call To Action')"),
          slug: z.string().describe("Slug identifier (e.g. 'hero-banner', 'cta-box')"),
          category: z.string().optional().default("sections").describe("Component category (e.g. 'sections', 'elements', 'meta')"),
          description: z.string().optional().describe("Description of this component"),
          fields: z.array(
            z.object({
              name: z.string(),
              slug: z.string(),
              type: z.string(),
              required: z.boolean().optional().default(false),
              options: z.record(z.string(), z.any()).optional(),
            })
          ).optional().describe("List of component field definitions"),
        },
      },
      async ({ name, slug, category, description, fields }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "-")
        const tenantDb = await getTenantDb(auth.tenantSlug)

        const existing = await tenantDb.component.findFirst({
          where: { tenantId: auth.tenantId, slug: cleanSlug }
        })
        if (existing) return { content: [{ type: "text" as const, text: `❌ Component '${cleanSlug}' already exists.` }] }

        const created = await tenantDb.component.create({
          data: {
            tenantId: auth.tenantId,
            name: name.trim(),
            slug: cleanSlug,
            category: category || "sections",
            description: description || null,
            schemaFields: {
              create: (fields || []).map((f, idx) => ({
                name: f.name,
                slug: f.slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "_"),
                type: f.type,
                required: f.required || false,
                options: f.options || {},
                order: idx,
              }))
            },
            tenants: {
              create: {
                tenantId: auth.tenantId,
              }
            }
          },
          include: {
            schemaFields: { orderBy: { order: "asc" } }
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Component '${created.name}' (slug: '${created.slug}') created successfully.\n\n${JSON.stringify(created, null, 2)}`
          }]
        }
      }
    )

    // ── get_component ────────────────────────────────────────────────────────
    server.registerTool(
      "get_component",
      {
        title: "Get Component",
        description: "Fetch schema fields and metadata for a specific Component.",
        inputSchema: {
          componentSlug: z.string().describe("Slug or ID of the Component (e.g. 'hero-banner', 'cta-box')"),
        },
      },
      async ({ componentSlug }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const c = await tenantDb.component.findFirst({
          where: {
            OR: [
              { slug: componentSlug, tenantId: auth.tenantId },
              { id: componentSlug, tenantId: auth.tenantId },
            ]
          },
          include: { schemaFields: { orderBy: { order: "asc" } } },
        })
        if (!c) return { content: [{ type: "text" as const, text: `❌ Component '${componentSlug}' not found.` }] }

        const result = {
          id: c.id,
          name: c.name,
          slug: c.slug,
          category: c.category,
          description: c.description,
          fields: c.schemaFields.map(f => ({
            id: f.id,
            name: f.name,
            slug: f.slug,
            type: f.type,
            required: f.required,
            options: f.options
          }))
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── update_component ─────────────────────────────────────────────────────
    server.registerTool(
      "update_component",
      {
        title: "Update Component",
        description: "Update an existing Component's name, category, description, or add/replace its schema fields.",
        inputSchema: {
          componentSlug: z.string().describe("Current slug or ID of the Component to update"),
          name: z.string().optional().describe("New display name"),
          category: z.string().optional().describe("New category (e.g. 'sections', 'elements', 'meta')"),
          description: z.string().optional().describe("New description"),
          fields: z.array(
            z.object({
              name: z.string(),
              slug: z.string(),
              type: z.string(),
              required: z.boolean().optional().default(false),
              options: z.record(z.string(), z.any()).optional(),
            })
          ).optional().describe("New list of fields. If provided, replaces the component's field set."),
        },
      },
      async ({ componentSlug, name, category, description, fields }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const c = await tenantDb.component.findFirst({
          where: {
            OR: [
              { slug: componentSlug, tenantId: auth.tenantId },
              { id: componentSlug, tenantId: auth.tenantId },
            ]
          }
        })
        if (!c) return { content: [{ type: "text" as const, text: `❌ Component '${componentSlug}' not found.` }] }

        // Update fields if provided
        if (fields && fields.length > 0) {
          await tenantDb.schemaField.deleteMany({
            where: { componentId: c.id }
          })
          await tenantDb.schemaField.createMany({
            data: fields.map((f, idx) => ({
              componentId: c.id,
              name: f.name,
              slug: f.slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, "_"),
              type: f.type,
              required: f.required || false,
              options: f.options || {},
              order: idx,
            }))
          })
        }

        const updated = await tenantDb.component.update({
          where: { id: c.id },
          data: {
            ...(name ? { name: name.trim() } : {}),
            ...(category ? { category: category.trim() } : {}),
            ...(description !== undefined ? { description } : {}),
          },
          include: {
            schemaFields: { orderBy: { order: "asc" } }
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Component '${updated.name}' updated successfully.\n\n${JSON.stringify(updated, null, 2)}`
          }]
        }
      }
    )

    // ── delete_component ─────────────────────────────────────────────────────
    server.registerTool(
      "delete_component",
      {
        title: "Delete Component",
        description: "Permanently delete a Component and its schema fields.",
        inputSchema: {
          componentSlug: z.string().describe("Slug or ID of the Component to delete"),
        },
      },
      async ({ componentSlug }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "delete")) return permissionDenied("delete")

        const tenantDb = await getTenantDb(auth.tenantSlug)
        const c = await tenantDb.component.findFirst({
          where: {
            OR: [
              { slug: componentSlug, tenantId: auth.tenantId },
              { id: componentSlug, tenantId: auth.tenantId },
            ]
          }
        })
        if (!c) return { content: [{ type: "text" as const, text: `❌ Component '${componentSlug}' not found.` }] }

        await tenantDb.component.delete({ where: { id: c.id } })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Component '${c.name}' (slug: '${c.slug}') deleted successfully.`
          }]
        }
      }
    )

    // =========================================================================
    // 6. WEBHOOKS CRUD & AUTOMATION
    // =========================================================================

    // ── list_webhooks ────────────────────────────────────────────────────────
    server.registerTool(
      "list_webhooks",
      {
        title: "List Webhooks",
        description: "List all configured webhooks, their subscribed events, URLs, and status.",
        inputSchema: {},
      },
      async () => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const webhooks = await db.webhook.findMany({
          where: { tenantId: auth.tenantId },
          orderBy: { createdAt: "desc" },
        })

        const result = webhooks.map((w) => ({
          id: w.id,
          name: w.name,
          url: w.url,
          events: w.events,
          enabled: w.enabled,
          hookType: w.hookType,
          failureCount: w.failureCount,
          lastTriggeredAt: w.lastTriggeredAt,
          createdAt: w.createdAt,
        }))

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      }
    )

    // ── get_webhook ──────────────────────────────────────────────────────────
    server.registerTool(
      "get_webhook",
      {
        title: "Get Webhook",
        description: "Fetch details, subscribed events, endpoint URL, and status of a specific webhook by ID.",
        inputSchema: {
          id: z.string().describe("ID of the webhook to retrieve"),
        },
      },
      async ({ id }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const webhook = await db.webhook.findFirst({
          where: { id, tenantId: auth.tenantId },
        })
        if (!webhook) {
          return {
            content: [{ type: "text" as const, text: `❌ Webhook '${id}' not found.` }],
            isError: true,
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(webhook, null, 2)
          }]
        }
      }
    )

    // ── create_webhook ───────────────────────────────────────────────────────
    server.registerTool(
      "create_webhook",
      {
        title: "Create Webhook",
        description: "Register a new webhook endpoint to receive notifications on CMS events (e.g. 'content.created', 'content.published', 'content.updated', 'content.deleted', 'media.uploaded').",
        inputSchema: {
          name: z.string().describe("Descriptive name (e.g. 'Vercel Deploy Hook', 'Discord Notification')"),
          url: z.string().url().describe("Destination endpoint URL (must start with https:// or http://)"),
          events: z.array(z.string()).describe("Array of event names (e.g. ['content.created', 'content.published', 'content.deleted'])"),
          secret: z.string().optional().describe("Optional HMAC signature secret"),
          enabled: z.boolean().default(true).describe("Whether the webhook is immediately active"),
          hookType: z.enum(["async", "sync"]).default("async").describe("Hook type ('async' background dispatch or 'sync' pre-save validation)"),
        },
      },
      async ({ name, url, events, secret, enabled, hookType }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        try {
          const { assertPublicUrl } = await import("@/lib/safe-url")
          await assertPublicUrl(url.trim())
        } catch (e: any) {
          return { content: [{ type: "text" as const, text: `❌ Webhook URL rejected: ${e?.message || "not allowed"}` }] }
        }

        const webhook = await db.webhook.create({
          data: {
            tenantId: auth.tenantId,
            name: name.trim(),
            url: url.trim(),
            events: events as any,
            secret: secret || null,
            enabled: enabled ?? true,
            hookType: hookType || "async",
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Webhook '${webhook.name}' (ID: '${webhook.id}') created successfully targeting ${webhook.url}.\n\n${JSON.stringify(webhook, null, 2)}`
          }]
        }
      }
    )

    // ── update_webhook ───────────────────────────────────────────────────────
    server.registerTool(
      "update_webhook",
      {
        title: "Update Webhook",
        description: "Update an existing webhook configuration (name, URL, subscribed events, active state).",
        inputSchema: {
          id: z.string().describe("ID of the webhook to update"),
          name: z.string().optional(),
          url: z.string().url().optional(),
          events: z.array(z.string()).optional(),
          enabled: z.boolean().optional(),
          secret: z.string().optional(),
        },
      },
      async ({ id, name, url, events, enabled, secret }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const existing = await db.webhook.findFirst({
          where: { id, tenantId: auth.tenantId }
        })
        if (!existing) return { content: [{ type: "text" as const, text: `❌ Webhook '${id}' not found.` }] }

        if (url) {
          try {
            const { assertPublicUrl } = await import("@/lib/safe-url")
            await assertPublicUrl(url.trim())
          } catch (e: any) {
            return { content: [{ type: "text" as const, text: `❌ Webhook URL rejected: ${e?.message || "not allowed"}` }] }
          }
        }

        const updated = await db.webhook.update({
          where: { id },
          data: {
            ...(name ? { name: name.trim() } : {}),
            ...(url ? { url: url.trim() } : {}),
            ...(events ? { events: events as any } : {}),
            ...(enabled !== undefined ? { enabled } : {}),
            ...(secret !== undefined ? { secret } : {}),
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Webhook '${updated.name}' updated successfully.\n\n${JSON.stringify(updated, null, 2)}`
          }]
        }
      }
    )

    // ── delete_webhook ───────────────────────────────────────────────────────
    server.registerTool(
      "delete_webhook",
      {
        title: "Delete Webhook",
        description: "Permanently delete a webhook configuration and its log history.",
        inputSchema: {
          id: z.string().describe("ID of the webhook to delete"),
        },
      },
      async ({ id }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "delete")) return permissionDenied("delete")

        const existing = await db.webhook.findFirst({
          where: { id, tenantId: auth.tenantId }
        })
        if (!existing) return { content: [{ type: "text" as const, text: `❌ Webhook '${id}' not found.` }] }

        await db.webhook.delete({ where: { id } })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Webhook '${existing.name}' (${existing.url}) deleted successfully.`
          }]
        }
      }
    )

    // ── test_webhook ─────────────────────────────────────────────────────────
    server.registerTool(
      "test_webhook",
      {
        title: "Test Webhook",
        description: "Dispatch a mock test event to a webhook endpoint to verify its connectivity and response status.",
        inputSchema: {
          id: z.string().describe("ID of the webhook to test"),
        },
      },
      async ({ id }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const webhook = await db.webhook.findFirst({
          where: { id, tenantId: auth.tenantId }
        })
        if (!webhook) return { content: [{ type: "text" as const, text: `❌ Webhook '${id}' not found.` }] }

        const testPayload = {
          event: "webhook.test",
          timestamp: new Date().toISOString(),
          workspace: {
            id: auth.tenantId,
            name: auth.tenantName,
            slug: auth.tenantSlug
          },
          message: "This is a test notification from SaCMS MCP Server."
        }

        const start = Date.now()
        try {
          const res = await safeFetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "SaCMS-MCP-Webhook/1.0",
              ...(webhook.secret ? { "X-SaCMS-Signature": "test-signature" } : {}),
            },
            body: JSON.stringify(testPayload),
          })
          const duration = Date.now() - start

          return {
            content: [{
              type: "text" as const,
              text: `✅ Webhook test completed in ${duration}ms with HTTP Status ${res.status} (${res.statusText}).`
            }]
          }
        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Webhook test failed: ${error.message || "Endpoint unreachable"}`
            }]
          }
        }
      }
    )

    // =========================================================================
    // 7. API INFORMATION & CAPABILITY INSPECTOR
    // =========================================================================

    // ── inspect_api_capabilities ─────────────────────────────────────────────
    server.registerTool(
      "inspect_api_capabilities",
      {
        title: "Inspect API Capabilities & Permissions",
        description: "Inspect active API key permissions (read, write, delete) to determine whether to build read-only or interactive dynamic components.",
        inputSchema: {},
      },
      async () => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED

        const permissions = auth.permissions || []
        const canRead = hasScope(auth, "read")
        const canWrite = hasScope(auth, "write")
        const canDelete = hasScope(auth, "delete")
        // Schema tools (content-type/component CRUD) and webhook tools are
        // gated on "write"/"delete" (see hasScope call sites) — the
        // dashboard's token-creation UI only ever grants read/write/delete,
        // so there is no separate grantable "schema"/"webhooks" scope.
        const canModifySchema = canWrite
        const canManageWebhooks = canWrite

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              tenantId: auth.tenantId,
              tenantSlug: auth.tenantSlug,
              tenantName: auth.tenantName,
              permissions,
              capabilities: {
                canRead,
                canWrite,
                canDelete,
                canModifySchema,
                canManageWebhooks,
              },
              recommendedMode: canWrite ? "interactive_fullstack" : "public_consumer",
              description: canWrite 
                ? "Token has write permissions: AI can generate interactive forms, data submissions, and mutations."
                : "Token has read-only permissions: AI should generate public catalog and reading interfaces."
            }, null, 2)
          }]
        }
      }
    )

    // ── get_api_info ─────────────────────────────────────────────────────────
    server.registerTool(
      "get_api_info",
      {
        title: "Get API Information",
        description: "Get the full REST API documentation, endpoints, filtering syntax, and sample integration code for this workspace.",
        inputSchema: {
          baseUrl: z.string().optional().describe("Public base URL of SaCMS (e.g. https://yourdomain.com)"),
        },
      },
      async ({ baseUrl }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED

        const origin = baseUrl?.replace(/\/$/, "") || "https://your-sacms.com"
        const apiBase = `${origin}/api/public/${auth.tenantSlug}`

        const docs = `# SaCMS API & MCP Integration Guide — Workspace: ${auth.tenantName}

## Base URL
${apiBase}

## Authentication Header
Authorization: Bearer YOUR_API_TOKEN

## Public REST Endpoints
- \`GET ${apiBase}/content/{contentTypeSlug}\` — List published collection entries
- \`GET ${apiBase}/content/{contentTypeSlug}/{id}\` — Get single collection entry by ID
- \`GET ${apiBase}/single/{singleTypeSlug}\` — Get single type content data
- \`POST ${apiBase}/graphql\` — Dynamic GraphQL API Endpoint

## Advanced Query & Filtering Operators
- Pagination: \`?pagination[page]=1&pagination[pageSize]=20\`
- Sorting: \`?sort=createdAt:desc\`
- Full-text Search: \`?search=keyword\`
- Field Selection: \`?fields=title,slug,publishedAt\`
- Relations: \`?populate=category,author\`
- Filter Eq: \`?filters[category][$eq]=tech\`
- Filter Contains: \`?filters[title][$contains]=tutorial\`
- Filter In: \`?filters[tags][$in]=news,updates\`

## Sample Next.js 16 Server Component (with ISR)
\`\`\`tsx
export default async function NewsPage() {
  const res = await fetch(\`${apiBase}/content/articles?pagination[pageSize]=10\`, {
    headers: { Authorization: \`Bearer \${process.env.SACMS_TOKEN}\` },
    next: { revalidate: 60 }
  })
  const { data } = await res.json()
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      {data.map((item: any) => (
        <article key={item.id} className="p-4 border rounded-xl">
          <h2 className="text-xl font-bold">{item.title}</h2>
          <p className="text-muted-foreground">{item.excerpt}</p>
        </article>
      ))}
    </main>
  )
}
\`\`\`
`
        return { content: [{ type: "text" as const, text: docs }] }
      }
    )

    // =========================================================================
    // 8. HOSTING & CLOUD DEPLOYMENT TOOLS (VERCEL & CONTABO VPS)
    // =========================================================================

    // ── deploy_to_vercel ─────────────────────────────────────────────────────
    server.registerTool(
      "deploy_to_vercel",
      {
        title: "Deploy Website / App to Vercel",
        description: "Deploy generated website frontend files (Next.js, HTML, React) directly to Vercel Serverless hosting. Returns the live production deployment URL.",
        inputSchema: {
          projectName: z.string().describe("Name of the Vercel project (e.g. 'my-awesome-site')"),
          files: z.array(z.object({
            name: z.string().describe("File path (e.g. 'app/page.tsx', 'index.html', 'styles.css')"),
            content: z.string().describe("Raw source code content of the file")
          })).describe("Array of files to deploy"),
          envVars: z.record(z.string(), z.string()).optional().describe("Extra env vars for this deploy, merged on top of the workspace's saved Environment vars (the SaCMS API URL/tenant/key are always injected automatically)")
        },
      },
      async ({ projectName, files, envVars }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        if (!auth.isPaid) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Payment Required: Fitur deploy Vercel memerlukan workspace berstatus PAID. Silakan selesaikan pembayaran di dashboard: /dashboard/${auth.tenantSlug}/subscriptions`
            }],
            isError: true,
          }
        }

        try {
          // Assemble the workspace's full frontend env (saved Environment
          // vars + fixed SACMS_* connection vars), then let the caller's
          // envVars override any non-reserved key.
          const { resolveFrontendEnv, pushEnvToVercelProject } = await import("@/lib/infrastructure/frontend-env")
          const apiOrigin = process.env.NEXT_PUBLIC_APP_URL || "https://sacms.cloud"
          const resolvedEnv = await resolveFrontendEnv(auth.tenantId, auth.tenantSlug, apiOrigin)
          const mergedEnv: Record<string, string> = { ...(envVars as Record<string, string> | undefined), ...resolvedEnv }

          const result = await deployToVercel(projectName, files, mergedEnv)

          if (result.projectId && !result.simulated) {
            pushEnvToVercelProject(result.projectId, mergedEnv).catch((e) =>
              console.warn("[MCP deploy_to_vercel] env push failed:", e),
            )
          }

          if (auth.tenantId && result.url) {
            try {
              await Promise.all([
                db.tenant.update({
                  where: { id: auth.tenantId },
                  data: {
                    vercelDeploymentUrl: result.url,
                    vercelProjectId: result.projectId || undefined,
                  }
                }),
                db.setting.upsert({
                  where: { key: `${auth.tenantId}_vercelDeploymentUrl` },
                  update: { value: result.url },
                  create: { tenantId: auth.tenantId, key: `${auth.tenantId}_vercelDeploymentUrl`, value: result.url }
                }),
                db.setting.upsert({
                  where: { key: `${auth.tenantId}_vercelProjectId` },
                  update: { value: result.projectId || "" },
                  create: { tenantId: auth.tenantId, key: `${auth.tenantId}_vercelProjectId`, value: result.projectId || "" }
                }),
              ])
            } catch (persistErr) {
              console.warn("[MCP deploy_to_vercel] Failed to persist deployment to database:", persistErr)
            }
          }

          return {
            content: [{
              type: "text" as const,
              text: `🚀 Vercel Deployment Sukses!\n- Deployment ID: ${result.id}\n- Live URL: ${result.url}\n- Status: ${result.state}\n- Project: ${result.projectName || projectName}\n- Env terkirim ke Vercel: ${Object.keys(mergedEnv).join(", ")}`
            }]
          }
        } catch (err: any) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Gagal deploy ke Vercel: ${err.message}`
            }],
            isError: true,
          }
        }
      }
    )

    // ── get_vercel_deployment_status ─────────────────────────────────────────
    server.registerTool(
      "get_vercel_deployment_status",
      {
        title: "Get Vercel Deployment Status",
        description: "Check the build progress, ready state, and live URL of an existing Vercel deployment.",
        inputSchema: {
          deploymentId: z.string().describe("Vercel deployment ID (e.g. 'dpl_xxx')"),
        },
      },
      async ({ deploymentId }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        try {
          const status = await getDeploymentStatus(deploymentId)
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                deploymentId,
                state: status.state,
                url: status.url,
                isReady: status.state === "READY",
              }, null, 2)
            }]
          }
        } catch (err: any) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Error memeriksa status Vercel: ${err.message}`
            }],
            isError: true,
          }
        }
      }
    )

    // ── configure_vercel_domain ──────────────────────────────────────────────
    server.registerTool(
      "configure_vercel_domain",
      {
        title: "Configure Custom Domain on Vercel",
        description: "Attach and verify a custom apex domain or subdomain to a Vercel project with DNS diagnostics.",
        inputSchema: {
          projectId: z.string().describe("Vercel Project ID"),
          domain: z.string().describe("Custom domain name (e.g. 'mysite.com' or 'blog.mysite.com')"),
        },
      },
      async ({ projectId, domain }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        try {
          const result = await addDomainToProject(projectId, domain)
          const config = await getDomainConfig(domain)

          if (auth.tenantId) {
            try {
              await db.setting.upsert({
                where: { key: `${auth.tenantId}_customDomain` },
                update: { value: domain },
                create: { tenantId: auth.tenantId, key: `${auth.tenantId}_customDomain`, value: domain }
              })
            } catch (err) {
              console.warn("[MCP configure_vercel_domain] Failed to save customDomain setting:", err)
            }
          }
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                domain: result.name,
                verified: result.verified,
                verificationRequired: result.verificationRequired,
                dnsConfig: {
                  cnameTarget: config.cname,
                  aRecordTarget: config.aRecord,
                  configured: config.configured,
                  // When set, the check against Vercel itself failed —
                  // `configured: false` above does NOT mean the domain's DNS
                  // is actually wrong, just that we couldn't verify it.
                  checkError: config.error,
                },
                message: config.error
                  ? "⚠️ Domain ditambahkan, tapi pengecekan status DNS ke Vercel gagal — coba cek lagi nanti, ini bukan berarti DNS Anda salah."
                  : result.verified ? "✅ Domain terverifikasi dan aktif!" : "⚠️ Domain ditambahkan, silakan konfigurasi DNS record di registrar domain Anda."
              }, null, 2)
            }]
          }
        } catch (err: any) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Gagal mengonfigurasi domain di Vercel: ${err.message}`
            }],
            isError: true,
          }
        }
      }
    )

    // ── add_vercel_env ──────────────────────────────────────────────────────
    server.registerTool(
      "add_vercel_env",
      {
        title: "Add / Update Vercel Environment Variable",
        description:
          "Create or update an environment variable on this workspace's Vercel project (upsert). " +
          "Values are stored encrypted unless the key is prefixed NEXT_PUBLIC_. The variable also " +
          "shows up in the dashboard's Environment tab and is re-applied on the next SaCMS deploy. " +
          "Note: an existing Vercel deployment must be redeployed for the change to take effect.",
        inputSchema: {
          key: z
            .string()
            .regex(/^[A-Z_][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE (letters, digits, underscore; not starting with a digit)")
            .describe("Variable name, e.g. STRIPE_SECRET_KEY or NEXT_PUBLIC_ANALYTICS_ID"),
          value: z.string().describe("Variable value"),
          projectId: z
            .string()
            .optional()
            .describe("Vercel Project ID. Defaults to this workspace's linked Vercel project."),
          targets: z
            .array(z.enum(["production", "preview", "development"]))
            .optional()
            .describe("Which environments to apply to. Default: all three."),
        },
      },
      async ({ key, value, projectId, targets }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        if (["NEXT_PUBLIC_SACMS_API_URL", "NEXT_PUBLIC_SACMS_TENANT", "SACMS_API_KEY"].includes(key)) {
          return {
            content: [{ type: "text" as const, text: `❌ "${key}" adalah variabel sistem SaCMS dan tidak bisa ditimpa.` }],
            isError: true,
          }
        }

        try {
          let resolvedProjectId = projectId
          if (!resolvedProjectId && auth.tenantId) {
            const row = await db.setting.findFirst({ where: { key: `${auth.tenantId}_vercelProjectId` } })
            resolvedProjectId = row?.value || undefined
          }
          if (!resolvedProjectId) {
            return {
              content: [{
                type: "text" as const,
                text: "❌ Tidak ada Vercel Project ID. Deploy dulu dengan deploy_to_vercel, atau berikan parameter projectId.",
              }],
              isError: true,
            }
          }

          const result = await upsertVercelProjectEnv(
            resolvedProjectId,
            key,
            value,
            targets as VercelEnvTarget[] | undefined,
          )

          // Mirror into the tenant's stored custom env set so the dashboard
          // Environment tab stays in sync and the next SaCMS deploy re-applies it.
          if (auth.tenantId) {
            try {
              const { upsertTenantCustomEnvVar } = await import("@/lib/infrastructure/frontend-env")
              await upsertTenantCustomEnvVar(auth.tenantId, key, value)
            } catch (err) {
              console.warn("[MCP add_vercel_env] Failed to mirror env var into settings:", err)
            }
          }

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                key: result.key,
                type: result.type,
                targets: result.targets,
                action: result.simulated ? "simulated" : result.created ? "created" : "updated",
                projectId: resolvedProjectId,
                message: result.simulated
                  ? "⚠️ VERCEL_ACCESS_TOKEN tidak diset — perubahan disimulasikan (tersimpan di dashboard, belum di Vercel)."
                  : `✅ Variabel "${key}" ${result.created ? "dibuat" : "diperbarui"} di Vercel. Redeploy project agar berlaku.`,
              }, null, 2),
            }],
          }
        } catch (err: any) {
          return {
            content: [{ type: "text" as const, text: `❌ Gagal set env di Vercel: ${err.message}` }],
            isError: true,
          }
        }
      },
    )

    // ── make_vercel_deployment_public ────────────────────────────────────────
    server.registerTool(
      "make_vercel_deployment_public",
      {
        title: "Make Vercel Deployment Publicly Viewable",
        description:
          "Turn off Vercel's 'Vercel Authentication' deployment protection on this workspace's Vercel project, so " +
          "its deployment links (including the per-deployment URL with a random suffix, e.g. " +
          "my-site-abc123-team.vercel.app — not just the clean production alias) can be opened by anyone with the " +
          "link, without needing to log into Vercel. This is a project-wide security setting change — only call it " +
          "when the user explicitly wants the deployment publicly viewable.",
        inputSchema: {
          projectId: z.string().optional().describe("Vercel Project ID. Defaults to this workspace's linked Vercel project."),
        },
      },
      async ({ projectId }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        try {
          let resolvedProjectId = projectId
          if (!resolvedProjectId && auth.tenantId) {
            const row = await db.setting.findFirst({ where: { key: `${auth.tenantId}_vercelProjectId` } })
            resolvedProjectId = row?.value || undefined
          }
          if (!resolvedProjectId) {
            return {
              content: [{
                type: "text" as const,
                text: "❌ Tidak ada Vercel Project ID. Deploy dulu dengan deploy_to_vercel, atau berikan parameter projectId.",
              }],
              isError: true,
            }
          }

          const result = await disableVercelDeploymentProtection(resolvedProjectId)
          if (!result.ok) {
            return {
              content: [{ type: "text" as const, text: `❌ Gagal menonaktifkan proteksi di Vercel: ${result.error}` }],
              isError: true,
            }
          }

          return {
            content: [{
              type: "text" as const,
              text: "✅ Proteksi 'Vercel Authentication' dinonaktifkan. Semua URL deployment project ini (termasuk URL per-deployment dengan akhiran acak) sekarang bisa dibuka siapa saja tanpa login Vercel.",
            }],
          }
        } catch (err: any) {
          return {
            content: [{ type: "text" as const, text: `❌ Gagal menonaktifkan proteksi di Vercel: ${err.message}` }],
            isError: true,
          }
        }
      },
    )

    // ── get_contabo_infrastructure_status ────────────────────────────────────
    server.registerTool(
      "get_contabo_infrastructure_status",
      {
        title: "Get Dedicated Contabo VPS Status",
        description: "Inspect dedicated Contabo VPS appliance health, IP address, CPU/RAM specs, and PostgreSQL/MinIO status for this workspace.",
        inputSchema: {},
      },
      async () => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const serverInfo = await db.infrastructureServer.findFirst({
          where: { tenantId: auth.tenantId },
          orderBy: { createdAt: "desc" }
        })

        if (!serverInfo) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                hasDedicatedVps: false,
                currentPlan: auth.plan,
                message: "Workspace ini menggunakan Shared Vercel Cloud. Upgrade ke paket VPS (vps-s, vps-m, vps-l, enterprise) untuk mengaktifkan Dedicated Contabo VPS Appliance."
              }, null, 2)
            }]
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              hasDedicatedVps: true,
              serverId: serverInfo.id,
              status: serverInfo.status,
              healthStatus: serverInfo.healthStatus,
              hostname: serverInfo.hostname,
              ipv4: serverInfo.ipv4,
              plan: serverInfo.plan,
              cpuCount: serverInfo.cpuCount,
              ramMb: serverInfo.ramMb,
              diskGb: serverInfo.diskGb,
              dbHost: serverInfo.dbHost,
              mediaHost: serverInfo.mediaHost,
              lastHealthCheckAt: serverInfo.lastHealthCheckAt,
            }, null, 2)
          }]
        }
      }
    )

    // ── provision_contabo_vps ────────────────────────────────────────────────
    server.registerTool(
      "provision_contabo_vps",
      {
        title: "Provision Dedicated Contabo VPS Appliance",
        description: "Trigger automated provisioning of a dedicated Contabo VPS (PostgreSQL 17, Redis, MinIO S3) for a paid VPS-tier workspace.",
        inputSchema: {
          plan: z.enum(["vps-s", "vps-m", "vps-l", "vps-xl"]).default("vps-s").describe("Contabo VPS instance size"),
          region: z.enum(["EU", "US-central", "SIN"]).default("EU").describe("Datacenter region"),
        },
      },
      async ({ plan, region }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        if (!auth.isPaid) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Payment Required: Provisioning VPS memerlukan status pembayaran PAID. Silakan bayar invoice langganan di: /dashboard/${auth.tenantSlug}/subscriptions`
            }],
            isError: true,
          }
        }

        const isVpsEligible = auth.plan.startsWith("vps-") || auth.plan === "enterprise"
        if (!isVpsEligible) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Paket workspace Anda saat ini '${auth.plan}' adalah Shared Cloud. Silakan upgrade ke paket VPS di dashboard untuk provisioning dedicated server.`
            }],
            isError: true,
          }
        }

        // Provisioning places a real, billed order on Contabo. Without this
        // check, calling this tool again on a tenant that already has a
        // live/in-progress server would create a second real paid instance
        // with no duplicate guard anywhere else in the stack.
        const existingServer = await db.infrastructureServer.findFirst({
          where: { tenantId: auth.tenantId, status: { in: ["pending", "provisioning", "configuring", "active", "suspended"] } },
          orderBy: { createdAt: "desc" },
        })
        if (existingServer) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Workspace ini sudah memiliki server dedicated (status: ${existingServer.status}, dibuat ${existingServer.createdAt.toISOString()}). Provisioning ulang akan membuat instance Contabo BARU yang ditagih terpisah. Hapus/nonaktifkan server yang ada terlebih dahulu di /dashboard/${auth.tenantSlug}/infrastructure jika Anda benar-benar ingin membuat yang baru.`
            }],
            isError: true,
          }
        }

        try {
          const result = await provisionTenantInfrastructure(auth.tenantId, {
            plan,
            region,
          })
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }]
          }
        } catch (err: any) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Gagal melakukan provisioning Contabo VPS: ${err.message}`
            }],
            isError: true,
          }
        }
      }
    )

    // ─── SECTION 7: MULTI-TENANT END-USERS & MEMBER AUTH ─────────────────────

    // ── list_members ──────────────────────────────────────────────────────────
    server.registerTool(
      "list_members",
      {
        title: "List End-User Members",
        description: "List registered members/end-users for this workspace with filtering by search, role, or status.",
        inputSchema: {
          page: z.number().default(1).describe("Page number (1-based)"),
          pageSize: z.number().default(20).describe("Number of items per page (max 100)"),
          search: z.string().optional().describe("Search keyword for email or name"),
          role: z.string().optional().describe("Filter by member role (e.g. 'member', 'vip', 'subscriber')"),
          status: z.string().optional().describe("Filter by member status (e.g. 'active', 'suspended')"),
        },
      },
      async ({ page, pageSize, search, role, status }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = (await getTenantDb(auth.tenantSlug)) as any
        const limit = Math.min(pageSize || 20, 100)
        const skip = ((page || 1) - 1) * limit

        const where: Record<string, any> = { tenantId: auth.tenantId }
        if (role) where.role = role
        if (status) where.status = status
        if (search) {
          where.OR = [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ]
        }

        const [members, total] = await Promise.all([
          tenantDb.member.findMany({
            where,
            select: {
              id: true,
              email: true,
              name: true,
              avatar: true,
              role: true,
              status: true,
              metadata: true,
              createdAt: true,
              lastLoginAt: true,
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
          }),
          tenantDb.member.count({ where }),
        ])

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              members,
              pagination: {
                page: page || 1,
                pageSize: limit,
                total,
                totalPages: Math.ceil(total / limit),
              }
            }, null, 2)
          }]
        }
      }
    )

    // ── get_member ────────────────────────────────────────────────────────────
    server.registerTool(
      "get_member",
      {
        title: "Get End-User Member",
        description: "Get detailed profile and metadata of a specific end-user member by ID or email.",
        inputSchema: {
          idOrEmail: z.string().describe("Member ID (cuid) or email address"),
        },
      },
      async ({ idOrEmail }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "read")) return permissionDenied("read")

        const tenantDb = (await getTenantDb(auth.tenantSlug)) as any
        const member = await tenantDb.member.findFirst({
          where: {
            tenantId: auth.tenantId,
            OR: [
              { id: idOrEmail },
              { email: idOrEmail.toLowerCase().trim() },
            ]
          },
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
            status: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            lastLoginAt: true,
            sessions: {
              where: { revokedAt: null },
              select: {
                id: true,
                userAgent: true,
                ipAddress: true,
                expiresAt: true,
                createdAt: true,
              },
              take: 5,
            }
          }
        })

        if (!member) {
          return {
            content: [{ type: "text" as const, text: `❌ Member '${idOrEmail}' not found in this workspace.` }],
            isError: true,
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(member, null, 2)
          }]
        }
      }
    )

    // ── create_member ─────────────────────────────────────────────────────────
    server.registerTool(
      "create_member",
      {
        title: "Create End-User Member",
        description: "Programmatically create a new member/end-user for this workspace with bcrypt hashed password.",
        inputSchema: {
          email: z.string().email().describe("Member email address"),
          password: z.string().min(6).describe("Plaintext password (will be hashed with bcrypt 12 rounds)"),
          name: z.string().optional().describe("Full name of the member"),
          role: z.string().default("member").describe("Member role (default 'member', e.g. 'vip', 'subscriber')"),
          metadata: z.record(z.string(), z.any()).optional().describe("Custom JSON metadata/attributes"),
        },
      },
      async ({ email, password, name, role, metadata }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const tenantDb = (await getTenantDb(auth.tenantSlug)) as any
        const cleanEmail = email.toLowerCase().trim()

        const existing = await tenantDb.member.findUnique({
          where: {
            tenantId_email: {
              tenantId: auth.tenantId,
              email: cleanEmail,
            }
          }
        })

        if (existing) {
          return {
            content: [{ type: "text" as const, text: `❌ Member with email '${cleanEmail}' already exists in this workspace.` }],
            isError: true,
          }
        }

        const passwordHash = await hashMemberPassword(password)
        const created = await tenantDb.member.create({
          data: {
            tenantId: auth.tenantId,
            email: cleanEmail,
            passwordHash,
            name: name || null,
            role: role || "member",
            status: "active",
            metadata: metadata || {},
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            metadata: true,
            createdAt: true,
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Member '${created.email}' created successfully.\n\n${JSON.stringify(created, null, 2)}`
          }]
        }
      }
    )

    // ── update_member ─────────────────────────────────────────────────────────
    server.registerTool(
      "update_member",
      {
        title: "Update End-User Member",
        description: "Update an existing member's profile, role, status ('active' | 'suspended'), password, or custom metadata.",
        inputSchema: {
          idOrEmail: z.string().describe("Member ID or email"),
          name: z.string().optional().describe("Updated full name"),
          role: z.string().optional().describe("Updated role (e.g. 'vip', 'subscriber', 'member')"),
          status: z.string().optional().describe("Updated status: 'active' | 'suspended' | 'pending_verification'"),
          password: z.string().min(6).optional().describe("New plaintext password (will be re-hashed)"),
          metadata: z.record(z.string(), z.any()).optional().describe("Custom JSON metadata to merge"),
        },
      },
      async ({ idOrEmail, name, role, status, password, metadata }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "write")) return permissionDenied("write")

        const tenantDb = (await getTenantDb(auth.tenantSlug)) as any
        const member = await tenantDb.member.findFirst({
          where: {
            tenantId: auth.tenantId,
            OR: [
              { id: idOrEmail },
              { email: idOrEmail.toLowerCase().trim() },
            ]
          }
        })

        if (!member) {
          return {
            content: [{ type: "text" as const, text: `❌ Member '${idOrEmail}' not found.` }],
            isError: true,
          }
        }

        const updateData: Record<string, any> = {}
        if (name !== undefined) updateData.name = name
        if (role !== undefined) updateData.role = role
        if (status !== undefined) updateData.status = status
        if (metadata !== undefined) {
          updateData.metadata = {
            ...((member.metadata as Record<string, any>) || {}),
            ...metadata,
          }
        }
        if (password) {
          updateData.passwordHash = await hashMemberPassword(password)
        }

        const updated = await tenantDb.member.update({
          where: { id: member.id },
          data: updateData,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            metadata: true,
            updatedAt: true,
          }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Member '${updated.email}' updated successfully.\n\n${JSON.stringify(updated, null, 2)}`
          }]
        }
      }
    )

    // ── delete_member ─────────────────────────────────────────────────────────
    server.registerTool(
      "delete_member",
      {
        title: "Delete End-User Member",
        description: "Permanently delete an end-user member and invalidate all associated sessions.",
        inputSchema: {
          idOrEmail: z.string().describe("Member ID or email to delete"),
        },
      },
      async ({ idOrEmail }) => {
        const auth = authContext.getStore()
        if (!auth) return UNAUTHORIZED
        if (!hasScope(auth, "delete")) return permissionDenied("delete")

        const tenantDb = (await getTenantDb(auth.tenantSlug)) as any
        const member = await tenantDb.member.findFirst({
          where: {
            tenantId: auth.tenantId,
            OR: [
              { id: idOrEmail },
              { email: idOrEmail.toLowerCase().trim() },
            ]
          }
        })

        if (!member) {
          return {
            content: [{ type: "text" as const, text: `❌ Member '${idOrEmail}' not found.` }],
            isError: true,
          }
        }

        await tenantDb.member.delete({
          where: { id: member.id }
        })

        return {
          content: [{
            type: "text" as const,
            text: `✅ Member '${member.email}' (ID: ${member.id}) deleted successfully.`
          }]
        }
      }
    )
  },
  {
    serverInfo: { name: "sacms-mcp", version: "2.2.0" },
  }
)

// ─── HTTP Request Handlers & Protocol Wrapper ─────────────────────────────────

async function authenticateRequest(req: Request) {
  let token = ""
  const authHeader = req.headers.get("authorization")
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "")
  } else {
    const url = new URL(req.url)
    token = url.searchParams.get("token") || ""
  }

  const auth = await resolveToken(token)
  return auth
}

function patchRequestUrl(req: Request): Request {
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host")
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https"
  
  if (forwardedHost) {
    try {
      const url = new URL(req.url)
      url.host = forwardedHost
      url.port = ""
      url.protocol = forwardedProto ? `${forwardedProto}:` : "https:"
      const newHeaders = new Headers(req.headers)
      newHeaders.set("host", forwardedHost)

      return new Request(url.toString(), {
        method: req.method,
        headers: newHeaders,
        body: req.body,
        duplex: 'half'
      } as any)
    } catch(e) {
      return req
    }
  }
  return req
}

/**
 * Shared by GET/POST/DELETE — the MCP protocol uses all three on the same
 * endpoint, and every request needs the same auth → rate-limit → dispatch
 * sequence. Two rate limits apply, in order:
 *
 *  1. Per client IP, BEFORE authentication — an invalid-token guess still
 *     costs a DB lookup inside resolveToken(), so brute-forcing tokens must
 *     be throttled before that lookup runs, not after.
 *  2. Per tenant, once authenticated, scaled by plan (reusing the same
 *     getTenantRateLimit() tiers the public content API uses) — so even a
 *     valid token can't hammer expensive tools (deploy_to_vercel,
 *     provision_contabo_vps) or the DB without bound.
 */
async function handleMcpRequest(req: Request): Promise<Response> {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown"
    const ipLimit = await rateLimit(`mcp_ip:${ip}`, { limit: 120, windowSeconds: 60 })
    if (!ipLimit.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 })
    }

    const auth = await authenticateRequest(req)
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Invalid or missing API token." }, { status: 401 })
    }
    if (auth.paymentError) {
      return NextResponse.json({
        error: auth.paymentError,
        code: "PAYMENT_REQUIRED",
        plan: auth.plan,
        upgradeUrl: `/dashboard/${auth.tenantSlug}/subscriptions`
      }, { status: 402 })
    }

    const tenantLimit = await rateLimit(`mcp_tenant:${auth.tenantId}`, getTenantRateLimit(auth.plan))
    if (!tenantLimit.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded for this workspace. Try again later." },
        { status: 429 },
      )
    }

    const patchedReq = patchRequestUrl(req)
    return await authContext.run(auth, () => handler(patchedReq))
  } catch (error: any) {
    console.error("MCP Error:", error)
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return handleMcpRequest(req)
}

export async function POST(req: Request) {
  return handleMcpRequest(req)
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req)
}
