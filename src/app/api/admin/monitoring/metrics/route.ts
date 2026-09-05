import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { getRedis } from "@/lib/redis"
import { getResolvedMidtransConfig } from "@/lib/settings"
import { collectSystemMetrics } from "@/lib/monitoring"
import { withAdminAuth } from "@/lib/api/route-helpers"

// Real, live-checked component health — replaces a previous hardcoded
// "always HEALTHY" panel that never reflected actual system state.
async function checkComponentHealth() {
  const [apiGateway, database, midtrans, webhookWorker] = await Promise.all([
    (async () => {
      const start = Date.now()
      try {
        await db.$queryRaw`SELECT 1`
        return { name: "API Gateway", status: "HEALTHY" as const, detail: `${Date.now() - start}ms` }
      } catch {
        return { name: "API Gateway", status: "DOWN" as const, detail: "Unreachable" }
      }
    })(),
    (async () => {
      const start = Date.now()
      try {
        await db.$queryRaw`SELECT 1`
        return { name: "Database Cluster", status: "HEALTHY" as const, detail: `${Date.now() - start}ms` }
      } catch {
        return { name: "Database Cluster", status: "DOWN" as const, detail: "Connection failed" }
      }
    })(),
    (async () => {
      try {
        const config = await getResolvedMidtransConfig()
        if (!config.serverKey) return { name: "Payment Gateway Midtrans", status: "NOT_CONFIGURED" as const, detail: "No server key set" }
        return { name: "Payment Gateway Midtrans", status: "CONFIGURED" as const, detail: config.isProduction ? "Production" : "Sandbox" }
      } catch {
        return { name: "Payment Gateway Midtrans", status: "UNKNOWN" as const, detail: "Check failed" }
      }
    })(),
    (async () => {
      const redis = getRedis()
      if (!redis) return { name: "Webhook Worker", status: "NOT_CONFIGURED" as const, detail: "Redis not configured" }
      try {
        await redis.ping()
        return { name: "Webhook Worker", status: "RUNNING" as const, detail: "Redis reachable" }
      } catch {
        return { name: "Webhook Worker", status: "DOWN" as const, detail: "Redis unreachable" }
      }
    })(),
  ])
  return [apiGateway, database, midtrans, webhookWorker]
}

// GET /api/admin/monitoring/metrics - Get system metrics
export const GET = withAdminAuth(async () => {
    // Trigger precise real-time hardware metric aggregation and DB logging
    const [freshMetrics, componentHealth] = await Promise.all([
      collectSystemMetrics(),
      checkComponentHealth(),
    ])

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    // Get latest metrics from DB within the last hour
    const latestMetrics = await db.systemMetric.findMany({
      where: { timestamp: { gte: oneHourAgo } },
      orderBy: { timestamp: "desc" },
    })

    // Aggregate by type (get latest of each type)
    const seenTypes = new Set<string>()
    const metrics = latestMetrics.filter((m) => {
      if (seenTypes.has(m.type)) return false
      seenTypes.add(m.type)
      return true
    })

    // Fallback logic if database query returned nothing, using the fresh metrics collected
    if (metrics.length === 0 && freshMetrics) {
      return NextResponse.json({
        metrics: [
          { type: "cpu", value: freshMetrics.cpu, metadata: null, timestamp: freshMetrics.timestamp.toISOString() },
          { type: "memory", value: freshMetrics.memory, metadata: JSON.stringify(freshMetrics.memoryMetadata), timestamp: freshMetrics.timestamp.toISOString() },
          { type: "requests", value: freshMetrics.requests, metadata: null, timestamp: freshMetrics.timestamp.toISOString() },
          { type: "errors", value: freshMetrics.errors, metadata: null, timestamp: freshMetrics.timestamp.toISOString() },
        ],
        componentHealth,
      })
    }

    return NextResponse.json({ metrics, componentHealth })
})
