import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { deployToVercel, addDomainToProject, getDomainConfig } from "@/lib/vercel-client"
import { randomBytes } from "crypto"
import { withStaffAuth, apiError } from "@/lib/api/route-helpers"
import { isTenantPlanPaid, resolveHostingTarget } from "@/lib/infrastructure/hosting-plan"

export const GET = withStaffAuth(async (_req, _context, { access, session }) => {
    const tenant = access.tenant
    const tenantId = tenant.id

    const settings = await db.setting.findMany({
      where: {
        tenantId,
        key: { in: [`${tenantId}_hostingStatus`, `${tenantId}_hostingExpiresAt`, `${tenantId}_vercelDeploymentUrl`, `${tenantId}_vercelProjectId`, `${tenantId}_customDomain`] }
      }
    })

    const hostingStatusSetting = settings.find(s => s.key === `${tenantId}_hostingStatus`)?.value
    const hostingExpiresAtSetting = settings.find(s => s.key === `${tenantId}_hostingExpiresAt`)?.value
    const vercelUrl = settings.find(s => s.key === `${tenantId}_vercelDeploymentUrl`)?.value || (tenant as any).vercelDeploymentUrl || null
    const customDomain = settings.find(s => s.key === `${tenantId}_customDomain`)?.value || tenant.customDomain || null

    const hostingStatus = (tenant as any).hostingStatus || hostingStatusSetting || "trial"
    const hostingExpiresAt = (tenant as any).hostingExpiresAt || (hostingExpiresAtSetting ? new Date(hostingExpiresAtSetting) : null)

    const hostingTarget = resolveHostingTarget(tenant.plan)
    const vpsServer = hostingTarget === "vps"
      ? await db.infrastructureServer.findFirst({
          where: { tenantId, status: { in: ["active", "provisioning", "ready"] } },
          orderBy: { createdAt: "desc" }
        })
      : null
    const hasDedicatedVps = hostingTarget === "vps"
    const vpsUrl = settings.find(s => s.key === `${tenantId}_vpsDeploymentUrl`)?.value || (vpsServer?.ipv4 ? `http://${vpsServer.ipv4}` : null)

    const isPaid = isTenantPlanPaid(tenant.plan) || session.user.role === "super_admin"
    const isEnterprise = Boolean(tenant.plan?.toLowerCase().includes("enterprise") || session.user.role === "super_admin")
    const isHostingActive = hasDedicatedVps || isEnterprise || Boolean(hostingStatus === "active" && hostingExpiresAt && new Date(hostingExpiresAt) > new Date())

    return NextResponse.json({
      hostingStatus,
      hostingExpiresAt,
      isHostingActive,
      hasDedicatedVps,
      hostingTarget,
      isPaid,
      vpsIp: vpsServer?.ipv4 || null,
      vpsServerName: vpsServer?.name || null,
      vpsDeploymentUrl: vpsUrl,
      vercelDeploymentUrl: vercelUrl,
      customDomain,
      plan: tenant.plan,
    })
})

export const POST = withStaffAuth(
  async (req, _context, { access, session }) => {
    const body = await req.json()
    const { action = "deploy", target = "auto", files = [], domain, chatId } = body

    const tenant = access.tenant
    const tenantId = tenant.id
    const tenantSlug = tenant.slug

    // ── BILLING GATE: deploying to production requires a paid plan ──────────
    // Free-plan workspaces can still generate/preview via v0 — they just can't
    // push to production hosting until they upgrade. (Trial/payment-expired
    // tenants never reach this route at all — SubscriptionGate blocks the
    // whole dashboard for those before the page even renders.)
    const isPaid = isTenantPlanPaid(tenant.plan) || session.user.role === "super_admin"
    if ((action === "deploy" || action === "domain") && !isPaid) {
      return apiError("plan_limit", {
        message: "Deploy ke hosting produksi memerlukan paket berbayar. Upgrade paket Anda untuk melanjutkan.",
        details: { redirectTo: `/dashboard/${tenantSlug}/subscriptions`, plan: tenant.plan },
      })
    }

    // ── ACTION 0: DEPLOY TO DEDICATED CONTABO VPS (VPS/VDS-tier plans) ──────
    const hostingTarget = resolveHostingTarget(tenant.plan)

    if (action === "deploy" && (target === "vps" || (target === "auto" && hostingTarget === "vps"))) {
      const { deployAiWebsiteToVps } = await import("@/lib/infrastructure/vps-deployer")
      const vpsResult = await deployAiWebsiteToVps(tenantId, { files, domain, chatId })
      return NextResponse.json(vpsResult)
    }

    // ── ACTION 1: ADD / VERIFY CUSTOM DOMAIN ─────────────────────────────────
    if (action === "domain") {
      if (!domain) {
        return NextResponse.json({ error: "Domain name is required" }, { status: 400 })
      }

      const existingProjectId = await db.setting.findUnique({
        where: { key: `${tenantId}_vercelProjectId` }
      })

      const projectId = existingProjectId?.value || `prj_${tenantSlug}`

      const [domainResult, dnsConfig] = await Promise.all([
        addDomainToProject(projectId, domain),
        getDomainConfig(domain),
      ])

      await db.setting.upsert({
        where: { key: `${tenantId}_customDomain` },
        update: { value: domain },
        create: { tenantId, key: `${tenantId}_customDomain`, value: domain }
      })

      return NextResponse.json({
        success: true,
        domain: domainResult,
        dns: dnsConfig,
      })
    }

    // ── ACTION 2: 1-CLICK DEPLOY TO VERCEL ──────────────────────────────────
    // 1. Get or create a dedicated API key for this website deployment
    let tokenRecord = await db.apiToken.findFirst({
      where: {
        tenantId,
        name: `Vercel Site (${tenantSlug})`,
      }
    })

    if (!tokenRecord) {
      const generatedToken = `sacms_live_${randomBytes(24).toString("hex")}`
      tokenRecord = await db.apiToken.create({
        data: {
          tenantId,
          name: `Vercel Site (${tenantSlug})`,
          token: generatedToken,
          type: "service",
          permissions: ["read", "write"],
        }
      })
    }

    const origin = req.nextUrl.origin || "http://localhost:3000"
    const projectName = `sacms-${tenantSlug}`

    // 2. Prepare Next.js starter files if not provided
    const deployFiles = files.length > 0 ? files : [
      {
        name: "package.json",
        content: JSON.stringify({
          name: projectName,
          version: "1.0.0",
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start"
          },
          dependencies: {
            next: "15.2.0",
            react: "19.0.0",
            "react-dom": "19.0.0",
            "lucide-react": "^1.16.0",
            tailwindcss: "^4.0.0"
          }
        }, null, 2)
      },
      {
        name: "app/layout.tsx",
        content: `export const metadata = { title: "${tenant.name} - Official Site" }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-slate-950 text-slate-50 min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}`
      },
      {
        name: "app/page.tsx",
        content: `import { Globe, ArrowRight, Sparkles } from "lucide-react"

async function getSiteData() {
  try {
    const res = await fetch("${origin}/api/public/${tenantSlug}/content/articles?pagination[pageSize]=6", {
      headers: { "Authorization": "Bearer ${tokenRecord.token}" },
      next: { revalidate: 60 }
    })
    return await res.json()
  } catch (err) {
    return { data: [] }
  }
}

export default async function HomePage() {
  const cmsData = await getSiteData()
  return (
    <main className="max-w-5xl mx-auto px-6 py-20">
      <header className="text-center space-y-4 mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
          <Sparkles className="w-3.5 h-3.5" /> Powered by SaCMS Cloud Edge
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">${tenant.name}</h1>
        <p className="text-slate-400 max-w-xl mx-auto text-sm md:text-base">Website produksi otomatis terhubung ke SaCMS Headless Content Hub.</p>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cmsData.data && cmsData.data.length > 0 ? (
          cmsData.data.map((item: any) => (
            <article key={item.id} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 hover:border-emerald-500/40 transition-all">
              <h2 className="text-lg font-bold text-white">{item.title || item.name || "Konten"}</h2>
              <p className="text-xs text-slate-400 line-clamp-3">{item.excerpt || item.description || "Deskripsi konten..."}</p>
            </article>
          ))
        ) : (
          <div className="col-span-full text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-400 text-sm">
            Website Anda telah online di Cloud Edge! Tambahkan konten pertama Anda di dashboard SaCMS.
          </div>
        )}
      </div>
    </main>
  )
}`
      }
    ]

    // 3. Execute Vercel Deployment
    const envVars = {
      NEXT_PUBLIC_SACMS_API_URL: origin,
      NEXT_PUBLIC_SACMS_TENANT: tenantSlug,
      SACMS_API_KEY: tokenRecord.token,
    }

    const deployResult = await deployToVercel(projectName, deployFiles, envVars)

    // 4. Save deployment info in database settings
    await Promise.all([
      db.setting.upsert({
        where: { key: `${tenantId}_v0Status` },
        update: { value: "project" },
        create: { tenantId, key: `${tenantId}_v0Status`, value: "project" }
      }),
      db.setting.upsert({
        where: { key: `${tenantId}_vercelDeploymentUrl` },
        update: { value: deployResult.url },
        create: { tenantId, key: `${tenantId}_vercelDeploymentUrl`, value: deployResult.url }
      }),
      db.setting.upsert({
        where: { key: `${tenantId}_vercelProjectId` },
        update: { value: deployResult.projectId || "" },
        create: { tenantId, key: `${tenantId}_vercelProjectId`, value: deployResult.projectId || "" }
      })
    ])

    return NextResponse.json({
      success: true,
      deploymentId: deployResult.id,
      url: deployResult.url,
      state: deployResult.state,
      vercelProjectId: deployResult.projectId,
      apiKeyName: tokenRecord.name,
      simulated: deployResult.simulated ?? false,
      hostType: deployResult.simulated ? "simulation" : "vercel",
    })
  },
  { minRole: "admin" },
)
