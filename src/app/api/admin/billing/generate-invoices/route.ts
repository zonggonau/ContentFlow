import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/database"
import { PLAN_PRICES, getDynamicWorkspacePrices, getDynamicAccountPrices } from "@/lib/midtrans"
import { secureEquals } from "@/lib/secure-compare"
import { withAdminAuth } from "@/lib/api/route-helpers"

/**
 * POST /api/admin/billing/generate-invoices
 * Generate monthly invoices for active subscriptions
 * This is meant to be called by a cron job
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron job secret
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      )
    }

    if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all active subscriptions
    const activeSubscriptions = await db.subscription.findMany({
      where: {
        status: "active",
        NOT: {
          cancelAtPeriodEnd: true,
        },
      },
      include: {
        tenant: true,
        user: true,
      },
    })

    const results = {
      processed: 0,
      skipped: 0,
      failed: 0,
      invoices: [] as Array<{
        subscriptionId: string
        tenantId: string
        amount: number
        status: string
        error?: string
      }>,
    }

    // Get current date
    const now = new Date()

    const dynamicWorkspacePrices = await getDynamicWorkspacePrices()
    const dynamicAccountPrices = await getDynamicAccountPrices()

    for (const subscription of activeSubscriptions) {
      try {
        // Check if subscription needs billing
        if (!subscription.currentPeriodEnd) {
          results.skipped++
          results.invoices.push({
            subscriptionId: subscription.id,
            tenantId: subscription.tenant!.id,
            amount: 0,
            status: "skipped",
            error: "No billing period end date",
          })
          continue
        }

        const periodEnd = new Date(subscription.currentPeriodEnd)

        // Check if billing period has ended
        if (periodEnd > now) {
          results.skipped++
          results.invoices.push({
            subscriptionId: subscription.id,
            tenantId: subscription.tenant!.id,
            amount: 0,
            status: "skipped",
            error: "Billing period not yet ended",
          })
          continue
        }

        // Check if billing is overdue by more than 7 days
        const daysOverdue = Math.floor(
          (now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (daysOverdue > 30) {
          results.skipped++
          results.invoices.push({
            subscriptionId: subscription.id,
            tenantId: subscription.tenant!.id,
            amount: 0,
            status: "skipped",
            error: "Billing overdue by more than 30 days",
          })
          continue
        }

        const isAccountPlan = !subscription.tenantId
        const dynamicPrices = isAccountPlan ? dynamicAccountPrices : dynamicWorkspacePrices
        const rawPrice = dynamicPrices[subscription.plan] ?? PLAN_PRICES[subscription.plan] ?? 0
        const planPrice = typeof rawPrice === 'number' ? rawPrice : rawPrice.monthly

        if (planPrice === 0) {
          // Free plan - extend period
          const newPeriodEnd = new Date(periodEnd)
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1)

          await db.subscription.update({
            where: { id: subscription.id },
            data: {
              currentPeriodStart: periodEnd,
              currentPeriodEnd: newPeriodEnd,
            },
          })

          results.skipped++
          results.invoices.push({
            subscriptionId: subscription.id,
            tenantId: subscription.tenant!.id,
            amount: 0,
            status: "skipped",
            error: "Free plan - period extended",
          })
          continue
        }

        // Generate invoice
        const newPeriodStart = periodEnd
        const newPeriodEnd = new Date(periodEnd)
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1)

        const invoice = await db.invoice.create({
          data: {
            subscriptionId: subscription.id,
            amount: planPrice,
            currency: "IDR",
            status: "pending",
            createdAt: now,
          },
        })

        // Update subscription period
        await db.subscription.update({
          where: { id: subscription.id },
          data: {
            currentPeriodStart: newPeriodStart,
            currentPeriodEnd: newPeriodEnd,
          },
        })

        results.processed++
        results.invoices.push({
          subscriptionId: subscription.id,
          tenantId: subscription.tenant!.id,
          amount: planPrice,
          status: "created",
        })

        // TODO: Send invoice notification via email/webhook
      } catch (error) {
        console.error(
          `Error processing subscription ${subscription.id}:`,
          error
        )
        results.failed++
        results.invoices.push({
          subscriptionId: subscription.id,
          tenantId: subscription.tenant!.id,
          amount: 0,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Processed ${results.processed} subscriptions, skipped ${results.skipped}, failed ${results.failed}`,
    })
  } catch (error) {
    console.error("Error generating invoices:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/billing/generate-invoices
 * Preview what invoices will be generated (for testing)
 */
export const GET = withAdminAuth(async () => {
    // Get all active subscriptions
    const activeSubscriptions = await db.subscription.findMany({
      where: {
        status: "active",
        NOT: {
          cancelAtPeriodEnd: true,
        },
      },
      include: {
        tenant: true,
        user: true,
      },
    })

    const now = new Date()

    const dynamicWorkspacePrices = await getDynamicWorkspacePrices()
    const dynamicAccountPrices = await getDynamicAccountPrices()

    const preview = activeSubscriptions.map((sub) => {
      const isAccountPlan = !sub.tenantId
      const dynamicPrices = isAccountPlan ? dynamicAccountPrices : dynamicWorkspacePrices
      const rawPrice = dynamicPrices[sub.plan] ?? PLAN_PRICES[sub.plan] ?? 0
      const price = typeof rawPrice === 'number' ? rawPrice : rawPrice.monthly

      return {
      subscriptionId: sub.id,
      tenantName: sub.tenant?.name || 'Account Plan',
      tenantSlug: sub.tenant?.slug || 'account-plan',
      plan: sub.plan,
      currentPeriodEnd: sub.currentPeriodEnd,
      planPrice: price,
      needsBilling:
        sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) <= now,
      daysOverdue:
        sub.currentPeriodEnd
          ? Math.floor(
              (now.getTime() - new Date(sub.currentPeriodEnd).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 0,
    }})

    const totalPendingInvoices = preview.filter((p) => p.needsBilling).length
    const totalRevenue = preview
      .filter((p) => p.needsBilling)
      .reduce((sum, p) => sum + p.planPrice, 0)

    const formatPrice = (price: number) => {
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
      }).format(price)
    }

    return NextResponse.json({
      totalActiveSubscriptions: activeSubscriptions.length,
      totalPendingInvoices,
      totalRevenue,
      totalRevenueFormatted: formatPrice(totalRevenue),
      preview,
      timestamp: now.toISOString(),
    })
})