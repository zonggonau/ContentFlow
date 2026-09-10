import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { withAdminAuth } from "@/lib/api/route-helpers"

/**
 * GET /api/admin/infrastructure/providers
 *
 * The full provider-side picture for the admin infrastructure dashboard:
 *  - every Contabo compute instance on the account, bucketed VPS / VDS /
 *    Storage, cross-referenced with our InfrastructureServer records so a
 *    row that belongs to a tenant shows that tenant plus its health/metrics;
 *  - every Vercel project on the account/team.
 *
 * Each provider is fetched independently and degrades to an empty list with
 * `configured: false` (or `available: false` on an API error) rather than
 * failing the whole response.
 */
export const GET = withAdminAuth(async () => {
  const [
    { listContaboInstances, isContaboConfigured },
    { listVercelProjectsDetailed, isVercelConfigured },
  ] = await Promise.all([
    import("@/lib/infrastructure/contabo"),
    import("@/lib/vercel-client"),
  ])

  const contaboConfigured = isContaboConfigured()
  const vercelConfigured = await isVercelConfigured()

  const [contaboInstances, vercelProjects, trackedServers] = await Promise.all([
    contaboConfigured ? listContaboInstances().catch(() => null) : Promise.resolve([]),
    vercelConfigured ? listVercelProjectsDetailed().catch(() => null) : Promise.resolve([]),
    db.infrastructureServer
      .findMany({
        include: {
          tenant: { select: { id: true, name: true, slug: true, plan: true } },
        },
      })
      .catch(() => []),
  ])

  // providerServerId -> our tracked server record
  const trackedByProviderId = new Map<string, (typeof trackedServers)[number]>()
  for (const s of trackedServers) {
    if (s.providerServerId) trackedByProviderId.set(String(s.providerServerId), s)
  }

  const contaboAvailable = contaboInstances !== null
  const decorated = (contaboInstances || []).map((inst) => {
    const tracked = trackedByProviderId.get(inst.instanceId)
    return {
      ...inst,
      tracked: Boolean(tracked),
      serverId: tracked?.id ?? null,
      tenant: tracked?.tenant ?? null,
      healthStatus: tracked?.healthStatus ?? null,
      dbHealthStatus: tracked?.status ?? null,
      metricsSnapshot: tracked?.metricsSnapshot ?? null,
      lastHealthCheckAt: tracked?.lastHealthCheckAt ?? null,
    }
  })

  const vps = decorated.filter((i) => i.kind === "VPS")
  const vds = decorated.filter((i) => i.kind === "VDS")
  const storage = decorated.filter((i) => i.kind === "Storage")

  // A tracked server whose Contabo instance no longer appears in the live
  // list (deleted provider-side, or a `sim-` dev instance) — surfaced so it
  // isn't invisible in the dashboard.
  const liveIds = new Set(decorated.map((i) => i.instanceId))
  const orphanTracked = trackedServers
    .filter((s) => !s.providerServerId || !liveIds.has(String(s.providerServerId)))
    .map((s) => ({
      instanceId: s.providerServerId ? String(s.providerServerId) : `db-${s.id}`,
      name: s.name || s.hostname || "unknown",
      displayName: s.name || "",
      status: s.status,
      ipv4: s.ipv4 || "",
      ipv6: s.ipv6 || "",
      region: s.region || "",
      regionName: s.region || "",
      productId: "",
      productName: s.plan || "",
      kind: (s.plan?.toLowerCase().includes("vds")
        ? "VDS"
        : s.plan?.toLowerCase().includes("storage")
          ? "Storage"
          : "VPS") as "VPS" | "VDS" | "Storage",
      cpuCores: s.cpuCount,
      ramMb: s.ramMb,
      diskGb: s.diskGb,
      createdDate: s.createdAt?.toISOString() ?? null,
      tracked: true,
      serverId: s.id,
      tenant: s.tenant,
      healthStatus: s.healthStatus,
      dbHealthStatus: s.status,
      metricsSnapshot: s.metricsSnapshot,
      lastHealthCheckAt: s.lastHealthCheckAt,
      orphan: true as const,
    }))

  for (const o of orphanTracked) {
    if (o.kind === "VDS") vds.push(o as any)
    else if (o.kind === "Storage") storage.push(o as any)
    else vps.push(o as any)
  }

  return NextResponse.json({
    contabo: {
      configured: contaboConfigured,
      available: contaboAvailable,
      counts: { vps: vps.length, vds: vds.length, storage: storage.length },
      vps,
      vds,
      storage,
    },
    vercel: {
      configured: vercelConfigured,
      available: vercelProjects !== null,
      count: (vercelProjects || []).length,
      projects: vercelProjects || [],
    },
  })
})
