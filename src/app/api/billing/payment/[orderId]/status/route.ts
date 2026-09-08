import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/database"
import { getTransactionStatus } from "@/lib/midtrans"
import { logAudit, AuditAction } from "@/lib/audit-log"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { orderId } = await params

    // Find transaction
    const transaction = await db.paymentTransaction.findUnique({
      where: { orderId },
      include: {
        subscription: {
          include: {
            tenant: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    })

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    // SYNC WITH MIDTRANS IF PENDING
    if (transaction.status === "pending") {
      try {
        const midtransStatus = await getTransactionStatus(orderId)
        if (midtransStatus && (midtransStatus.transaction_status === "capture" || midtransStatus.transaction_status === "settlement")) {
          // Update transaction
          await db.paymentTransaction.update({
            where: { id: transaction.id },
            data: {
              status: "success",
              paymentType: midtransStatus.payment_type || null,
              transactionId: midtransStatus.transaction_id || null,
              transactionTime: midtransStatus.transaction_time ? new Date(midtransStatus.transaction_time) : new Date(),
              fraudStatus: midtransStatus.fraud_status || null,
              rawResponse: midtransStatus as any,
            },
          })

          // Update subscription
          if (transaction.subscriptionId) {
            await db.subscription.update({
              where: { id: transaction.subscriptionId },
              data: {
                status: "active",
                currentPeriodStart: new Date(),
              },
            })

            // Create invoice
            await db.invoice.create({
              data: {
                subscriptionId: transaction.subscriptionId,
                amount: transaction.amount,
                currency: "IDR",
                status: "paid",
                paidAt: new Date(),
                midtransInvoiceId: transaction.orderId
              },
            })

            // Update user or tenant plan / top-ups
            const sub = transaction.subscription
            if (sub) {
              if (sub.tenantId && !orderId.startsWith("ACC") && !orderId.startsWith("AIC") && !orderId.startsWith("ADD")) {
                const planLower = (sub.plan || "").toLowerCase()
                const hostingExpiry = sub.currentPeriodEnd || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

                await db.tenant.update({
                  where: { id: sub.tenantId },
                  data: {
                    plan: sub.plan,
                    hostingStatus: "active",
                    hostingExpiresAt: hostingExpiry,
                  } as any,
                })

                // Auto-provision dedicated VPS/VDS if plan is Enterprise / VPS / VDS
                if (planLower.includes("enterprise") || planLower.includes("vps") || planLower.includes("vds") || planLower.includes("postgres")) {
                  const { provisionTenantInfrastructure } = await import("@/lib/infrastructure/provisioner")
                  provisionTenantInfrastructure(sub.tenantId, {
                    plan: sub.plan,
                    subscriptionId: sub.id,
                  }).then(res => {
                    console.log(`[PaymentStatus] Auto-provisioned infrastructure for tenant ${sub.tenantId}:`, res.status)
                  }).catch(err => {
                    console.error(`[PaymentStatus] Failed auto-provisioning infrastructure for tenant ${sub.tenantId}:`, err)
                  })
                }
              } else if (orderId.startsWith("ACC") && sub.userId) {
                await db.user.update({
                  where: { id: sub.userId },
                  data: { plan: sub.plan },
                })
              } else if (orderId.startsWith("AIC") && sub.userId) {
                const raw = (transaction.rawResponse as any) || {}
                let creditsToAdd = Number(raw.credits || 0)
                const addonId = raw.addonId || ""

                if (!creditsToAdd) {
                  const { AI_CREDIT_PACKS } = await import("@/lib/constants/tenant-limits")
                  const pack = AI_CREDIT_PACKS.find(p => p.id === addonId)
                  if (pack) creditsToAdd = pack.credits
                }

                if (creditsToAdd > 0) {
                  await db.user.update({
                    where: { id: sub.userId },
                    data: { aiCreditsExtra: { increment: creditsToAdd } },
                  })
                }
              } else if (orderId.startsWith("ADD") && sub.tenantId) {
                const raw = (transaction.rawResponse as any) || {}
                const addonId = raw.addonId || ""

                if (addonId === "topup_ai_500k") {
                  await db.tenant.update({
                    where: { id: sub.tenantId },
                    data: { aiCreditsExtra: { increment: 500000 } } as any
                  })
                } else if (addonId === "topup_ai_2m") {
                  await db.tenant.update({
                    where: { id: sub.tenantId },
                    data: { aiCreditsExtra: { increment: 2000000 } } as any
                  })
                } else if (addonId === "topup_storage_10gb") {
                  await db.tenant.update({
                    where: { id: sub.tenantId },
                    data: { storageExtraBytes: { increment: BigInt(10 * 1024 * 1024 * 1024) } } as any
                  })
                } else if (addonId === "topup_api_500k") {
                  await db.tenant.update({
                    where: { id: sub.tenantId },
                    data: { apiCallsExtra: { increment: 500000 } } as any
                  })
                } else if (addonId === "hosting_annual_1yr" || addonId === "hosting_bundle_domain_1yr") {
                  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                  await db.tenant.update({
                    where: { id: sub.tenantId },
                    data: {
                      hostingStatus: "active",
                      hostingExpiresAt: oneYearFromNow,
                    } as any
                  })
                  await Promise.all([
                    db.setting.upsert({
                      where: { key: `${sub.tenantId}_hostingStatus` },
                      update: { value: "active" },
                      create: { tenantId: sub.tenantId, key: `${sub.tenantId}_hostingStatus`, value: "active" }
                    }),
                    db.setting.upsert({
                      where: { key: `${sub.tenantId}_hostingExpiresAt` },
                      update: { value: oneYearFromNow.toISOString() },
                      create: { tenantId: sub.tenantId, key: `${sub.tenantId}_hostingExpiresAt`, value: oneYearFromNow.toISOString() }
                    })
                  ])
                }
              }
            }
          } else if (orderId.startsWith("DOM")) {
            const raw = (transaction.rawResponse as any) || {}
            const tenantId = raw.tenantId
            const domainName = raw.domainName
            const expectedPriceUsd = raw.expectedPriceUsd || 14
            const contactInformation = raw.contactInformation

            if (tenantId && domainName) {
              const { purchaseDomain } = await import("@/lib/vercel-registrar")
              const purchaseRes = await purchaseDomain(domainName, {
                expectedPrice: expectedPriceUsd,
                years: raw.periodYears || 1,
                autoRenew: false,
                contactInformation: contactInformation || {
                  firstName: "Tenant",
                  lastName: "Owner",
                  address1: "Jakarta",
                  city: "Jakarta",
                  state: "DKI Jakarta",
                  postalCode: "10000",
                  country: "ID",
                  phone: "+62.812000000",
                  email: "domain@sacms.local",
                },
              })

              if (purchaseRes.success) {
                const currentCount = await db.customDomain.count({ where: { tenantId } })
                await db.customDomain.upsert({
                  where: { domain: domainName },
                  create: {
                    tenantId,
                    domain: domainName,
                    status: "verified",
                    verifiedAt: new Date(),
                    isPrimary: currentCount === 0,
                  },
                  update: {
                    status: "verified",
                    verifiedAt: new Date(),
                  },
                })

                const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })
                if (tenant) {
                  const { getRedis } = await import("@/lib/redis")
                  const redis = getRedis()
                  if (redis) {
                    await redis.set(`domain:${domainName}`, tenant.slug)
                  }
                }
              }
            }
          }

          // Reflect locally
          transaction.status = "success"
          if (transaction.subscription) transaction.subscription.status = "active"

          logAudit({
            userId: session.user.id,
            action: AuditAction.SETTINGS_UPDATED,
            entity: "PaymentTransactionSynced",
            entityId: transaction.id,
            data: { orderId, newStatus: "success", plan: transaction.subscription?.plan },
          })
        } else if (midtransStatus && (midtransStatus.transaction_status === "cancel" || midtransStatus.transaction_status === "deny" || midtransStatus.transaction_status === "expire")) {
          await db.paymentTransaction.update({
            where: { id: transaction.id },
            data: { status: "failed", rawResponse: midtransStatus as any },
          })
          transaction.status = "failed"

          logAudit({
            userId: session.user.id,
            action: AuditAction.SETTINGS_UPDATED,
            entity: "PaymentTransactionSynced",
            entityId: transaction.id,
            data: { orderId, newStatus: "failed" },
          })
        }
      } catch (err) {
        console.error("Failed to sync with Midtrans:", err)
      }
    }

    // Verify user has access to this tenant (or if it's an account plan, check userId)
    let hasAccess = false
    const isSuperAdmin = session.user.role === "super_admin"
    
    if (transaction.subscription?.tenant) {
      const membership = transaction.subscription.tenant.members.find(
        (m) => m.userId === session.user.id
      )
      hasAccess = !!membership || isSuperAdmin
    } else if (transaction.subscription?.userId) {
      // Account-level plan
      hasAccess = transaction.subscription.userId === session.user.id || isSuperAdmin
    } else if (orderId.startsWith("DOM")) {
      const raw = (transaction.rawResponse as any) || {}
      if (raw.tenantId) {
        const member = await db.tenantMember.findUnique({
          where: {
            tenantId_userId: {
              tenantId: raw.tenantId,
              userId: session.user.id,
            },
          },
        })
        hasAccess = !!member || isSuperAdmin
      } else {
        hasAccess = isSuperAdmin
      }
    } else {
      hasAccess = isSuperAdmin
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json({
      orderId: transaction.orderId,
      status: transaction.status,
      paymentType: transaction.paymentType,
      paymentMethod: transaction.paymentMethod,
      amount: transaction.amount,
      transactionId: transaction.transactionId,
      createdAt: transaction.createdAt,
      transactionTime: transaction.transactionTime,
      subscription: transaction.subscription
        ? {
            plan: transaction.subscription.plan,
            status: transaction.subscription.status,
            tenant: transaction.subscription.tenant ? {
              slug: transaction.subscription.tenant.slug,
              name: transaction.subscription.tenant.name,
            } : null
          }
        : null,
    })
  } catch (error) {
    console.error("Error fetching transaction status:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}