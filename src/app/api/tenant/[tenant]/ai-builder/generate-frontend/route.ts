import { NextResponse } from "next/server"
import { db, getTenantDb } from "@/lib/database"
import { createV0Chat, getV0Preview } from "@/lib/v0-client"
import { deployToVercel } from "@/lib/vercel-client"
import { randomBytes, createHash } from "crypto"
import { McpClientBridge } from "@/lib/mcp/mcp-client-bridge"
import { withStaffAuth, apiError } from "@/lib/api/route-helpers"

export const POST = withStaffAuth(
  async (req, _context, { access, session }) => {
    const body = await req.json().catch(() => ({}))
    const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 8000) : ""
    const model = typeof body?.model === "string" ? body.model : "v0-pro"
    const deployToVercelAfter = body?.deployToVercelAfter === true
    const plannedSchema = body?.plannedSchema ?? null

    // Always the platform's own origin — never a client-supplied base URL.
    const apiBaseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000"
    ).replace(/\/$/, "")

    if (!prompt) return apiError("validation", { message: "Prompt is required" })

    const MODEL_CREDIT_MAP: Record<string, number> = {
      "v0-mini": 15,
      "v0-pro": 25,
      "v0-max": 35,
      "v0-max-fast": 40,
    }
    const creditCost = MODEL_CREDIT_MAP[model] || 25

    const { enforceUserAiCredits, deductUserAiCredits } = await import("@/lib/plan-enforcement")
    const creditCheck = await enforceUserAiCredits(session.user.id, creditCost)
    if (!creditCheck.allowed) return apiError("rate_limited", { message: creditCheck.message })

    const tenant = access.tenant
    const bridge = new McpClientBridge(tenant.id, tenant.slug, session.user.id)

    // ── PHASE 1: Inspect Current Schema via SaCMS MCP Bridge ─────────────────────
    // Periksa apakah workspace sudah memiliki skema custom yang relevan.
    let activeSchema = await bridge.getFullSchema()
    
    // Cek apakah workspace belum memiliki skema kustom, atau hanya memiliki template default kosong (services/articles)
    const existingContentTypes = activeSchema.contentTypes || []
    const isOnlyDefaultBoilerplate = existingContentTypes.length > 0 && existingContentTypes.every(ct => 
      ct.slug === "services" || ct.slug === "articles"
    )
    const needsNewSchema = existingContentTypes.length === 0 || isOnlyDefaultBoilerplate

    try {
      if (plannedSchema && (plannedSchema.contentTypes?.length || plannedSchema.singleTypes?.length)) {
        await bridge.applyGeneratedSchema(plannedSchema)
        activeSchema = await bridge.getFullSchema()
      } else if (needsNewSchema) {
        // Jika belum ada skema atau hanya ada boilerplate default, langsung buatkan skema baru yang sesuai prompt via MCP
        console.log(`[AI Builder MCP] Generating new custom schema for prompt: "${prompt.slice(0, 80)}..."`)
        const { generateSystemSchema } = await import("@/lib/ai-schema-generator")
        const generatedSchema = await generateSystemSchema(prompt, tenant.id, session.user.id)
        if (generatedSchema && (generatedSchema.contentTypes?.length || generatedSchema.singleTypes?.length)) {
          await bridge.applyGeneratedSchema(generatedSchema)
          activeSchema = await bridge.getFullSchema()
        }
      }
    } catch (schemaErr: any) {
      console.warn("[AI_BUILDER_MCP_SCHEMA_WARNING]: Could not auto-apply schema via MCP:", schemaErr.message)
    }

    const capabilities = await bridge.inspectApiCapabilities()
    const tenantDb = await getTenantDb(tenant.id)

    // 2. Fetch existing sample records from database (if available)
    const sampleCollections: Record<string, any[]> = {}
    for (const ct of activeSchema.contentTypes || []) {
      const entries = await tenantDb.contentEntry.findMany({
        where: { tenantId: tenant.id, contentType: { slug: ct.slug } },
        take: 10,
        orderBy: { createdAt: "desc" }
      })
      sampleCollections[ct.slug] = entries.map(e => ({ id: e.id, ...(e.data as any) }))
    }

    const sampleSingleTypes: Record<string, any> = {}
    for (const st of activeSchema.singleTypes || []) {
      const assignment = await tenantDb.tenantSingleTypeAssignment.findFirst({
        where: { tenantId: tenant.id, singleType: { slug: st.slug } }
      })
      if (assignment?.data) {
        sampleSingleTypes[st.slug] = assignment.data
      }
    }

    // 3. Auto-generate API token for v0.dev integration
    const plainToken = `cf_${randomBytes(32).toString("hex")}`
    const hashedToken = createHash("sha256").update(plainToken).digest("hex")
    
    await db.apiToken.create({
      data: {
        tenantId: tenant.id,
        name: `SaCMS Frontend Token - ${new Date().toLocaleDateString()}`,
        description: `Auto-generated for SaCMS AI Website Builder`,
        token: hashedToken,
        type: capabilities.canWrite ? "service" : "read-only",
        permissions: capabilities.permissions,
        createdBy: session.user.id,
      },
    })

    // 4. Build prompt directly for v0.dev with SaCMS MCP & API instructions
    const finalApiUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/public/${tenant.slug}`
    const mcpServerUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/mcp`
    
    const superPrompt = `User Request: ${prompt}

SaCMS HEADLESS CMS & MCP SERVER INTEGRATION:
- SaCMS Public REST API: ${finalApiUrl}
- SaCMS MCP Server: ${mcpServerUrl}
- Auth Header: Authorization: Bearer ${plainToken}
- API Capabilities: ${capabilities.mode} (canRead: ${capabilities.canRead}, canWrite: ${capabilities.canWrite}, canDelete: ${capabilities.canDelete})
- Mode Guidance: ${capabilities.canWrite ? "Build full interactive workflows (forms, mutations, booking, reviews, cart)" : "Build high-performance consumer view (catalogs, article feeds, portfolios)"}
- List Collection: GET ${finalApiUrl}/content/{collectionSlug}
- Single Type: GET ${finalApiUrl}/single/{singleTypeSlug}
- Filter: GET ${finalApiUrl}/content/{slug}?filters[fieldName][$eq]=value
- Populate: GET ${finalApiUrl}/content/{slug}?populate=relationField

EXISTING WORKSPACE SCHEMA (from SaCMS MCP):
${JSON.stringify(activeSchema, null, 2)}

EXISTING DATASET (Live Records from Database):
${JSON.stringify({ collections: sampleCollections, singleTypes: sampleSingleTypes }, null, 2)}

CRITICAL ARCHITECTURE & UI REQUIREMENTS:
1. Requirements Analysis: Analyze the user request thoroughly and design a comprehensive Next.js 16 App Router website with modern UI components, interactive states, and responsive layouts.
2. Dynamic Data & CMS Connectivity:
   - Connect components to the SaCMS Public Content API and MCP Server.
   - Query collections and single types dynamically from the endpoints above.
   - Always define strict TypeScript interfaces for all CMS responses.
3. High-Quality Media & Mock Images:
   - For all image/media fields, always use valid, high-resolution Unsplash URLs (e.g. 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80') tailored to the domain.
   - Never leave <img src=""> empty or with broken placeholders.
4. Multi-Section Layouts: Include Navbar branding, Hero section, Feature/Catalog cards, detail modals/views, reviews/testimonials, and Footer with contact information.
5. Rich Field Rendering: Format currency (e.g. "Rp 1.500.000"), ratings (stars), badges, dates, and action buttons cleanly.
6. Tech Stack: Next.js 16 App Router, TypeScript, Tailwind CSS, Lucide-React icons.

Initialize all components with rich fallback sample data so the live sandbox preview renders instantly with zero blank states.`

    // 6. Generate frontend with AI Engine
    const v0Result = await createV0Chat(superPrompt, model)
    if (!v0Result?.chatId) throw new Error("Failed to generate frontend with AI Engine")

    // Deduct user credits after successful chat creation
    await deductUserAiCredits(session.user.id, creditCost, "generate_frontend", tenant.id, model)
    
    // 5. Save to settings
    await db.setting.upsert({ where: { key: `${tenant.id}_v0ChatId` }, update: { value: v0Result.chatId }, create: { tenantId: tenant.id, key: `${tenant.id}_v0ChatId`, value: v0Result.chatId } })
    await db.setting.upsert({ where: { key: `${tenant.id}_v0FrontendPrompt` }, update: { value: prompt }, create: { tenantId: tenant.id, key: `${tenant.id}_v0FrontendPrompt`, value: prompt } })
    await db.setting.upsert({ where: { key: `${tenant.id}_v0Model` }, update: { value: model }, create: { tenantId: tenant.id, key: `${tenant.id}_v0Model`, value: model } })

    // 6. Optionally deploy to Vercel immediately
    let deploymentUrl = ""
    let vercelProjectId = ""
    let previewUrl = ""
    
    if (deployToVercelAfter && v0Result.files && v0Result.files.length > 0) {
      try {
        const projectName = `sacms-${tenant.slug}-frontend`
        const deployment = await deployToVercel(projectName, v0Result.files)
        deploymentUrl = deployment.url
        vercelProjectId = deployment.projectId || ""
        
        if (deploymentUrl) {
          previewUrl = deploymentUrl
          await db.setting.upsert({ where: { key: `${tenant.id}_v0PreviewUrl` }, update: { value: deploymentUrl }, create: { tenantId: tenant.id, key: `${tenant.id}_v0PreviewUrl`, value: deploymentUrl } })
          if (vercelProjectId) {
            await db.setting.upsert({ where: { key: `${tenant.id}_vercelProjectId` }, update: { value: vercelProjectId }, create: { tenantId: tenant.id, key: `${tenant.id}_vercelProjectId`, value: vercelProjectId } })
          }
        }
      } catch (deployError: any) {
        console.error("Vercel deploy failed:", deployError.message)
      }
    }
    
    // If not deployed to Vercel, use our local proxy route to securely embed the V0 preview
    if (!previewUrl) {
      previewUrl = `/api/tenant/${tenant.slug}/ai-builder/preview/${v0Result.chatId}`
      await db.setting.upsert({ where: { key: `${tenant.id}_v0PreviewUrl` }, update: { value: previewUrl }, create: { tenantId: tenant.id, key: `${tenant.id}_v0PreviewUrl`, value: previewUrl } })
    }

    // Sync with Site & SiteFile database models
    try {
      let site = await db.site.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { updatedAt: "desc" }
      })
      if (!site) {
        site = await db.site.create({
          data: {
            tenantId: tenant.id,
            name: `${tenant.name} Website`,
            slug: `${tenant.slug}-web`,
            subdomain: `${tenant.slug}-web`,
            status: "published",
          }
        })
      }

      if (v0Result.files && v0Result.files.length > 0) {
        for (const vf of v0Result.files) {
          const filePath = vf.name.startsWith("app/") || vf.name.startsWith("components/") || vf.name.startsWith("lib/") ? vf.name : `app/${vf.name}`
          await db.siteFile.upsert({
            where: { siteId_path: { siteId: site.id, path: filePath } },
            create: { siteId: site.id, path: filePath, content: vf.content },
            update: { content: vf.content },
          })
        }
      }
    } catch (siteErr: any) {
      console.warn("Could not sync Site record:", siteErr.message)
    }

    return NextResponse.json({
      success: true,
      v0ChatId: v0Result.chatId,
      previewUrl,
      vercelProjectId,
      filesGenerated: v0Result.files?.length || 0,
      files: v0Result.files || [],
      // True when v0 accepted the chat but hasn't streamed files back yet —
      // the client should show a "sedang membangun" state and poll, not an
      // empty/broken one.
      generating: v0Result.generating === true,
      // Set only when v0's cloud API itself failed/errored (e.g. the v0.app
      // account is out of credits) and generation fell back to local demo
      // content — the client should surface this honestly rather than
      // implying a real AI build succeeded.
      v0Error: v0Result.v0Error,
    })
  },
  { minRole: "admin" },
)
