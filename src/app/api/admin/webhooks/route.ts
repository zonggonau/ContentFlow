import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { withAdminAuth, apiError } from "@/lib/api/route-helpers"
import { safeFetch } from "@/lib/safe-url"

export const GET = withAdminAuth(
  async (request) => {
    const { searchParams } = request.nextUrl
    const webhooksPage = parseInt(searchParams.get("webhooksPage") || "1")
    const logsPage = parseInt(searchParams.get("logsPage") || "1")
    const dlqPage = parseInt(searchParams.get("dlqPage") || "1")
    const PAGE_SIZE = 30

    const [
      webhooks, webhooksTotal, recentLogs, logsTotal, deadLetters, dlqTotal,
      activeWebhooksCount, successLogsCount, failedLogsCount,
    ] = await Promise.all([
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
        skip: (webhooksPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.webhook.count(),
      db.webhookLog.findMany({
        include: {
          webhook: {
            select: { id: true, name: true, url: true, tenantId: true }
          }
        },
        orderBy: { createdAt: "desc" },
        skip: (logsPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.webhookLog.count(),
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
        skip: (dlqPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.webhookDeadLetter.count(),
      db.webhook.count({ where: { enabled: true } }),
      db.webhookLog.count({ where: { success: true } }),
      db.webhookLog.count({ where: { success: false } }),
    ])

    return NextResponse.json({
      webhooks,
      webhooksPage,
      webhooksTotalPages: Math.ceil(webhooksTotal / PAGE_SIZE),
      recentLogs,
      logsPage,
      logsTotalPages: Math.ceil(logsTotal / PAGE_SIZE),
      deadLetters,
      dlqPage,
      dlqTotalPages: Math.ceil(dlqTotal / PAGE_SIZE),
      stats: {
        totalWebhooks: webhooksTotal,
        activeWebhooks: activeWebhooksCount,
        deadLetterCount: dlqTotal,
        successLogsCount: successLogsCount,
        failedLogsCount: failedLogsCount,
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
