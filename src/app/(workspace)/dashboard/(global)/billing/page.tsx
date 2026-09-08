import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import BillingClient from "./billing-client"
import { getTransactionHistoryAction } from "@/actions/billing"
import { db } from "@/lib/database"

export default async function BillingPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect("/login")
  }

  const { isEnterpriseTenant } = await import("@/lib/license")
  const enterprise = await isEnterpriseTenant(session.user.id)

  // 1. Fetch Account Plans directly from DB
  let accountPlans: any[] = []
  try {
    const entries = await db.contentEntry.findMany({
      where: { contentType: { slug: "sacms-account-pricing" }, status: "PUBLISHED" },
      orderBy: { createdAt: "asc" }
    })

    if (entries.length > 0) {
      accountPlans = entries.map(t => {
        const d = (typeof t.data === 'string' ? JSON.parse(t.data) : t.data) as any
        
        let monthlyPrice = 0
        if (typeof d.price === 'string') {
          monthlyPrice = parseInt(d.price.replace(/[^\d]/g, ''), 10) || 0
        } else {
          monthlyPrice = Number(d.price) || 0
        }

        let yearlyPrice = 0
        if (d.yearly_price !== undefined) {
          if (typeof d.yearly_price === 'string') {
            yearlyPrice = parseInt(d.yearly_price.replace(/[^\d]/g, ''), 10) || 0
          } else {
            yearlyPrice = Number(d.yearly_price) || 0
          }
        } else {
          yearlyPrice = monthlyPrice * 10
        }

        let displayYearlyPrice = "Rp 0"
        if (yearlyPrice > 0) {
          displayYearlyPrice = `Rp ${(yearlyPrice).toLocaleString('id-ID')}`
        }

        let displayMonthlyPrice = "Rp 0"
        if (monthlyPrice > 0) {
          displayMonthlyPrice = `Rp ${(monthlyPrice).toLocaleString('id-ID')}`
        }

        const features = Array.isArray(d.features) 
          ? d.features 
          : (typeof d.features === 'string' ? d.features.split(',').map((s: string) => s.trim()) : [])

        return {
          id: d.plan_slug || t.id,
          name: d.name || "Unnamed Plan",
          description: d.description || "",
          workspaces: d.max_workspaces || "Unlimited",
          price: displayYearlyPrice,
          priceAmount: yearlyPrice,
          monthlyPrice: displayMonthlyPrice,
          monthlyPriceAmount: monthlyPrice,
          yearlyPrice: displayYearlyPrice,
          yearlyPriceAmount: yearlyPrice,
          features: features,
          popular: d.is_popular === true || d.plan_slug === "pro"
        }
      })
    }

    // Default canonical account plans if none in database
    const canonicalPlans = [
      {
        id: "free",
        name: "Akun Gratis",
        description: "Mulai tanpa biaya untuk eksplorasi dan pengembangan sandbox.",
        workspaces: "1",
        price: "Rp 0",
        priceAmount: 0,
        monthlyPrice: "Rp 0",
        monthlyPriceAmount: 0,
        yearlyPrice: "Rp 0",
        yearlyPriceAmount: 0,
        features: ["1 Workspace Mandiri", "Akses Penuh CMS Editor & API", "Dukungan Komunitas"],
        popular: false
      },
      {
        id: "starter",
        name: "Akun Standar",
        description: "Sangat ekonomis untuk solo developer, freelance & UMKM.",
        workspaces: "3",
        price: "Rp 390.000",
        priceAmount: 390000,
        monthlyPrice: "Rp 49.000",
        monthlyPriceAmount: 49000,
        yearlyPrice: "Rp 390.000",
        yearlyPriceAmount: 390000,
        features: ["Hingga 3 Workspace Aktif", "Multi-Project Management UMKM", "Akses REST & GraphQL API", "Dukungan Email Prioritas"],
        popular: false
      },
      {
        id: "pro",
        name: "Akun Profesional",
        description: "Paling diminati untuk agensi digital, startup & tim produk.",
        workspaces: "5",
        price: "Rp 990.000",
        priceAmount: 990000,
        monthlyPrice: "Rp 129.000",
        monthlyPriceAmount: 129000,
        yearlyPrice: "Rp 990.000",
        yearlyPriceAmount: 990000,
        features: ["Hingga 5 Workspace Aktif", "Kolaborasi Multi-Tim & RBAC", "Custom Domain Routing", "Audit Log & Security Center", "Dukungan Prioritas 24/7"],
        popular: true
      },
      {
        id: "enterprise",
        name: "Akun Bisnis & Agensi",
        description: "Kapasitas besar untuk software house & agensi berskala.",
        workspaces: "10",
        price: "Rp 2.490.000",
        priceAmount: 2490000,
        monthlyPrice: "Rp 299.000",
        monthlyPriceAmount: 299000,
        yearlyPrice: "Rp 2.490.000",
        yearlyPriceAmount: 2490000,
        features: ["Hingga 10 Workspace Aktif", "Multi-Tenant Enterprise Hub", "Dedicated White-Label Branding", "Custom Role & Fine-Grained Permissions", "Dedicated Account Manager & SLA 99.9%"],
        popular: false
      }
    ]

    if (accountPlans.length < 3) {
      accountPlans = canonicalPlans
    }

    const PLAN_ORDER: Record<string, number> = { free: 1, starter: 2, pro: 3, enterprise: 4 }
    accountPlans.sort((a, b) => (PLAN_ORDER[a.id] || 99) - (PLAN_ORDER[b.id] || 99) || (a.priceAmount || 0) - (b.priceAmount || 0))
  } catch (err) {
    console.error("Failed to fetch account plans:", err)
  }

  // 2. Fetch Active Workspaces Count & Usage & AI Credits
  let activeWorkspacesCount = 0
  let usage: any = null
  let aiCreditUsage: any = null
  try {
    const { enforceUserPlanLimit, enforceUserAiCredits } = await import("@/lib/plan-enforcement")
    const [workspaceEnforcement, aiCreditEnforcement] = await Promise.all([
      enforceUserPlanLimit(session.user.id, "workspaces"),
      enforceUserAiCredits(session.user.id, 0)
    ])
    
    usage = {
      current: workspaceEnforcement.current,
      max: workspaceEnforcement.max,
      allowed: workspaceEnforcement.allowed,
      plan: workspaceEnforcement.planSlug
    }
    activeWorkspacesCount = workspaceEnforcement.current

    aiCreditUsage = {
      used: aiCreditEnforcement.current,
      total: aiCreditEnforcement.max,
      remaining: aiCreditEnforcement.remaining,
      isUnlimited: aiCreditEnforcement.max >= 900000
    }
  } catch (err) {
    console.error("Failed to fetch usage:", err)
  }

  // 3. Fetch Transaction History
  let transactions: any[] = []
  try {
    const tx = await getTransactionHistoryAction()
    if (tx) {
      transactions = tx
    }
  } catch (err) {
    console.error("Failed to fetch transactions:", err)
  }

  // 4. Fetch User's Master Infrastructure Settings — masked. Real secrets
  // (DB connection string, S3 secret key) never leave the server as a page
  // prop; the client fetches a masked view then reveals one field on demand
  // via GET /api/auth/user/infrastructure.
  let masterInfra = { databaseUrl: "", storageConfig: null as any }
  try {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { masterDatabaseUrl: true, masterStorageConfig: true }
    })
    if (user) {
      const storageConfig = (user.masterStorageConfig as any) || {}
      masterInfra.databaseUrl = user.masterDatabaseUrl ? "••••••••" : ""
      masterInfra.storageConfig = {
        bucket: storageConfig.bucket || "",
        region: storageConfig.region || "",
        accessKeyId: storageConfig.accessKeyId ? "••••••••" : "",
        secretAccessKey: storageConfig.secretAccessKey ? "••••••••" : "",
      }
    }
  } catch (err) {
    console.error("Failed to fetch master infra:", err)
  }

  // 5. Fetch AI Credit Packs from SaCMS Global
  const { AI_CREDIT_PACKS } = await import("@/lib/constants/tenant-limits")
  let aiCreditPacks = AI_CREDIT_PACKS
  try {
    const aiEntries = await db.contentEntry.findMany({
      where: { contentType: { slug: "sacms-ai-pricing" }, status: "PUBLISHED" },
      orderBy: { createdAt: "asc" }
    })
    if (aiEntries.length > 0) {
      aiCreditPacks = aiEntries.map(t => {
        const d = (typeof t.data === 'string' ? JSON.parse(t.data) : t.data) as any
        return {
          id: d.pack_slug || t.id,
          name: d.name || "AI Credits",
          credits: Number(d.credits) || 0,
          price_usd: Number(d.price_usd) || 0,
          price_idr: Number(d.price) || 0,
          badge: d.badge || undefined,
          description: d.description || "",
          features: Array.isArray(d.features) ? d.features : []
        }
      }).sort((a, b) => a.price_idr - b.price_idr)
    }
  } catch (err) {
    console.error("Failed to fetch AI credit packs from DB:", err)
  }

  return (
    <BillingClient 
      initialAccountPlans={accountPlans}
      initialAiCreditPacks={aiCreditPacks}
      initialActiveWorkspacesCount={activeWorkspacesCount}
      initialUsage={usage}
      initialAiCreditUsage={aiCreditUsage}
      initialTransactions={transactions}
      isEnterpriseMode={enterprise}
      initialMasterInfra={masterInfra}
    />
  )
}
