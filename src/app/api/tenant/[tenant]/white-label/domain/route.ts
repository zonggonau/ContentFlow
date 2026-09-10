import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { withStaffAuth, apiError } from "@/lib/api/route-helpers"
import { validateBody } from "@/lib/validate"
import { z } from "zod/v4"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { getRedis } from "@/lib/redis"
import { isFeatureEnabled, getTenantPlanConfig } from "@/lib/tenant-plan"
import { rateLimit } from "@/lib/rate-limit"
import {
  parseDomainInfo,
  getExpectedDnsRecords,
  diagnoseDomainDns,
  buildServerVerificationToken,
} from "@/lib/domain-dns"

/**
 * Substitutes the server-only, cryptographically strong HMAC verification
 * token (when DOMAIN_VERIFY_SECRET is configured) into the TXT record shown
 * to the user, in place of getExpectedDnsRecords' client-safe token — this
 * route runs server-only so it's safe to use the real secret here, unlike
 * domain-parser.ts which is bundled into the client for the "add domain"
 * live preview.
 */
function withServerVerificationValue<T extends { type: string; value: string }>(
  records: T[],
  tenantId: string,
): T[] {
  const strongToken = buildServerVerificationToken(tenantId)
  return records.map((r) => (r.type === "TXT" ? { ...r, value: strongToken } : r))
}

const setDomainSchema = z.object({
  customDomain: z
    .string()
    .min(3)
    .max(253)
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      "Format nama domain tidak valid"
    ),
  target: z.enum(["cms", "workspace", "site", "api"]).optional().default("cms"),
})

const verifyOrDeleteSchema = z.object({
  customDomain: z.string().min(3),
})

const setPrimarySchema = z.object({
  customDomain: z.string().min(3),
  isPrimary: z.boolean(),
})

const updateTargetSchema = z.object({
  customDomain: z.string().min(3),
  target: z.enum(["cms", "workspace", "site", "api"]),
})

/**
 * GET /api/tenant/[tenant]/white-label/domain
 * Get current custom domains and their expected DNS records
 */
export const GET = withStaffAuth(
  async (request, _context, { access, session }) => {

    const [tenantRecord, settings, siteRecord, vpsServer] = await Promise.all([
      db.tenant.findUnique({
        where: { id: access.tenantId },
        include: {
          customDomains: {
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      db.setting.findMany({
        where: {
          tenantId: access.tenantId,
          key: {
            in: [
              `${access.tenantId}_vercelDeploymentUrl`,
              `${access.tenantId}_vercelProjectId`,
              `${access.tenantId}_customDomain`,
              `${access.tenantId}_vpsDeploymentUrl`,
            ],
          },
        },
      }),
      db.site.findFirst({
        where: { tenantId: access.tenantId },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      db.infrastructureServer.findFirst({
        where: { tenantId: access.tenantId, status: { in: ["active", "provisioning", "ready"] } },
        orderBy: { createdAt: "desc" },
      }),
    ])

    if (!tenantRecord) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    }

    const domains = tenantRecord.customDomains.map((d) => {
      const info = parseDomainInfo(d.domain)
      const expectedRecords = withServerVerificationValue(getExpectedDnsRecords(d.domain, access.tenantId), access.tenantId)
      return {
        ...d,
        domainInfo: info,
        dnsRecords: expectedRecords,
        dnsVerification: expectedRecords.find((r) => r.type === "TXT") || {
          type: "TXT",
          name: info.isApex ? "_sacms-challenge" : `_sacms-challenge.${info.subdomainPrefix}`,
          value: buildServerVerificationToken(access.tenantId),
        },
      }
    })

    const vercelDeploymentUrlSetting = settings.find((s) => s.key === `${access.tenantId}_vercelDeploymentUrl`)?.value
    const vercelProjectIdSetting = settings.find((s) => s.key === `${access.tenantId}_vercelProjectId`)?.value
    const vercelCustomDomainSetting = settings.find((s) => s.key === `${access.tenantId}_customDomain`)?.value

    const vercelUrl = tenantRecord.vercelDeploymentUrl || vercelDeploymentUrlSetting || siteRecord?.deployments?.[0]?.url || null
    const vercelProjectId = tenantRecord.vercelProjectId || vercelProjectIdSetting || null
    const vercelCustomDomain = vercelCustomDomainSetting || siteRecord?.customDomain || null

    let vercelSubdomain: string | null = null
    if (vercelUrl) {
      try {
        const parsed = new URL(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`)
        vercelSubdomain = parsed.hostname
      } catch {
        vercelSubdomain = vercelUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      }
    }

    const vercelDeployment = vercelUrl
      ? {
          url: vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`,
          subdomain: vercelSubdomain,
          projectId: vercelProjectId,
          customDomain: vercelCustomDomain,
          status: "ready",
          updatedAt: tenantRecord.updatedAt,
        }
      : null

    const vpsDeploymentUrlSetting = settings.find((s) => s.key === `${access.tenantId}_vpsDeploymentUrl`)?.value
    const vpsDeployment = vpsServer?.ipv4
      ? {
          url: vpsDeploymentUrlSetting || `http://${vpsServer.ipv4}`,
          ip: vpsServer.ipv4,
          serverName: vpsServer.name,
          status: vpsServer.status,
        }
      : null

    return NextResponse.json({
      domains,
      vercelDeployment,
      vpsDeployment,
    })
  },
  { minRole: "admin" },
)

/**
 * POST /api/tenant/[tenant]/white-label/domain
 * Add a new custom domain for the tenant
 */
export const POST = withStaffAuth(
  async (request, _context, { access, session }) => {

    if (!(await isFeatureEnabled(access.tenantId, "ENABLE_CUSTOM_DOMAIN"))) {
      return NextResponse.json(
        { error: "Fitur custom domain membutuhkan paket Pro, Enterprise, atau add-on aktif." },
        { status: 403 }
      )
    }

    const result = await validateBody(request, setDomainSchema)
    if ("error" in result) return result.error

    const customDomain = result.data.customDomain.toLowerCase().trim()

    const planConfig = await getTenantPlanConfig(access.tenantId)
    const currentDomainCount = await db.customDomain.count({
      where: { tenantId: access.tenantId },
    })

    // SELFHOST_MODE grants unlimited domains — intended for a single-tenant
    // self-hosted deployment where plan limits don't apply. If it's ever set
    // "true" on a real multi-tenant production install, every workspace
    // silently gets an unlimited domain quota with no visible signal that
    // plan enforcement is off — so make that loud rather than silent.
    const isSelfHostEnv = process.env.SELFHOST_MODE === "true"
    if (isSelfHostEnv && process.env.NODE_ENV === "production") {
      console.warn(
        "[white-label/domain] SELFHOST_MODE=true in a production environment — custom-domain plan limits are DISABLED for all tenants. " +
        "This is expected for a single-tenant self-hosted install; if this is a shared multi-tenant deployment, unset SELFHOST_MODE."
      )
    }
    const isSelfHost = isSelfHostEnv || process.env.NODE_ENV === "development"
    const maxAllowed = isSelfHost ? 9999 : (planConfig.max_custom_domains || 25)

    if (currentDomainCount >= maxAllowed) {
      return NextResponse.json(
        {
          error: `Batas domain kustom tercapai (${maxAllowed} domain untuk paket Anda). Silakan upgrade paket untuk menambah domain.`,
        },
        { status: 403 }
      )
    }

    // Check if domain is already registered anywhere
    const existing = await db.customDomain.findUnique({
      where: { domain: customDomain },
      select: { tenantId: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: "Domain ini telah digunakan oleh workspace lain." },
        { status: 409 }
      )
    }

    const target = result.data.target || "cms"

    const newDomain = await db.customDomain.create({
      data: {
        tenantId: access.tenantId,
        domain: customDomain,
        status: "pending",
        isPrimary: currentDomainCount === 0,
        target,
      },
    })

    const expectedRecords = withServerVerificationValue(getExpectedDnsRecords(customDomain, access.tenantId), access.tenantId)
    const info = parseDomainInfo(customDomain)

    logAudit({
      tenantId: access.tenantId,
      userId: session.user.id,
      action: AuditAction.SETTINGS_UPDATED,
      entity: "tenant_custom_domain",
      entityId: newDomain.id,
      data: { action: "add", domain: customDomain },
    })

    return NextResponse.json({
      ...newDomain,
      domainInfo: info,
      dnsRecords: expectedRecords,
      dnsVerification: expectedRecords.find((r) => r.type === "TXT"),
    })
  },
  { minRole: "admin" },
)

/**
 * PUT /api/tenant/[tenant]/white-label/domain
 * Trigger live Vercel-style DNS diagnostics and verification for a domain
 */
export const PUT = withStaffAuth(
  async (request, _context, { access, session }) => {

    // DNS diagnostics perform several live resolver lookups per call — cheap
    // individually, but a tight retry loop (manual or scripted) could hammer
    // the DNS resolver. Cap at a level generous enough for a human clicking
    // "Cek Status" repeatedly while fixing DNS, but not for a spam loop.
    const rl = await rateLimit(`domain-dns-check:${access.tenantId}`, { limit: 20, windowSeconds: 60 })
    if (!rl.success) {
      return apiError("rate_limited", {
        message: "Terlalu banyak permintaan cek status DNS. Silakan tunggu sebentar sebelum mencoba lagi.",
      })
    }

    const result = await validateBody(request, verifyOrDeleteSchema)
    if ("error" in result) return result.error

    const { customDomain } = result.data

    const domainRecord = await db.customDomain.findUnique({
      where: { domain: customDomain },
    })

    if (!domainRecord || domainRecord.tenantId !== access.tenantId) {
      return NextResponse.json(
        { error: "Domain kustom tidak ditemukan atau Anda tidak memiliki akses." },
        { status: 404 }
      )
    }

    const tenantRecord = await db.tenant.findUnique({
      where: { id: access.tenantId },
      select: { slug: true },
    })

    // Perform live DNS diagnostics
    const diagnostics = await diagnoseDomainDns(customDomain, access.tenantId)

    const updatedDomain = await db.customDomain.update({
      where: { id: domainRecord.id },
      data: {
        status: diagnostics.verified ? "verified" : diagnostics.status === "invalid_configuration" ? "failed" : "pending",
        verifiedAt: diagnostics.verified ? new Date() : null,
      },
    })

    const redis = getRedis()
    if (diagnostics.verified && tenantRecord) {
      if (redis) {
        // Store JSON payload so proxy can read both slug AND portal target
        await redis.set(
          `domain:${customDomain}`,
          JSON.stringify({ slug: tenantRecord.slug, target: updatedDomain.target || "cms" })
        )
      }
    } else {
      if (redis) await redis.del(`domain:${customDomain}`)
    }

    return NextResponse.json({
      ...updatedDomain,
      diagnostics,
      verified: diagnostics.verified,
    })
  },
  { minRole: "admin" },
)

/**
 * PATCH /api/tenant/[tenant]/white-label/domain
 * Set primary domain for tenant OR update domain portal target
 */
export const PATCH = withStaffAuth(
  async (request, _context, { access, session }) => {

    const body = await request.json().catch(() => ({}))

    // If request includes "target" field — update domain portal routing target
    if ("target" in body) {
      const parsed = updateTargetSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
      }

      const { customDomain, target } = parsed.data
      const domainRecord = await db.customDomain.findUnique({ where: { domain: customDomain } })
      if (!domainRecord || domainRecord.tenantId !== access.tenantId) {
        return NextResponse.json({ error: "Domain tidak ditemukan." }, { status: 404 })
      }

      const updated = await db.customDomain.update({
        where: { id: domainRecord.id },
        data: { target },
      })

      // Update Redis cache if domain is verified
      if (domainRecord.status === "verified") {
        const redis = getRedis()
        const tenantRecord = await db.tenant.findUnique({
          where: { id: access.tenantId },
          select: { slug: true },
        })
        if (redis && tenantRecord) {
          await redis.set(
            `domain:${customDomain}`,
            JSON.stringify({ slug: tenantRecord.slug, target })
          )
        }
      }

      logAudit({
        tenantId: access.tenantId,
        userId: session.user.id,
        action: AuditAction.SETTINGS_UPDATED,
        entity: "tenant_custom_domain",
        entityId: domainRecord.id,
        data: { action: "update_target", domain: customDomain, target },
      })

      return NextResponse.json({ success: true, domain: updated })
    }

    // Default: set primary domain
    const result = await validateBody(
      new Request(request.url, { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
      setPrimarySchema
    )
    if ("error" in result) return result.error

    const { customDomain, isPrimary } = result.data

    // The domain must belong to this tenant.
    const owned = await db.customDomain.findFirst({
      where: { domain: customDomain, tenantId: access.tenantId },
      select: { id: true },
    })
    if (!owned) return apiError("not_found", { message: "Domain not found" })

    if (isPrimary) {
      // Unset previous primary domains
      await db.customDomain.updateMany({
        where: { tenantId: access.tenantId },
        data: { isPrimary: false },
      })
    }

    const updated = await db.customDomain.update({
      where: { id: owned.id },
      data: { isPrimary },
    })

    return NextResponse.json({ success: true, domain: updated })
  },
  { minRole: "admin" },
)

/**
 * DELETE /api/tenant/[tenant]/white-label/domain
 * Remove a custom domain
 */
export const DELETE = withStaffAuth(
  async (request, _context, { access, session }) => {

    const result = await validateBody(request, verifyOrDeleteSchema)
    if ("error" in result) return result.error

    const { customDomain } = result.data

    const domainRecord = await db.customDomain.findUnique({
      where: { domain: customDomain },
    })

    if (!domainRecord || domainRecord.tenantId !== access.tenantId) {
      return NextResponse.json(
        { error: "Domain kustom tidak ditemukan atau Anda tidak memiliki akses." },
        { status: 404 }
      )
    }

    await db.customDomain.delete({
      where: { id: domainRecord.id },
    })

    const redis = getRedis()
    if (redis) await redis.del(`domain:${customDomain}`)

    logAudit({
      tenantId: access.tenantId,
      userId: session.user.id,
      action: AuditAction.SETTINGS_UPDATED,
      entity: "tenant_custom_domain",
      entityId: domainRecord.id,
      data: { action: "delete", domain: customDomain },
    })

    return NextResponse.json({ success: true })
  },
  { minRole: "admin" },
)
