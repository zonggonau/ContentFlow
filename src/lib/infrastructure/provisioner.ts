import { db } from '../database'
import { Prisma } from '../../../prisma/generated-client'
import { generateSecurePassword, encryptCredential, decryptCredential } from './encryption'
import { generateCloudInitScript } from './cloud-init'
import {
  createContaboInstance,
  getContaboInstance,
  startContaboInstance,
  restartContaboInstance,
  stopContaboInstance,
  deleteContaboInstance,
  findOrCreateSacmsFirewall,
  assignFirewallToInstance,
  CONTABO_PLANS,
  DEFAULT_CONTABO_REGION,
} from './contabo'
import { createOrUpdateDnsRecord, deleteDnsRecord } from './dns'
import { testDatabaseConnection, deployTenantDatabaseSchema } from './migration-runner'
import { logAudit } from '../audit-log'

export interface ProvisionOptions {
  plan?: string // e.g. "vps-s"
  region?: string // "EU" | "US-central" | "SIN"
  diskGb?: number
  ramMb?: number
  cpuCount?: number
  subscriptionId?: string
  autoActivateAsync?: boolean // default true
}

export interface ProvisionResult {
  success: boolean
  serverId?: string
  status: string
  message: string
  dbHost?: string
  mediaHost?: string
  databaseUrl?: string
  storageConfig?: {
    endpoint: string
    accessKey: string
    bucket: string
    publicUrl: string
  }
}

/**
 * Main Orchestrator to provision a dedicated Contabo VPS + PostgreSQL 17 + MinIO S3 for a tenant.
 * Follows an async state machine: REQUESTED -> PROVISIONING -> CONFIGURING -> HEALTHCHECK -> ACTIVE.
 */
export async function provisionTenantInfrastructure(
  tenantIdOrSlug: string,
  options: ProvisionOptions = {}
): Promise<ProvisionResult> {
  const tenant = await db.tenant.findFirst({
    where: {
      OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }],
    },
  })

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantIdOrSlug}`)
  }

  const baseDomain = process.env.INFRA_BASE_DOMAIN || 'sacms.cloud'
  const dbDomain = `db-${tenant.slug}.${baseDomain}`
  const mediaDomain = `media-${tenant.slug}.${baseDomain}`

  const dbUser = 'sacms_user'
  const dbName = 'sacms_db'
  const dbPassword = generateSecurePassword(24)

  const minioUser = 'sacms_storage'
  const minioPassword = generateSecurePassword(32)
  const minioBucket = 'sacms-media'

  const requestedPlan = options.plan || 'vps-s'
  const planConfig = CONTABO_PLANS[requestedPlan] || CONTABO_PLANS['vps-s']

  // 1. Create Initial Server Record in 'provisioning' state
  const server = await db.infrastructureServer.create({
    data: {
      tenantId: tenant.id,
      subscriptionId: options.subscriptionId,
      provider: 'contabo',
      name: `Dedicated ${planConfig.type} - ${tenant.name}`,
      hostname: `${planConfig.type.toLowerCase()}-${tenant.slug}.${baseDomain}`,
      region: options.region || DEFAULT_CONTABO_REGION,
      plan: planConfig.id,
      diskGb: options.diskGb || planConfig.diskGb,
      ramMb: options.ramMb || planConfig.ramMb,
      cpuCount: options.cpuCount || planConfig.cpuCores,
      status: 'provisioning',
      dbHost: dbDomain,
      dbPort: 5432,
      mediaHost: mediaDomain,
      mediaPort: 443,
      healthStatus: 'unknown',
    },
  })

  try {
    // 2. Ensure SaCMS Cloud Firewall is created/present
    const firewallId = await findOrCreateSacmsFirewall('sacms-enterprise-firewall')

    // 3. Generate Cloud-Init Config with hardened UFW rules
    const cloudInitScript = generateCloudInitScript({
      tenantSlug: tenant.slug,
      dbName,
      dbUser,
      dbPassword,
      minioUser,
      minioPassword,
      minioBucket,
      dbDomain,
      mediaDomain,
    })

    // 4. Order/Create Instance on Contabo (VPS or VDS)
    const instance = await createContaboInstance({
      displayName: `sacms-${tenant.slug}`,
      userData: cloudInitScript,
      region: options.region || DEFAULT_CONTABO_REGION,
      productId: planConfig.productId,
    })

    const serverIpv4 = instance.ipv4

    // 5. Attach Cloud Firewall to the Instance
    if (firewallId && instance.instanceId) {
      await assignFirewallToInstance(firewallId, instance.instanceId).catch(err => {
        console.warn(`[Provisioner] Could not attach firewall ${firewallId} to instance ${instance.instanceId}:`, err)
      })
    }

    // 6. Update Server Record with Provider Details & transition to 'configuring'
    await db.infrastructureServer.update({
      where: { id: server.id },
      data: {
        providerServerId: String(instance.instanceId),
        ipv4: serverIpv4,
        status: 'configuring',
      },
    })

    // 7. Register DNS Records on Cloudflare (direct IP, DNS-only)
    if (serverIpv4) {
      await createOrUpdateDnsRecord(dbDomain, serverIpv4, false)
      await createOrUpdateDnsRecord(mediaDomain, serverIpv4, false)
    }

    // 8. Build Connection Strings & Endpoints
    const connectionString = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@${serverIpv4 || dbDomain}:5432/${dbName}?sslmode=require`
    const s3Endpoint = `https://${mediaDomain}`
    const s3PublicUrl = `https://${mediaDomain}/${minioBucket}`

    // 9. Encrypt and Save Credentials
    await db.infrastructureCredential.create({
      data: {
        serverId: server.id,
        databaseName: dbName,
        dbUser,
        dbPasswordEncrypted: encryptCredential(dbPassword),
        minioUser,
        minioSecretEncrypted: encryptCredential(minioPassword),
        connectionStringEncrypted: encryptCredential(connectionString),
        s3Endpoint,
        s3Bucket: minioBucket,
        s3PublicUrl,
      },
    })

    const storageConfig = {
      endpoint: s3Endpoint,
      accessKey: minioUser,
      secretKey: minioPassword,
      bucket: minioBucket,
      publicUrl: s3PublicUrl,
    }

    // 10. Launch Background Verification & Activation Poller (Non-blocking)
    if (options.autoActivateAsync !== false) {
      // Run asynchronous activation worker in background
      runAsyncServerActivation(server.id).catch(err => {
        console.error(`[Provisioner] Background activation failed for server ${server.id}:`, err)
      })
    }

    return {
      success: true,
      serverId: server.id,
      status: 'configuring',
      message: 'Dedicated VPS provisioning initiated. Server is configuring and will activate once database is online.',
      dbHost: dbDomain,
      mediaHost: mediaDomain,
      databaseUrl: connectionString,
      storageConfig,
    }
  } catch (error: any) {
    console.error(`[Provisioner] Error provisioning infrastructure for tenant ${tenant.slug}:`, error)

    await db.infrastructureServer.update({
      where: { id: server.id },
      data: {
        status: 'error',
        errorMessage: error?.message || 'Provisioning failed',
      },
    })

    return {
      success: false,
      serverId: server.id,
      status: 'error',
      message: error?.message || 'Provisioning failed',
    }
  }
}

/**
 * Background Asynchronous Activation Worker:
 * Polls VPS health until PostgreSQL is reachable and schema migration succeeds,
 * then activates the server and updates tenant routing.
 */
export async function runAsyncServerActivation(
  serverId: string,
  maxAttempts = 30,
  intervalMs = 10000
): Promise<boolean> {
  console.log(`[Provisioner] Starting async activation loop for server ${serverId}...`)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const server = await db.infrastructureServer.findUnique({
        where: { id: serverId },
        include: { credentials: true, tenant: true },
      })

      if (!server || !server.credentials) {
        console.warn(`[Provisioner] Server ${serverId} no longer exists or credentials missing. Aborting.`)
        return false
      }

      if (server.status === 'destroyed' || server.status === 'error') {
        console.warn(`[Provisioner] Server ${serverId} is in '${server.status}' state. Aborting.`)
        return false
      }

      // Check if instance is ready on Contabo
      if (server.providerServerId && !server.providerServerId.startsWith('sim-')) {
        try {
          const contaboInfo = await getContaboInstance(server.providerServerId)
          if (contaboInfo.ipv4 && contaboInfo.ipv4 !== server.ipv4) {
            await db.infrastructureServer.update({
              where: { id: serverId },
              data: { ipv4: contaboInfo.ipv4 },
            })
          }
        } catch (e) {
          console.warn(`[Provisioner] Failed to poll Contabo status on attempt ${attempt}:`, e)
        }
      }

      // Test PostgreSQL database connectivity
      const rawDbUrl = decryptCredential(server.credentials.connectionStringEncrypted)
      const dbConnected = await testDatabaseConnection(rawDbUrl, 4000)

      if (dbConnected) {
        console.log(`[Provisioner] Database reachable for server ${serverId} on attempt ${attempt}. Deploying schema...`)

        // Deploy schema to newly provisioned tenant DB
        const migrationResult = await deployTenantDatabaseSchema(rawDbUrl)

        if (migrationResult.success) {
          console.log(`[Provisioner] Schema deployed successfully for tenant ${server.tenant.slug}. Activating tenant DB routing...`)

          const s3Endpoint = server.credentials.s3Endpoint
          const minioUser = server.credentials.minioUser
          const minioPassword = decryptCredential(server.credentials.minioSecretEncrypted)
          const minioBucket = server.credentials.s3Bucket
          const s3PublicUrl = server.credentials.s3PublicUrl || `${s3Endpoint}/${minioBucket}`

          const storageConfig = {
            endpoint: s3Endpoint,
            accessKey: minioUser,
            secretKey: minioPassword,
            bucket: minioBucket,
            publicUrl: s3PublicUrl,
          }

          // 1. Activate Tenant Database & Storage Routing in master DB
          await db.tenant.update({
            where: { id: server.tenantId },
            data: {
              databaseUrl: rawDbUrl,
              storageConfig: storageConfig as any,
            },
          })

          // 2. Mark Server as Active & Healthy
          await db.infrastructureServer.update({
            where: { id: serverId },
            data: {
              status: 'active',
              healthStatus: 'healthy',
              lastHealthCheckAt: new Date(),
              errorMessage: null,
            },
          })

          // 3. Write Audit Log
          logAudit({
            tenantId: server.tenantId,
            action: 'infrastructure.provisioned',
            entity: 'InfrastructureServer',
            entityId: serverId,
            data: {
              provider: server.provider,
              plan: server.plan,
              region: server.region,
              dbHost: server.dbHost,
              durationAttempts: attempt,
            },
          })

          console.log(`[Provisioner] Server ${serverId} is now ACTIVE and serving tenant ${server.tenant.slug}.`)
          return true
        } else {
          console.warn(`[Provisioner] Database connected but schema deployment failed: ${migrationResult.message}`)
        }
      }

      // Wait before next attempt
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }
    } catch (err: any) {
      console.warn(`[Provisioner] Error during activation attempt ${attempt} for server ${serverId}:`, err)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }
    }
  }

  // Timeout reached: mark as error
  console.error(`[Provisioner] Activation timeout reached (${maxAttempts * intervalMs / 1000}s) for server ${serverId}.`)
  await db.infrastructureServer.update({
    where: { id: serverId },
    data: {
      status: 'error',
      healthStatus: 'unhealthy',
      errorMessage: `Provisioning timeout: database did not become reachable within ${Math.round(maxAttempts * intervalMs / 60000)} minutes.`,
    },
  })

  logAudit({
    action: 'infrastructure.failed',
    entity: 'InfrastructureServer',
    entityId: serverId,
    data: {
      reason: 'timeout',
      maxAttempts,
    },
  })

  return false
}

/**
 * Health check a provisioned server
 */
export async function checkServerHealth(serverId: string): Promise<{
  healthy: boolean
  dbOk: boolean
  mediaOk: boolean
  message: string
}> {
  const server = await db.infrastructureServer.findUnique({
    where: { id: serverId },
    include: { credentials: true },
  })

  if (!server || !server.credentials) {
    throw new Error(`Server or credentials not found for ID: ${serverId}`)
  }

  const rawDbUrl = decryptCredential(server.credentials.connectionStringEncrypted)
  const dbOk = await testDatabaseConnection(rawDbUrl, 5000)

  let mediaOk = false
  try {
    const res = await fetch(`${server.credentials.s3Endpoint}/healthz`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    mediaOk = res.ok
  } catch {
    mediaOk = false
  }

  const healthy = dbOk && mediaOk
  const healthStatus = healthy ? 'healthy' : dbOk || mediaOk ? 'degraded' : 'unhealthy'

  // Only record what was actually measured. There is no in-VPS metrics
  // agent and Contabo's public API exposes no OS-level telemetry (CPU/RAM/
  // disk usage) — this used to fabricate those numbers with Math.random(),
  // which looked like real monitoring data but was never connected to
  // anything on the actual server. cpuCores/ramTotalMb/diskTotalGb are real
  // (from the provisioned spec); everything else genuinely unmeasured is
  // explicitly null so the UI can say "not available" instead of lying.
  const metricsSnapshot = {
    cpuUsagePercent: null,
    cpuCores: server.cpuCount,
    ramUsageMb: null,
    ramTotalMb: server.ramMb,
    ramUsagePercent: null,
    diskUsageGb: null,
    diskTotalGb: server.diskGb,
    diskUsagePercent: null,
    dbConnectionsActive: null,
    dbConnectionsMax: null,
    dbLatencyMs: null,
    mediaLatencyMs: null,
    dbOk,
    mediaOk,
    updatedAt: new Date().toISOString(),
  }

  await db.infrastructureServer.update({
    where: { id: serverId },
    data: {
      healthStatus,
      lastHealthCheckAt: new Date(),
      metricsSnapshot: metricsSnapshot as any,
    },
  })

  return {
    healthy,
    dbOk,
    mediaOk,
    message: healthy ? 'All systems operational' : `DB: ${dbOk ? 'OK' : 'FAIL'}, Media: ${mediaOk ? 'OK' : 'FAIL'}`,
  }
}

/**
 * Start a stopped server
 */
export async function startServer(serverId: string): Promise<boolean> {
  const server = await db.infrastructureServer.findUnique({
    where: { id: serverId },
  })
  if (!server || !server.providerServerId) return false
  return startContaboInstance(server.providerServerId)
}

/**
 * Stop/suspend a running server
 */
export async function stopServer(serverId: string): Promise<boolean> {
  const server = await db.infrastructureServer.findUnique({
    where: { id: serverId },
  })
  if (!server || !server.providerServerId) return false
  return stopContaboInstance(server.providerServerId)
}

/**
 * Restart server
 */
export async function restartServer(serverId: string): Promise<boolean> {
  const server = await db.infrastructureServer.findUnique({
    where: { id: serverId },
  })
  if (!server || !server.providerServerId) return false
  return restartContaboInstance(server.providerServerId)
}


/**
 * Destroy server and clean up DNS and credentials
 */
export async function destroyServer(serverId: string): Promise<boolean> {
  const server = await db.infrastructureServer.findUnique({
    where: { id: serverId },
    include: { tenant: true },
  })
  if (!server) return false

  // 1. Delete Contabo VPS
  if (server.providerServerId && !server.providerServerId.startsWith('sim-')) {
    await deleteContaboInstance(server.providerServerId).catch(console.error)
  }

  // 2. Delete DNS Records
  if (server.dbHost) await deleteDnsRecord(server.dbHost).catch(console.error)
  if (server.mediaHost) await deleteDnsRecord(server.mediaHost).catch(console.error)

  // 3. Reset Tenant databaseUrl and storageConfig
  if (server.tenantId) {
    await db.tenant.update({
      where: { id: server.tenantId },
      data: {
        databaseUrl: null,
        storageConfig: Prisma.DbNull,
      },
    }).catch(console.error)
  }

  // 4. If the server is in 'error' or already 'destroyed', purge record from DB
  if (server.status === 'destroyed' || server.status === 'error' || !server.providerServerId) {
    await db.infrastructureCredential.deleteMany({ where: { serverId } }).catch(() => {})
    await db.infrastructureServer.delete({ where: { id: serverId } }).catch(() => {})
    return true
  }

  // Otherwise mark server as destroyed
  await db.infrastructureServer.update({
    where: { id: serverId },
    data: {
      status: 'destroyed',
      healthStatus: 'unhealthy',
    },
  })

  return true
}

/**
 * Sync / Re-apply DNS Records for a server
 */
export async function syncServerDns(serverId: string): Promise<{ success: boolean; message: string }> {
  const server = await db.infrastructureServer.findUnique({
    where: { id: serverId },
    include: { tenant: true },
  })
  if (!server) return { success: false, message: 'Server not found' }
  if (!server.ipv4) return { success: false, message: 'Server IPv4 is not assigned' }

  try {
    if (server.dbHost) {
      await createOrUpdateDnsRecord(server.dbHost, server.ipv4, false)
    }
    if (server.mediaHost) {
      await createOrUpdateDnsRecord(server.mediaHost, server.ipv4, false)
    }
    return { success: true, message: `DNS records for ${server.dbHost} and ${server.mediaHost} synced to ${server.ipv4}` }
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to sync DNS records' }
  }
}
