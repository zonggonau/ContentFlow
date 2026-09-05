import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { withAdminAuth, apiError } from "@/lib/api/route-helpers"
import { safeFetch } from "@/lib/safe-url"

export const GET = withAdminAuth(
  async () => {
    const [webhooks, recentLogs, deadLetters] = await Promise.all([
      db.webhook.findMany({
        select: {
          id: true,
          tenantId: true,
          name: true,
          url: true,
          enabled: true,
          lastTriggeredAt: true,
          failureCount: true,
          createdAt: true,
          updatedAt: true,
          hookType: true,
          events: true,
          // secret is deliberately excluded — never return it to the admin UI
          tenant: {
            select: { id: true, name: true, slug: true }
          },
          _count: {
            select: { deadLetters: true, logs: true }
          }
        },
        orderBy: { updatedAt: "desc" },
        take: 50
      }),
      db.webhookLog.findMany({
        include: {
          webhook: {
            select: { id: true, name: true, url: true, tenantId: true }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 30
      }),
      db.webhookDeadLetter.findMany({
        include: {
          webhook: {
            select: {
              id: true,
              name: true,
              url: true,
              tenant: { select: { id: true, name: true, slug: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 50
      })
    ])

    return NextResponse.json({
      webhooks,
      recentLogs,
      deadLetters,
      stats: {
        totalWebhooks: webhooks.length,
        activeWebhooks: webhooks.filter(w => w.enabled).length,
        deadLetterCount: deadLetters.length,
        successLogsCount: recentLogs.filter(l => l.success).length,
        failedLogsCount: recentLogs.filter(l => !l.success).length,
      }
    })
  },
  { allowRoles: ["admin"] },
)

export const POST = withAdminAuth(
  async (request, _context, { session }) => {
    const { deadLetterId, action } = await request.json()

    if (action === "retry" && deadLetterId) {
      const deadLetter = await db.webhookDeadLetter.findUnique({
        where: { id: deadLetterId },
        include: { webhook: true }
      })

      if (!deadLetter) {
        return apiError("not_found", { message: "Dead letter not found" })
      }

      // Perform retry delivery
      let statusCode: number | null = null
      let success = false
      let responseBody: any = null
      let errorMsg: string | null = null
      const startTime = Date.now()

      try {
        const payloadData = typeof deadLetter.payload === "string" 
          ? JSON.parse(deadLetter.payload) 
          : deadLetter.payload

        const res = await safeFetch(deadLetter.webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-SaCMS-Event": deadLetter.event,
            "X-SaCMS-Delivery": deadLetter.id,
            "X-SaCMS-Retry": String(deadLetter.attempts + 1),
            ...(deadLetter.webhook.headers as Record<string, string> || {}),
          },
          body: JSON.stringify(payloadData),
          signal: AbortSignal.timeout(10000)
        })

        statusCode = res.status
        success = res.ok
        try {
          responseBody = await res.json()
        } catch {
          responseBody = { statusText: res.statusText }
        }
      } catch (err: any) {
        errorMsg = err.message || "Network delivery error"
      }

      const duration = Date.now() - startTime

      // Log the retry attempt
      await db.webhookLog.create({
        data: {
          webhookId: deadLetter.webhookId,
          event: deadLetter.event,
          statusCode,
          success,
          duration,
          error: errorMsg,
          payload: deadLetter.payload as any,
          response: responseBody as any,
        }
      })

      if (success) {
        // Remove from DLQ if delivered successfully
        await db.webhookDeadLetter.delete({
          where: { id: deadLetterId }
        })
        return NextResponse.json({ success: true, message: "Webhook retry delivered successfully" })
      } else {
        // Update attempts and last error
        await db.webhookDeadLetter.update({
          where: { id: deadLetterId },
          data: {
            attempts: { increment: 1 },
            lastError: errorMsg || `HTTP ${statusCode}`,
            updatedAt: new Date()
          }
        })
        return NextResponse.json({ success: false, error: errorMsg || `HTTP ${statusCode}` }, { status: 400 })
      }
    }

    if (action === "purge_all") {
      const { count } = await db.webhookDeadLetter.deleteMany({})
      logAudit({
        userId: session.user.id,
        action: AuditAction.SETTINGS_UPDATED,
        entity: "WebhookDeadLetterQueuePurged",
        data: { count },
      })
      return NextResponse.json({ success: true, message: "Dead letter queue purged" })
    }

    return apiError("validation", { message: "Invalid action" })
  },
  { allowRoles: ["admin"] },
)
