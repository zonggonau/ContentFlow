import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/database"
import { redirect } from "next/navigation"
import { WorkspaceManager } from "@/components/dashboard/workspace-manager"
import { getUserPlanConfig } from "@/lib/tenant-plan"
import { isEnterpriseTenant } from "@/lib/license"
import { getGlobalWorkspaceId } from "@/lib/settings"
import { cleanPrice } from "@/lib/plan-pricing"

export default async function WorkspaceSelectionPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const isSuperAdmin = session.user.role === "super_admin"

  // Resolved per-request rather than once at module load — the previous
  // top-level `await` cached this for the process lifetime, so a DB hiccup
  // at cold start (or the setting changing later) would silently wedge
  // every request on a stale/empty value.
  const globalId = await getGlobalWorkspaceId()
  const SYSTEM_SLUGS = [globalId, "sacms-global", "sacms"]

  const whereClause: any = {
    slug: { notIn: SYSTEM_SLUGS },
    id: { not: globalId }
  }

  if (!isSuperAdmin) {
    whereClause.members = { some: { userId: session.user.id } }
  }

  const tenants = await db.tenant.findMany({
    where: whereClause,
    include: {
      members: {
        where: { userId: session.user.id },
        select: { role: true }
      },
      subscriptions: {
        orderBy: { currentPeriodEnd: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" }
  })

  let isGlobalEnterprise = await isEnterpriseTenant(globalId)
  if (!isGlobalEnterprise) {
    isGlobalEnterprise = await isEnterpriseTenant(session.user.id)
  }

  // Redirect to billing if all workspaces are suspended, unless enterprise mode is active
  if (!isGlobalEnterprise && tenants.length > 0 && tenants.every(t => t.status === "suspended")) {
    redirect("/dashboard/billing")
  }

  // If non-admin / non-owner team member belongs to a single workspace, forward directly to its CMS studio
  const isOwnerOrAdmin = session.user.role === "admin" || session.user.role === "super_admin" || session.user.role === "owner" || tenants.some(t => t.members[0]?.role === "owner" || t.members[0]?.role === "admin")
  if (!isOwnerOrAdmin && tenants.length === 1) {
    redirect(`/dashboard/${tenants[0].slug || tenants[0].id}/cms`)
  }

  const formattedTenants = await Promise.all(tenants.map(async (t) => {
    const sub = t.subscriptions[0]
    let daysRemaining: number | null = null
    let isExpired = false

    const enterprise = isGlobalEnterprise || await isEnterpriseTenant(t.id, session.user.id)

    if (!enterprise) {
      if (t.status === "suspended") {
        isExpired = true
      } else if (sub?.currentPeriodEnd) {
        const diff = new Date(sub.currentPeriodEnd).getTime() - Date.now()
        daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
        if (new Date() > new Date(sub.currentPeriodEnd)) {
          isExpired = true
        }
      }
    }

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: (enterprise && t.status === "suspended") ? "active" : t.status,
      plan: t.plan,
      createdAt: t.createdAt.toISOString(),
      role: t.members[0]?.role || (isSuperAdmin ? 'owner' : 'member'),
      daysRemaining,
      isExpired,
      isEnterprise: enterprise,
      subscriptionStatus: sub?.status || null,
      expiresAt: sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : null
    }
  }))

  // Fetch global dependencies for the creation dialog
  let dbTemplates: any[] = []
  let workspacePlans: any[] = []
  let addonPlans: any[] = []
  let usage: any = null

  try {
    const [wPlans, aPlans] = await Promise.all([
      db.contentEntry.findMany({
        where: { contentType: { slug: "sacms-workspace-pricing" }, status: "PUBLISHED" },
        select: { id: true, data: true }
      }),
      db.contentEntry.findMany({
        where: { contentType: { slug: "sacms-addons" }, status: "PUBLISHED" },
        select: { id: true, data: true }
      })
    ])

    workspacePlans = wPlans.map(t => {
      const d = (typeof t.data === 'string' ? JSON.parse(t.data) : t.data) as any
      const price = cleanPrice(d.price)
      const yearlyPrice = d.yearly_price !== undefined ? cleanPrice(d.yearly_price) : price * 10

      return {
        id: d.plan_slug || t.id,
        plan_slug: d.plan_slug || "free",
        name: d.name || "Workspace Plan",
        desc: d.description || d.desc || "",
        priceAmount: price,
        yearlyPrice: yearlyPrice,
        max_content_types: d.max_content_types,
        max_content_entries: d.max_content_entries,
        max_storage: d.max_storage,
        max_team_members: d.max_team_members,
        max_locales: d.max_locales,
        max_api_calls: d.max_api_calls,
        features: Array.isArray(d.features) ? d.features : []
      }
    }).sort((a, b) => (a.priceAmount || 0) - (b.priceAmount || 0))

    addonPlans = aPlans.map(t => {
      const d = (typeof t.data === 'string' ? JSON.parse(t.data) : t.data) as any
      return {
        id: d.addon_slug || t.id,
        name: d.name || "Add-on",
        desc: d.description || "",
        priceLabel: d.price_label || "",
        priceAmount: cleanPrice(d.price),
        icon: d.icon || "Sparkles"
      }
    })

    // Check user plan limits using centralized enforcement (handles enterprise/admin bypasses)
    const { enforceUserPlanLimit } = await import("@/lib/plan-enforcement")
    const limitResult = await enforceUserPlanLimit(session.user.id, "workspaces")
    usage = {
      current: tenants.length, // Ensure it matches the list we fetched
      max: limitResult.max,
      allowed: limitResult.max === null || limitResult.max > 9000 || tenants.length < limitResult.max,
      plan: limitResult.planSlug
    }

    if (isGlobalEnterprise) {
      workspacePlans = [
        {
          id: "enterprise-shared",
          name: "Shared Database",
          desc: "Satu database utama untuk semua tenant. Ideal untuk tenant ringan dan standar.",
          priceAmount: 0,
          yearlyPrice: 0,
          features: ["Shared Pool", "Auto Scaling", "Cost Effective"]
        },
        {
          id: "enterprise-standalone",
          name: "Standalone Database",
          desc: "Diisolasi pada instance PostgreSQL terpisah untuk performa dan keamanan maksimal.",
          priceAmount: 0,
          yearlyPrice: 0,
          features: ["Dedicated DB", "High Performance", "Data Isolation"]
        },
        {
          id: "enterprise-custom",
          name: "Custom Infrastructure",
          desc: "Opsi untuk setup manual di infrastruktur, VPC, atau jaringan khusus instansi.",
          priceAmount: 0,
          yearlyPrice: 0,
          features: ["Custom VPC", "On-Premise Ready", "Priority SLA"]
        }
      ]
    }

  } catch (e) {
    console.error("Failed to fetch global dependencies in RSC:", e);
  }

  return (
    <WorkspaceManager 
      initialTenants={formattedTenants}
      usage={usage}
      dbTemplates={dbTemplates}
      workspacePlans={workspacePlans}
      addonPlans={addonPlans}
      isSuperAdmin={session.user.role === "super_admin"}
    />
  )
}
