import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/database"
import { getPaymentProvider } from "@/lib/payment"
import { getDynamicAccountPrices, getDynamicWorkspacePrices, PlanType, calculatePeriodEndDate } from "@/lib/midtrans"
import { validateBody } from "@/lib/validate"
import { checkoutSchema } from "@/lib/validations"

/**
 * POST /api/checkout
 * Create a checkout session for subscription payment.
 * Uses the configured payment provider (PAYMENT_PROVIDER env var).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await validateBody(request, checkoutSchema)
    if ("error" in result) return result.error
    const { planId, tenantId, interval, type } = result.data

    const isAiCreditPack = type === "ai_credits" || planId.startsWith("ai_pack_")
    const isAccountPlan = !isAiCreditPack && (type === "account" || !tenantId)

    let amount = 0
    let planName = planId
    let isAddon = false
    let creditAmount = 0
    let targetId = tenantId || session.user.id

    let dbTenant: any = null;

    if (isAiCreditPack) {
      const { AI_CREDIT_PACKS } = await import("@/lib/constants/tenant-limits")
      const pack = AI_CREDIT_PACKS.find(p => p.id === planId)
      if (!pack) {
        return NextResponse.json({ error: "Invalid AI credit pack" }, { status: 400 })
      }
      amount = pack.price_idr
      planName = pack.name
      creditAmount = pack.credits
      isAddon = true
    } else if (isAccountPlan) {
      // Logic for account plan pricing
      const dynamicPrices = await getDynamicAccountPrices()
      const prices = dynamicPrices[planId] || { monthly: 0, yearly: 0 }
      amount = interval === 'year' ? prices.yearly : prices.monthly
      planName = planId.charAt(0).toUpperCase() + planId.slice(1)
    } else {
      // Get tenant and verify access
      const tenant = await db.tenant.findFirst({
        where: { 
          OR: [{ id: tenantId }, { slug: tenantId }]
        },
        include: { members: true },
      })
      dbTenant = tenant

      if (!tenant) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
      }

      // Check if user is a member of this tenant or super admin
      const membership = tenant.members.find(m => m.userId === session.user.id)
      const isSuperAdmin = session.user.role === "super_admin"

      if (!membership && !isSuperAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      // Only owner or admin can upgrade plan
      if (membership && membership.role !== "owner" && membership.role !== "admin") {
        return NextResponse.json(
          { error: "Only owner or admin can manage subscription" },
          { status: 403 }
        )
      }

      const BUILTIN_TOPUPS: Record<string, { name: string; price: number; quotaType: string; amountUnits: number }> = {
        topup_ai_500k: { name: "AI Booster (500K Tokens)", price: 25000, quotaType: "ai_tokens", amountUnits: 500000 },
        topup_ai_2m: { name: "AI Power Pack (2M Tokens)", price: 75000, quotaType: "ai_tokens", amountUnits: 2000000 },
        topup_storage_10gb: { name: "Extra Storage (10 GB)", price: 35000, quotaType: "storage", amountUnits: 10 * 1024 * 1024 * 1024 },
        topup_api_500k: { name: "Extra API Quota (500K Calls)", price: 30000, quotaType: "api_calls", amountUnits: 500000 },
        hosting_annual_1yr: { name: "Cloud Edge Hosting (1 Tahun)", price: 650000, quotaType: "hosting_annual", amountUnits: 1 },
        hosting_bundle_domain_1yr: { name: "Cloud Edge Hosting + Domain .com (1 Tahun)", price: 850000, quotaType: "hosting_bundle", amountUnits: 1 },
      }

      if (BUILTIN_TOPUPS[planId]) {
        const topup = BUILTIN_TOPUPS[planId]
        amount = topup.price
        planName = topup.name
        isAddon = true
      } else {
        const pricingContentTypes = await db.contentType.findMany({
          where: { slug: { in: ["sacms-workspace-pricing", "platform-pricing", "sacms-addons"] } }
        })

        if (pricingContentTypes.length > 0) {
          const contentTypeIds = pricingContentTypes.map(ct => ct.id)
          const planEntries = await db.contentEntry.findMany({
            where: { contentTypeId: { in: contentTypeIds }, status: "PUBLISHED" }
          })
          
          const planEntry = planEntries.find(e => {
            let d = e.data
            if (typeof d === 'string') {
              try { d = JSON.parse(d) } catch (e) { d = {} }
            }
            const data = d as any
            return data.plan_slug === planId || data.id === planId || e.id === planId || data.name?.toLowerCase() === planId.toLowerCase()
          })

          if (planEntry) {
            let d = planEntry.data
            if (typeof d === 'string') {
              try { d = JSON.parse(d) } catch (e) { d = {} }
            }
            const data = d as any
            
            let rawPrice = data.price || "0"
            let monthlyPrice = 0
            let yearlyPrice = 0
            if (typeof rawPrice === 'string') {
              monthlyPrice = parseInt(rawPrice.replace(/[^\d]/g, ''), 10) || 0
            } else {
              monthlyPrice = Number(rawPrice) || 0
            }
            
            if (data.yearly_price !== undefined) {
              yearlyPrice = Number(data.yearly_price)
            } else {
              yearlyPrice = monthlyPrice * 10
            }

            amount = interval === 'year' ? yearlyPrice : monthlyPrice
            planName = data.name || planId
            const addonContentType = pricingContentTypes.find(ct => ct.slug === "sacms-addons")
            isAddon = addonContentType?.id === planEntry.contentTypeId
          } else {
            const dynamicPrices = await getDynamicWorkspacePrices()
            const prices = dynamicPrices[planId] || { monthly: 0, yearly: 0 }
            amount = interval === 'year' ? prices.yearly : prices.monthly
            // Fallback to hardcoded PLAN_PRICES if dynamic returns 0
            if (!amount) {
              const { PLAN_PRICES } = await import('@/lib/midtrans')
              const base = PLAN_PRICES[planId] ?? 0
              amount = interval === 'year' ? base * 10 : base
            }
          }
        } else {
          const dynamicPrices = await getDynamicWorkspacePrices()
          const prices = dynamicPrices[planId] || { monthly: 0, yearly: 0 }
          amount = interval === 'year' ? prices.yearly : prices.monthly
          // Fallback to hardcoded PLAN_PRICES if dynamic returns 0
          if (!amount) {
            const { PLAN_PRICES } = await import('@/lib/midtrans')
            const base = PLAN_PRICES[planId] ?? 0
            amount = interval === 'year' ? base * 10 : base
          }
        }
      }
    }

    const today = new Date();
    const formattedDate = `${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getFullYear()}`;
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const countToday = await db.paymentTransaction.count({
      where: {
        createdAt: { gte: todayStart }
      }
    });
    
    const sequenceNumber = 1001 + countToday;
    const prefix = isAiCreditPack ? 'AIC' : (isAccountPlan ? 'ACC' : (isAddon ? 'ADD' : 'SUB'));
    const orderId = `${prefix}-${formattedDate}${sequenceNumber}`;

    // Get or create subscription
    let subscription = await db.subscription.findFirst({
      where: isAccountPlan || isAiCreditPack
        ? { userId: session.user.id, tenantId: { equals: null } as any } 
        : { tenantId: dbTenant.id },
    })

    let credit = 0;
    if (subscription && !isAddon && subscription.status !== 'canceled') {
      const { calculateProratedAmount } = await import("@/lib/midtrans")
      const proration = await calculateProratedAmount(
        subscription.plan,
        planId,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd
      )
      if (proration.isDowngrade && subscription.status === 'active') {
        return NextResponse.json(
          { error: "Downgrading an active subscription is not allowed. Please wait until your current billing period ends." }, 
          { status: 403 }
        )
      }
      credit = proration.credit || 0
    }

    const subtotal = Math.max(0, amount - credit)

    // Guard: Midtrans requires amount >= 1
    if (subtotal <= 0 || amount <= 0) {
      return NextResponse.json(
        { 
          error: "Harga paket ini belum dikonfigurasi. Silakan hubungi admin untuk mengatur harga paket terlebih dahulu.",
          code: "PRICE_NOT_CONFIGURED"
        },
        { status: 400 }
      )
    }

    // Calculate PPN (11%) on subtotal
    const vatAmount = Math.round(subtotal * 0.11)
    const totalAmount = subtotal + vatAmount

    if (!subscription) {
      subscription = await db.subscription.create({
        data: {
          userId: session.user.id,
          tenantId: (isAccountPlan || isAiCreditPack) ? null : dbTenant.id,
          plan: isAddon ? "free" : planId,
          status: 'pending',
          currentPeriodStart: new Date(),
          currentPeriodEnd: calculatePeriodEndDate(planId as PlanType, interval as any),
        },
      })
    }
 else {
      // Only update main plan if it's NOT an addon
      if (!isAddon) {
        subscription = await db.subscription.update({
          where: { id: subscription.id },
          data: {
            plan: planId,
            currentPeriodEnd: calculatePeriodEndDate(planId as PlanType, interval as any),
          },
        })
      }
    }

    // Store addon/AI credit info in rawResponse for later processing in the
    // webhook. Omit the field entirely for plain plan upgrades — a nullable
    // Json column must not be written as literal `null` (Prisma rejects it).
    const rawResponse = isAiCreditPack
      ? { isAddon: true, addonId: planId, credits: creditAmount, type: "ai_credits" }
      : isAddon
        ? { isAddon, addonId: planId }
        : undefined

    // Create payment transaction record
    const transaction = await db.paymentTransaction.create({
      data: {
        orderId,
        amount: totalAmount,
        status: 'pending',
        subscriptionId: subscription.id,
        ...(rawResponse ? { rawResponse: rawResponse as any } : {}),
      },
    })

    // Create payment via the abstracted provider
    const provider = getPaymentProvider()
    const paymentResult = await provider.createPayment({
      orderId,
      amount: totalAmount,
      customer: {
        email: session.user.email,
        firstName: session.user.name || 'User',
      },
      items: [
        {
          id: planId,
          name: isAddon ? `${planName} Add-on` : `${planName} Plan (${interval === 'year' ? 'Yearly' : 'Monthly'})`,
          price: subtotal,
          quantity: 1,
        },
        {
          id: 'VAT-11',
          name: 'PPN (11%)',
          price: vatAmount,
          quantity: 1,
        }
      ],
    })

    return NextResponse.json({
      token: paymentResult.token,
      redirect_url: paymentResult.redirectUrl,
      provider: provider.name,
      orderId,
      subscriptionId: subscription.id,
      transactionId: transaction.id,
    })
  } catch (error) {
    console.error("Error creating checkout session:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Gagal memproses transaksi checkout. Silakan coba lagi atau hubungi admin."
            : `Checkout error: ${message}`,
      },
      { status: 500 },
    )
  }
}