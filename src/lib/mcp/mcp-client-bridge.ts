/**
 * In-Process MCP Client Bridge for SaCMS AI Website Builder
 *
 * Allows server-side AI agents and Builder workflows to directly invoke
 * the SaCMS MCP tool suite without HTTP latency or token roundtrips.
 */

import { db, getTenantDb } from "@/lib/database"
import { triggerWebhooks } from "@/lib/webhooks"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { FIELD_TYPES } from "@/lib/field-types"
import { hashMemberPassword } from "@/lib/member-auth"

export interface SchemaFieldInput {
  name: string
  slug: string
  type: string
  required?: boolean
  unique?: boolean
  relationSlug?: string
  options?: any
  order?: number
}

export interface ContentTypeInput {
  name: string
  slug: string
  description?: string
  fields: SchemaFieldInput[]
}

export interface SingleTypeInput {
  name: string
  slug: string
  description?: string
  fields: SchemaFieldInput[]
}

export interface ComponentInput {
  name: string
  slug: string
  description?: string
  category?: string
  fields: SchemaFieldInput[]
}

export interface ContentEntryInput {
  contentTypeSlug: string
  data: Record<string, any>
  status?: "DRAFT" | "PUBLISHED"
  locale?: string
}

export class McpClientBridge {
  constructor(
    public readonly tenantId: string,
    public readonly tenantSlug: string,
    public readonly userId?: string
  ) {}

  private async getDb() {
    return await getTenantDb(this.tenantSlug)
  }

  /**
   * Resolve the default locale for this tenant (instead of hardcoding "en")
   */
  private async getDefaultLocale(): Promise<string> {
    try {
      const tenantDb = await this.getDb()
      const defaultLocale = await tenantDb.tenantLocale.findFirst({
        where: { tenantId: this.tenantId, isDefault: true },
      })
      return defaultLocale?.locale ?? "id"
    } catch {
      return "id"
    }
  }

  /**
   * 1. Get complete workspace schema (Content Types, Single Types, Components)
   */
  async getFullSchema() {
    const tenantDb = await this.getDb()
    const [contentTypes, singleTypes, components] = await Promise.all([
      tenantDb.contentType.findMany({
        where: { tenantId: this.tenantId },
        include: { schemaFields: { orderBy: { order: "asc" } } },
      }),
      tenantDb.singleType.findMany({
        where: { tenantId: this.tenantId },
        include: { 
          schemaFields: { orderBy: { order: "asc" } },
          tenants: { where: { tenantId: this.tenantId }, take: 1 }
        },
      }),
      tenantDb.component.findMany({
        where: { tenantId: this.tenantId },
        include: { schemaFields: { orderBy: { order: "asc" } } },
      }),
    ])

    const mapFields = (fields: any[]) =>
      fields.map((f) => ({
        name: f.name,
        slug: f.slug,
        type: f.type,
        required: f.required,
        unique: f.unique,
        localizable: f.localizable,
        ...(f.relationSlug ? { relationSlug: f.relationSlug } : {}),
        ...(f.options ? { options: f.options } : {}),
      }))

    return {
      workspace: { id: this.tenantId, slug: this.tenantSlug },
      contentTypes: contentTypes.map((ct) => ({
        id: ct.id,
        name: ct.name,
        slug: ct.slug,
        description: ct.description,
        fields: mapFields(ct.schemaFields),
      })),
      singleTypes: singleTypes.map((st) => ({
        id: st.id,
        name: st.name,
        slug: st.slug,
        description: st.description,
        hasData: !!st.tenants[0]?.data,
        data: st.tenants[0]?.data || null,
        fields: mapFields(st.schemaFields),
      })),
      components: components.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        category: c.category,
        description: c.description,
        fields: mapFields(c.schemaFields),
      })),
    }
  }

  /**
   * 2. Create a new Content Type (Collection)
   */
  async createContentType(input: ContentTypeInput) {
    const tenantDb = await this.getDb()
    const existing = await tenantDb.contentType.findFirst({
      where: { tenantId: this.tenantId, slug: input.slug },
    })
    if (existing) {
      return { success: false, error: `ContentType with slug '${input.slug}' already exists`, item: existing }
    }

    const created = await tenantDb.contentType.create({
      data: {
        tenantId: this.tenantId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        isPublished: true,
        schemaFields: {
          create: input.fields.map((f, i) => ({
            name: f.name,
            slug: f.slug,
            type: f.type,
            required: f.required ?? false,
            unique: f.unique ?? false,
            relationSlug: f.relationSlug,
            options: f.options ?? undefined,
            order: f.order ?? i,
          })),
        },
      },
      include: { schemaFields: true },
    })

    // Fire webhook & audit log for schema creation
    triggerWebhooks(this.tenantId, "content_type.created", { contentType: { id: created.id, slug: created.slug, name: created.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "content_type.created", entity: "ContentType", entityId: created.id, data: { slug: created.slug, fieldsCount: input.fields.length, source: "ai_builder_mcp" } })

    return { success: true, item: created }
  }

  /**
   * 3. Update Content Type
   */
  async updateContentType(input: { slug: string; name?: string; description?: string; fields?: SchemaFieldInput[] }) {
    const tenantDb = await this.getDb()
    const ct = await tenantDb.contentType.findFirst({
      where: {
        OR: [
          { slug: input.slug, tenantId: this.tenantId },
          { id: input.slug, tenantId: this.tenantId },
        ]
      }
    })
    if (!ct) {
      return { success: false, error: `ContentType '${input.slug}' not found` }
    }

    if (input.fields && input.fields.length > 0) {
      await tenantDb.schemaField.deleteMany({
        where: { contentTypeId: ct.id }
      })
      await tenantDb.schemaField.createMany({
        data: input.fields.map((f, i) => ({
          contentTypeId: ct.id,
          name: f.name,
          slug: f.slug,
          type: f.type,
          required: f.required ?? false,
          unique: f.unique ?? false,
          relationSlug: f.relationSlug,
          options: f.options ?? undefined,
          order: f.order ?? i,
        }))
      })
    }

    const updated = await tenantDb.contentType.update({
      where: { id: ct.id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: { schemaFields: true },
    })

    triggerWebhooks(this.tenantId, "content_type.updated", { contentType: { id: updated.id, slug: updated.slug, name: updated.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "content_type.updated", entity: "ContentType", entityId: updated.id, data: { slug: updated.slug, source: "ai_builder_mcp" } })

    return { success: true, item: updated }
  }

  /**
   * 4. Create a Single Type (One-off page)
   */
  async createSingleType(input: SingleTypeInput) {
    const tenantDb = await this.getDb()
    const existing = await tenantDb.singleType.findFirst({
      where: { tenantId: this.tenantId, slug: input.slug },
    })
    if (existing) {
      return { success: false, error: `SingleType with slug '${input.slug}' already exists`, item: existing }
    }

    const created = await tenantDb.singleType.create({
      data: {
        tenantId: this.tenantId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        isPublished: true,
        schemaFields: {
          create: input.fields.map((f, i) => ({
            name: f.name,
            slug: f.slug,
            type: f.type,
            required: f.required ?? false,
            unique: f.unique ?? false,
            relationSlug: f.relationSlug,
            options: f.options ?? undefined,
            order: f.order ?? i,
          })),
        },
      },
      include: { schemaFields: true },
    })

    // Fire webhook & audit log for single type creation
    triggerWebhooks(this.tenantId, "single_type.created", { singleType: { id: created.id, slug: created.slug, name: created.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "single_type.created", entity: "SingleType", entityId: created.id, data: { slug: created.slug, fieldsCount: input.fields.length, source: "ai_builder_mcp" } })

    return { success: true, item: created }
  }

  /**
   * 5. Update Single Type (Name, Description, Fields Schema)
   */
  async updateSingleType(input: { singleTypeSlug: string; name?: string; description?: string; fields?: SchemaFieldInput[] }) {
    const tenantDb = await this.getDb()
    const st = await tenantDb.singleType.findFirst({
      where: {
        OR: [
          { slug: input.singleTypeSlug, tenantId: this.tenantId },
          { id: input.singleTypeSlug, tenantId: this.tenantId },
        ]
      }
    })
    if (!st) {
      return { success: false, error: `SingleType '${input.singleTypeSlug}' not found` }
    }

    if (input.fields && input.fields.length > 0) {
      await tenantDb.schemaField.deleteMany({
        where: { singleTypeId: st.id }
      })
      await tenantDb.schemaField.createMany({
        data: input.fields.map((f, i) => ({
          singleTypeId: st.id,
          name: f.name,
          slug: f.slug,
          type: f.type,
          required: f.required ?? false,
          unique: f.unique ?? false,
          options: f.options ?? undefined,
          order: f.order ?? i,
        }))
      })
    }

    const updated = await tenantDb.singleType.update({
      where: { id: st.id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: { schemaFields: true },
    })

    triggerWebhooks(this.tenantId, "single_type.updated", { singleType: { id: updated.id, slug: updated.slug, name: updated.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "single_type.updated", entity: "SingleType", entityId: updated.id, data: { slug: updated.slug, source: "ai_builder_mcp" } })

    return { success: true, item: updated }
  }

  /**
   * 6. Get Component
   */
  async getComponent(slug: string) {
    const tenantDb = await this.getDb()
    const component = await tenantDb.component.findFirst({
      where: {
        OR: [
          { slug, tenantId: this.tenantId },
          { id: slug, tenantId: this.tenantId },
        ]
      },
      include: { schemaFields: { orderBy: { order: "asc" } } },
    })
    if (!component) {
      return { success: false, error: `Component '${slug}' not found` }
    }
    return { success: true, item: component }
  }

  /**
   * 7. Create a Component (Reusable block)
   */
  async createComponent(input: ComponentInput) {
    const tenantDb = await this.getDb()
    const existing = await tenantDb.component.findFirst({
      where: { tenantId: this.tenantId, slug: input.slug },
    })
    if (existing) {
      return { success: false, error: `Component with slug '${input.slug}' already exists`, item: existing }
    }

    const created = await tenantDb.component.create({
      data: {
        tenantId: this.tenantId,
        name: input.name,
        slug: input.slug,
        category: input.category || "default",
        description: input.description,
        schemaFields: {
          create: input.fields.map((f, i) => ({
            name: f.name,
            slug: f.slug,
            type: f.type,
            required: f.required ?? false,
            unique: f.unique ?? false,
            relationSlug: f.relationSlug,
            options: f.options ?? undefined,
            order: f.order ?? i,
          })),
        },
      },
      include: { schemaFields: true },
    })

    // Fire webhook & audit log for component creation
    triggerWebhooks(this.tenantId, "component.created", { component: { id: created.id, slug: created.slug, name: created.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "component.created", entity: "Component", entityId: created.id, data: { slug: created.slug, source: "ai_builder_mcp" } })

    return { success: true, item: created }
  }

  /**
   * 8. Update Component (Name, Category, Description, Fields Schema)
   */
  async updateComponent(input: { componentSlug: string; name?: string; category?: string; description?: string; fields?: SchemaFieldInput[] }) {
    const tenantDb = await this.getDb()
    const c = await tenantDb.component.findFirst({
      where: {
        OR: [
          { slug: input.componentSlug, tenantId: this.tenantId },
          { id: input.componentSlug, tenantId: this.tenantId },
        ]
      }
    })
    if (!c) {
      return { success: false, error: `Component '${input.componentSlug}' not found` }
    }

    if (input.fields && input.fields.length > 0) {
      await tenantDb.schemaField.deleteMany({
        where: { componentId: c.id }
      })
      await tenantDb.schemaField.createMany({
        data: input.fields.map((f, i) => ({
          componentId: c.id,
          name: f.name,
          slug: f.slug,
          type: f.type,
          required: f.required ?? false,
          unique: f.unique ?? false,
          options: f.options ?? undefined,
          order: f.order ?? i,
        }))
      })
    }

    const updated = await tenantDb.component.update({
      where: { id: c.id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.category ? { category: input.category.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: { schemaFields: true },
    })

    triggerWebhooks(this.tenantId, "component.updated", { component: { id: updated.id, slug: updated.slug, name: updated.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "component.updated", entity: "Component", entityId: updated.id, data: { slug: updated.slug, source: "ai_builder_mcp" } })

    return { success: true, item: updated }
  }

  /**
   * 5. Populate initial mock / live content entry
   */
  async createContentEntry(input: ContentEntryInput) {
    const tenantDb = await this.getDb()
    const ct = await tenantDb.contentType.findFirst({
      where: { tenantId: this.tenantId, slug: input.contentTypeSlug },
    })
    if (!ct) {
      return { success: false, error: `ContentType '${input.contentTypeSlug}' not found` }
    }

    // Resolve default locale from TenantLocale instead of hardcoding "en"
    const resolvedLocale = input.locale || await this.getDefaultLocale()

    const entry = await tenantDb.contentEntry.create({
      data: {
        tenantId: this.tenantId,
        contentTypeId: ct.id,
        data: input.data,
        status: input.status || "PUBLISHED",
        locale: resolvedLocale,
        publishedAt: input.status === "DRAFT" ? null : new Date(),
      },
    })

    // Fire webhook & audit log for content creation
    triggerWebhooks(this.tenantId, "content.created", { entry: { id: entry.id, contentType: input.contentTypeSlug, status: entry.status } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: AuditAction.CONTENT_CREATED, entity: "ContentEntry", entityId: entry.id, data: { contentType: input.contentTypeSlug, locale: resolvedLocale, source: "ai_builder_mcp" } })

    return { success: true, entry }
  }

  /**
   * 6. Create Webhook
   */
  async createWebhook(input: { name: string; url: string; events: string[] }) {
    const tenantDb = await this.getDb()
    const webhook = await tenantDb.webhook.create({
      data: {
        tenantId: this.tenantId,
        name: input.name,
        url: input.url,
        events: input.events || ["content.created", "content.updated", "content.deleted"],
        enabled: true,
      }
    })
    return { success: true, webhook }
  }

  /**
   * 7. Inspect API Key & Token Permissions / Capabilities
   */
  async inspectApiCapabilities(apiKey?: string) {
    const tenantDb = await this.getDb()
    if (!apiKey) {
      // Default generated token capability for the AI Builder
      return {
        mode: "full_access",
        permissions: ["read", "write", "delete", "schema", "webhooks", "mcp"],
        canRead: true,
        canWrite: true,
        canDelete: true,
        canModifySchema: true,
        description: "Full read-write-delete access for AI-generated dynamic components and interactive workflows",
      }
    }

    const token = await tenantDb.apiToken.findFirst({
      where: {
        tenantId: this.tenantId,
        token: apiKey,
      }
    })

    if (!token) {
      return {
        mode: "read_only",
        permissions: ["read"],
        canRead: true,
        canWrite: false,
        canDelete: false,
        canModifySchema: false,
        description: "Public read-only consumer access",
      }
    }

    const perms: string[] = Array.isArray(token.permissions) ? (token.permissions as string[]) : []
    return {
      tokenId: token.id,
      name: token.name,
      permissions: perms,
      canRead: perms.includes("read") || perms.includes("full_access"),
      canWrite: perms.includes("write") || perms.includes("full_access"),
      canDelete: perms.includes("delete") || perms.includes("full_access"),
      canModifySchema: perms.includes("schema") || perms.includes("full_access"),
      description: `Token with permissions: ${perms.join(", ")}`,
    }
  }

  /**
   * 8. Get complete project context for AI Website Generator
   */
  async getProjectContext() {
    const tenantDb = await this.getDb()
    const [tenant, schema, defaultLocale] = await Promise.all([
      tenantDb.tenant.findUnique({
        where: { id: this.tenantId },
        select: { id: true, name: true, slug: true, brandName: true, brandLogo: true, primaryColor: true }
      }),
      this.getFullSchema(),
      this.getDefaultLocale(),
    ])

    return {
      tenant,
      schema,
      defaultLocale,
      apiBaseUrl: `/api/public/${this.tenantSlug}`,
      mcpBaseUrl: `/api/mcp`,
    }
  }

  /**
   * 9. Apply full generated schema (Content Types, Single Types, Components, and Dummy Data)
   */
  async applyGeneratedSchema(schema: {
    contentTypes?: Array<{
      name: string
      slug: string
      description?: string
      fields: Array<{ name: string; slug: string; type: string; required?: boolean; unique?: boolean; relationSlug?: string; componentSlug?: string; options?: any }>
      dummyData?: Record<string, any>[]
    }>
    singleTypes?: Array<{
      name: string
      slug: string
      description?: string
      fields: Array<{ name: string; slug: string; type: string; required?: boolean; unique?: boolean; relationSlug?: string; componentSlug?: string; options?: any }>
      dummyData?: Record<string, any>
    }>
    components?: Array<{
      name: string
      slug: string
      description?: string
      category?: string
      fields: Array<{ name: string; slug: string; type: string; required?: boolean; unique?: boolean }>
    }>
  }) {
    const tenantDb = await this.getDb()
    const results = {
      contentTypesCreated: 0,
      singleTypesCreated: 0,
      componentsCreated: 0,
      entriesCreated: 0,
    }

    // 1. Create Components
    for (const comp of schema.components || []) {
      const res = await this.createComponent({
        name: comp.name,
        slug: comp.slug,
        description: comp.description,
        category: comp.category,
        fields: comp.fields,
      })
      if (res.success) results.componentsCreated++
    }

    // 2. Create Content Types and seed dummyData
    for (const ct of schema.contentTypes || []) {
      const res = await this.createContentType({
        name: ct.name,
        slug: ct.slug,
        description: ct.description,
        fields: ct.fields,
      })
      if (res.success) {
        results.contentTypesCreated++
      }

      // Seed dummy entries if provided and collection is empty
      if (Array.isArray(ct.dummyData) && ct.dummyData.length > 0) {
        const existingCount = await tenantDb.contentEntry.count({
          where: { tenantId: this.tenantId, contentType: { slug: ct.slug } },
        })
        if (existingCount === 0) {
          for (const item of ct.dummyData) {
            await this.createContentEntry({
              contentTypeSlug: ct.slug,
              data: item,
              status: "PUBLISHED",
            })
            results.entriesCreated++
          }
        }
      }
    }

    // 3. Create Single Types and seed dummyData
    const resolvedLocale = await this.getDefaultLocale()
    for (const st of schema.singleTypes || []) {
      const res = await this.createSingleType({
        name: st.name,
        slug: st.slug,
        description: st.description,
        fields: st.fields,
      })
      if (res.success) {
        results.singleTypesCreated++
      }

      // Seed initial single type data assignment
      const singleData = Array.isArray(st.dummyData) ? st.dummyData[0] : st.dummyData
      const singleTypeId = res.item ? (res.item as any).id : null
      if (singleData && typeof singleData === "object" && singleTypeId) {
        await tenantDb.tenantSingleTypeAssignment.upsert({
          where: { tenantId_singleTypeId_locale: { tenantId: this.tenantId, singleTypeId, locale: resolvedLocale } },
          create: { tenantId: this.tenantId, singleTypeId, locale: resolvedLocale, data: singleData, enabled: true },
          update: { data: singleData },
        })
      }
    }

    return results
  }

  /** List content types */
  async listContentTypes() {
    const tenantDb = await this.getDb()
    const contentTypes = await tenantDb.contentType.findMany({
      where: { tenantId: this.tenantId },
      include: {
        schemaFields: { orderBy: { order: "asc" } },
        _count: { select: { entries: true } },
      },
      orderBy: { name: "asc" },
    })
    return contentTypes.map((ct) => ({
      id: ct.id,
      name: ct.name,
      slug: ct.slug,
      description: ct.description,
      entryCount: ct._count.entries,
      fields: ct.schemaFields,
    }))
  }

  /** Get content type */
  async getContentType(slug: string) {
    const tenantDb = await this.getDb()
    const ct = await tenantDb.contentType.findFirst({
      where: {
        OR: [
          { slug, tenantId: this.tenantId },
          { id: slug, tenantId: this.tenantId },
        ],
      },
      include: {
        schemaFields: { orderBy: { order: "asc" } },
        _count: { select: { entries: true } },
      },
    })
    if (!ct) return { success: false, error: `Content Type '${slug}' not found` }
    return {
      id: ct.id,
      name: ct.name,
      slug: ct.slug,
      description: ct.description,
      entryCount: ct._count.entries,
      fields: ct.schemaFields,
    }
  }

  /** Delete content type */
  async deleteContentType(slug: string) {
    const tenantDb = await this.getDb()
    const ct = await tenantDb.contentType.findFirst({
      where: {
        OR: [
          { slug, tenantId: this.tenantId },
          { id: slug, tenantId: this.tenantId },
        ],
      },
    })
    if (!ct) return { success: false, error: `Content Type '${slug}' not found` }
    await tenantDb.contentType.delete({ where: { id: ct.id } })
    triggerWebhooks(this.tenantId, "content_type.deleted", { contentType: { id: ct.id, slug: ct.slug, name: ct.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "content_type.deleted", entity: "ContentType", entityId: ct.id, data: { slug: ct.slug } })
    return { success: true, message: `Content Type '${ct.name}' deleted successfully.` }
  }

  /** Query content entries */
  async queryContent(input: { contentTypeSlug: string; limit?: number; page?: number; status?: string; search?: string; locale?: string }) {
    const tenantDb = await this.getDb()
    const ct = await tenantDb.contentType.findFirst({
      where: {
        OR: [
          { slug: input.contentTypeSlug, tenantId: this.tenantId },
          { id: input.contentTypeSlug, tenantId: this.tenantId },
        ],
      },
    })
    if (!ct) return { success: false, error: `Content Type '${input.contentTypeSlug}' not found` }

    const safeLimit = Math.min(input.limit ?? 10, 100)
    const safePage = Math.max(input.page ?? 1, 1)
    const whereClause: any = {
      contentTypeId: ct.id,
      tenantId: this.tenantId,
    }
    if (input.status && input.status !== "ALL") {
      whereClause.status = input.status
    }
    if (input.locale) {
      whereClause.locale = input.locale
    }

    const [entries, total] = await Promise.all([
      tenantDb.contentEntry.findMany({
        where: whereClause,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: { createdAt: "desc" },
      }),
      tenantDb.contentEntry.count({ where: whereClause }),
    ])

    return {
      contentType: ct.slug,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
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
  }

  /** Get content entry by ID */
  async getContentEntry(id: string) {
    const tenantDb = await this.getDb()
    const entry = await tenantDb.contentEntry.findFirst({
      where: { id, tenantId: this.tenantId },
      include: { contentType: { select: { id: true, name: true, slug: true } } },
    })
    if (!entry) return { success: false, error: `Content entry '${id}' not found` }
    return {
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
  }

  /** Update content entry */
  async updateContentEntry(input: { id: string; data?: Record<string, any>; status?: any }) {
    const tenantDb = await this.getDb()
    const existing = await tenantDb.contentEntry.findFirst({
      where: { id: input.id, tenantId: this.tenantId },
    })
    if (!existing) return { success: false, error: `Content entry '${input.id}' not found` }

    const existingData = typeof existing.data === "object" && existing.data !== null ? existing.data : {}
    const mergedData = input.data ? { ...existingData, ...input.data } : existingData

    const updated = await tenantDb.contentEntry.update({
      where: { id: input.id },
      data: {
        data: mergedData,
        ...(input.status ? { status: input.status } : {}),
        ...(input.status === "PUBLISHED" && !existing.publishedAt ? { publishedAt: new Date() } : {}),
      },
    })
    triggerWebhooks(this.tenantId, "content.updated", { entry: { id: updated.id, status: updated.status } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: AuditAction.CONTENT_UPDATED, entity: "ContentEntry", entityId: updated.id })
    return { success: true, entry: updated }
  }

  /** Delete content entry */
  async deleteContentEntry(id: string) {
    const tenantDb = await this.getDb()
    const existing = await tenantDb.contentEntry.findFirst({
      where: { id, tenantId: this.tenantId },
    })
    if (!existing) return { success: false, error: `Content entry '${id}' not found` }
    await tenantDb.contentEntry.delete({ where: { id } })
    triggerWebhooks(this.tenantId, "content.deleted", { entry: { id } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: AuditAction.CONTENT_DELETED, entity: "ContentEntry", entityId: id })
    return { success: true, message: `Content entry '${id}' deleted successfully.` }
  }

  /** List single types */
  async listSingleTypes() {
    const tenantDb = await this.getDb()
    const singleTypes = await tenantDb.singleType.findMany({
      where: { tenantId: this.tenantId },
      include: {
        schemaFields: { orderBy: { order: "asc" } },
        tenants: { where: { tenantId: this.tenantId }, take: 1 },
      },
      orderBy: { name: "asc" },
    })
    return singleTypes.map((st) => ({
      id: st.id,
      name: st.name,
      slug: st.slug,
      description: st.description,
      hasData: !!st.tenants[0]?.data,
      data: st.tenants[0]?.data || null,
      fields: st.schemaFields,
    }))
  }

  /** Get single type */
  async getSingleType(slug: string, locale?: string) {
    const tenantDb = await this.getDb()
    const targetLocale = locale || await this.getDefaultLocale()
    const st = await tenantDb.singleType.findFirst({
      where: {
        OR: [
          { slug, tenantId: this.tenantId },
          { id: slug, tenantId: this.tenantId },
        ],
      },
      include: {
        schemaFields: { orderBy: { order: "asc" } },
        tenants: { where: { tenantId: this.tenantId } },
      },
    })
    if (!st) return { success: false, error: `SingleType '${slug}' not found` }
    const assignment = st.tenants.find((t) => t.locale === targetLocale) || st.tenants[0]
    return {
      singleType: {
        id: st.id,
        name: st.name,
        slug: st.slug,
        description: st.description,
        fields: st.schemaFields,
      },
      locale: assignment?.locale || targetLocale,
      data: assignment?.data || {},
    }
  }

  /** Update single type content */
  async updateSingleTypeContent(input: { singleTypeSlug: string; data: Record<string, any>; locale?: string }) {
    const tenantDb = await this.getDb()
    const targetLocale = input.locale || await this.getDefaultLocale()
    const st = await tenantDb.singleType.findFirst({
      where: {
        OR: [
          { slug: input.singleTypeSlug, tenantId: this.tenantId },
          { id: input.singleTypeSlug, tenantId: this.tenantId },
        ],
      },
    })
    if (!st) return { success: false, error: `SingleType '${input.singleTypeSlug}' not found` }

    const assignment = await tenantDb.tenantSingleTypeAssignment.upsert({
      where: {
        tenantId_singleTypeId_locale: {
          tenantId: this.tenantId,
          singleTypeId: st.id,
          locale: targetLocale,
        },
      },
      update: {
        data: input.data || {},
        publishedAt: new Date(),
      },
      create: {
        tenantId: this.tenantId,
        singleTypeId: st.id,
        locale: targetLocale,
        data: input.data || {},
        publishedAt: new Date(),
      },
    })
    return { success: true, assignment }
  }

  /** Delete single type */
  async deleteSingleType(slug: string) {
    const tenantDb = await this.getDb()
    const st = await tenantDb.singleType.findFirst({
      where: {
        OR: [
          { slug, tenantId: this.tenantId },
          { id: slug, tenantId: this.tenantId },
        ],
      },
    })
    if (!st) return { success: false, error: `SingleType '${slug}' not found` }
    await tenantDb.singleType.delete({ where: { id: st.id } })
    triggerWebhooks(this.tenantId, "single_type.deleted", { singleType: { id: st.id, slug: st.slug, name: st.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "single_type.deleted", entity: "SingleType", entityId: st.id, data: { slug: st.slug } })
    return { success: true, message: `SingleType '${st.name}' deleted successfully.` }
  }

  /** List components */
  async listComponents() {
    const tenantDb = await this.getDb()
    const components = await tenantDb.component.findMany({
      where: { tenantId: this.tenantId },
      include: { schemaFields: { orderBy: { order: "asc" } } },
      orderBy: { name: "asc" },
    })
    return components.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      category: c.category,
      description: c.description,
      fields: c.schemaFields,
    }))
  }

  /** Delete component */
  async deleteComponent(slug: string) {
    const tenantDb = await this.getDb()
    const c = await tenantDb.component.findFirst({
      where: {
        OR: [
          { slug, tenantId: this.tenantId },
          { id: slug, tenantId: this.tenantId },
        ],
      },
    })
    if (!c) return { success: false, error: `Component '${slug}' not found` }
    await tenantDb.component.delete({ where: { id: c.id } })
    triggerWebhooks(this.tenantId, "component.deleted", { component: { id: c.id, slug: c.slug, name: c.name } })
    logAudit({ tenantId: this.tenantId, userId: this.userId, action: "component.deleted", entity: "Component", entityId: c.id, data: { slug: c.slug } })
    return { success: true, message: `Component '${c.name}' deleted successfully.` }
  }

  /** List webhooks */
  async listWebhooks() {
    const webhooks = await db.webhook.findMany({
      where: { tenantId: this.tenantId },
      orderBy: { createdAt: "desc" },
    })
    return webhooks
  }

  /** Get webhook */
  async getWebhook(id: string) {
    const webhook = await db.webhook.findFirst({
      where: { id, tenantId: this.tenantId },
    })
    if (!webhook) return { success: false, error: `Webhook '${id}' not found` }
    return webhook
  }

  /** Update webhook */
  async updateWebhook(input: { id: string; name?: string; url?: string; events?: string[]; enabled?: boolean }) {
    const existing = await db.webhook.findFirst({
      where: { id: input.id, tenantId: this.tenantId },
    })
    if (!existing) return { success: false, error: `Webhook '${input.id}' not found` }

    const updated = await db.webhook.update({
      where: { id: input.id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.url ? { url: input.url.trim() } : {}),
        ...(input.events ? { events: input.events as any } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    })
    return { success: true, webhook: updated }
  }

  /** Delete webhook */
  async deleteWebhook(id: string) {
    const existing = await db.webhook.findFirst({
      where: { id, tenantId: this.tenantId },
    })
    if (!existing) return { success: false, error: `Webhook '${id}' not found` }
    await db.webhook.delete({ where: { id } })
    return { success: true, message: `Webhook '${existing.name}' deleted successfully.` }
  }

  /** List members */
  async listMembers(input: { page?: number; pageSize?: number; search?: string; role?: string; status?: string } = {}) {
    const tenantDb = (await this.getDb()) as any
    const limit = Math.min(input.pageSize || 20, 100)
    const skip = ((input.page || 1) - 1) * limit
    const where: Record<string, any> = { tenantId: this.tenantId }
    if (input.role) where.role = input.role
    if (input.status) where.status = input.status
    if (input.search) {
      where.OR = [
        { email: { contains: input.search, mode: "insensitive" } },
        { name: { contains: input.search, mode: "insensitive" } },
      ]
    }
    const [members, total] = await Promise.all([
      tenantDb.member.findMany({
        where,
        select: { id: true, email: true, name: true, avatar: true, role: true, status: true, metadata: true, createdAt: true, lastLoginAt: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      tenantDb.member.count({ where }),
    ])
    return {
      members,
      pagination: {
        page: input.page || 1,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  /** Get member */
  async getMember(idOrEmail: string) {
    const tenantDb = (await this.getDb()) as any
    const member = await tenantDb.member.findFirst({
      where: {
        tenantId: this.tenantId,
        OR: [
          { id: idOrEmail },
          { email: idOrEmail.toLowerCase().trim() },
        ],
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
      },
    })
    if (!member) return { success: false, error: `Member '${idOrEmail}' not found` }
    return member
  }

  /** Create member */
  async createMember(input: { email: string; password: string; name?: string; role?: string; metadata?: any }) {
    const tenantDb = (await this.getDb()) as any
    const cleanEmail = input.email.toLowerCase().trim()
    const existing = await tenantDb.member.findUnique({
      where: { tenantId_email: { tenantId: this.tenantId, email: cleanEmail } },
    })
    if (existing) return { success: false, error: `Member '${cleanEmail}' already exists` }

    const passwordHash = await hashMemberPassword(input.password)
    const member = await tenantDb.member.create({
      data: {
        tenantId: this.tenantId,
        email: cleanEmail,
        passwordHash,
        name: input.name || null,
        role: input.role || "member",
        status: "active",
        metadata: input.metadata || {},
      },
      select: { id: true, email: true, name: true, role: true, status: true, metadata: true, createdAt: true },
    })
    return { success: true, member }
  }

  /** Update member */
  async updateMember(input: { idOrEmail: string; name?: string; role?: string; status?: string; password?: string; metadata?: any }) {
    const tenantDb = (await this.getDb()) as any
    const member = await tenantDb.member.findFirst({
      where: {
        tenantId: this.tenantId,
        OR: [
          { id: input.idOrEmail },
          { email: input.idOrEmail.toLowerCase().trim() },
        ],
      },
    })
    if (!member) return { success: false, error: `Member '${input.idOrEmail}' not found` }

    const updateData: Record<string, any> = {}
    if (input.name !== undefined) updateData.name = input.name
    if (input.role !== undefined) updateData.role = input.role
    if (input.status !== undefined) updateData.status = input.status
    if (input.metadata !== undefined) {
      updateData.metadata = { ...((member.metadata as Record<string, any>) || {}), ...input.metadata }
    }
    if (input.password) {
      updateData.passwordHash = await hashMemberPassword(input.password)
    }

    const updated = await tenantDb.member.update({
      where: { id: member.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, status: true, metadata: true, updatedAt: true },
    })
    return { success: true, member: updated }
  }

  /** Delete member */
  async deleteMember(idOrEmail: string) {
    const tenantDb = (await this.getDb()) as any
    const member = await tenantDb.member.findFirst({
      where: {
        tenantId: this.tenantId,
        OR: [
          { id: idOrEmail },
          { email: idOrEmail.toLowerCase().trim() },
        ],
      },
    })
    if (!member) return { success: false, error: `Member '${idOrEmail}' not found` }
    await tenantDb.member.delete({ where: { id: member.id } })
    return { success: true, message: `Member '${member.email}' deleted successfully.` }
  }

  /** List field types */
  async listFieldTypes(category?: string) {
    let types = FIELD_TYPES as unknown as any[]
    if (category) {
      types = types.filter((t) => t.category.toLowerCase() === category.toLowerCase())
    }
    return types
  }

  /**
   * 10. Generic MCP Tool Dispatcher
   */
  async executeTool(toolName: string, args: Record<string, any> = {}) {
    switch (toolName) {
      case "get_full_schema":
        return await this.getFullSchema()
      case "list_field_types":
        return await this.listFieldTypes(args?.category)
      case "inspect_api_capabilities":
        return await this.inspectApiCapabilities(args?.apiKey)
      case "get_project_context":
        return await this.getProjectContext()
      case "apply_generated_schema":
        return await this.applyGeneratedSchema(args?.schema || args)

      // Content Types
      case "list_content_types":
        return await this.listContentTypes()
      case "get_content_type":
        return await this.getContentType(args?.slug || args?.id)
      case "create_content_type":
        return await this.createContentType(args as ContentTypeInput)
      case "update_content_type":
        return await this.updateContentType(args as any)
      case "delete_content_type":
        return await this.deleteContentType(args?.slug || args?.id)

      // Content Entries
      case "query_content":
        return await this.queryContent(args as any)
      case "get_content_entry":
        return await this.getContentEntry(args?.id)
      case "create_content_entry":
        return await this.createContentEntry(args as ContentEntryInput)
      case "update_content_entry":
        return await this.updateContentEntry(args as any)
      case "delete_content_entry":
        return await this.deleteContentEntry(args?.id)

      // Single Types
      case "list_single_types":
        return await this.listSingleTypes()
      case "get_single_type":
        return await this.getSingleType(args?.singleTypeSlug || args?.slug, args?.locale)
      case "create_single_type":
        return await this.createSingleType(args as SingleTypeInput)
      case "update_single_type":
        return await this.updateSingleType(args as any)
      case "update_single_type_content":
        return await this.updateSingleTypeContent(args as any)
      case "delete_single_type":
        return await this.deleteSingleType(args?.singleTypeSlug || args?.slug)

      // Components
      case "list_components":
        return await this.listComponents()
      case "get_component":
        return await this.getComponent(args?.componentSlug || args?.slug)
      case "create_component":
        return await this.createComponent(args as ComponentInput)
      case "update_component":
        return await this.updateComponent(args as any)
      case "delete_component":
        return await this.deleteComponent(args?.componentSlug || args?.slug)

      // Webhooks
      case "list_webhooks":
        return await this.listWebhooks()
      case "get_webhook":
        return await this.getWebhook(args?.id)
      case "create_webhook":
        return await this.createWebhook(args as any)
      case "update_webhook":
        return await this.updateWebhook(args as any)
      case "delete_webhook":
        return await this.deleteWebhook(args?.id)

      // Members
      case "list_members":
        return await this.listMembers(args)
      case "get_member":
        return await this.getMember(args?.idOrEmail || args?.id || args?.email)
      case "create_member":
        return await this.createMember(args as any)
      case "update_member":
        return await this.updateMember(args as any)
      case "delete_member":
        return await this.deleteMember(args?.idOrEmail || args?.id || args?.email)

      default:
        throw new Error(`Tool '${toolName}' is not implemented in in-process bridge.`)
    }
  }
}
