import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { decryptCredential } from "@/lib/infrastructure/encryption"
import { checkServerHealth, restartServer, startServer, stopServer, destroyServer, syncServerDns } from "@/lib/infrastructure/provisioner"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { deployTenantDatabaseSchema, testDatabaseConnection } from "@/lib/infrastructure/migration-runner"
import { withAdminAuth, apiError } from "@/lib/api/route-helpers"

export const GET = withAdminAuth(async (_req, context) => {
  const { id } = await context.params

  const server = await db.infrastructureServer.findUnique({
    where: { id },
    include: { tenant: true, credentials: true },
  })
  if (!server) return apiError("not_found", { message: "Server not found" })

  let decryptedInfo: any = null
  if (server.credentials) {
    try {
      decryptedInfo = {
        databaseName: server.credentials.databaseName,
        dbUser: server.credentials.dbUser,
        dbPassword: decryptCredential(server.credentials.dbPasswordEncrypted),
        minioUser: server.credentials.minioUser,
        minioSecret: decryptCredential(server.credentials.minioSecretEncrypted),
        connectionString: decryptCredential(server.credentials.connectionStringEncrypted),
        s3Endpoint: server.credentials.s3Endpoint,
        s3Bucket: server.credentials.s3Bucket,
        s3PublicUrl: server.credentials.s3PublicUrl,
      }
    } catch (e: any) {
      console.error("Failed to decrypt credentials for server:", e)
    }
  }

  return NextResponse.json({
    server: { ...server, credentials: undefined },
    credentials: decryptedInfo,
  })
})

export const POST = withAdminAuth(async (req, context, { session }) => {
  const { id } = await context.params
  const { action } = await req.json()

  switch (action) {
    case "health-check":
      return NextResponse.json(await checkServerHealth(id))
    case "restart": {
      const ok = await restartServer(id)
      logAudit({ userId: session.user.id, action: AuditAction.SETTINGS_UPDATED, entity: "InfrastructureServerRestart", entityId: id, data: { success: ok } })
      return NextResponse.json({ success: ok, message: ok ? "Restart signal sent to VPS" : "Restart failed" })
    }
    case "stop": {
      const ok = await stopServer(id)
      logAudit({ userId: session.user.id, action: AuditAction.SETTINGS_UPDATED, entity: "InfrastructureServerStop", entityId: id, data: { success: ok } })
      return NextResponse.json({ success: ok, message: ok ? "Stop signal sent to VPS" : "Stop failed" })
    }
    case "start": {
      const ok = await startServer(id)
      logAudit({ userId: session.user.id, action: AuditAction.SETTINGS_UPDATED, entity: "InfrastructureServerStart", entityId: id, data: { success: ok } })
      return NextResponse.json({ success: ok, message: ok ? "Start signal sent to VPS" : "Start failed" })
    }
    case "sync-dns":
      return NextResponse.json(await syncServerDns(id))
    case "sync-schema":
    case "test-db": {
      const server = await db.infrastructureServer.findUnique({ where: { id }, include: { credentials: true } })
      if (!server || !server.credentials) {
        return apiError("not_found", { message: "Server credentials not found" })
      }
      const rawDbUrl = decryptCredential(server.credentials.connectionStringEncrypted)
      if (action === "sync-schema") return NextResponse.json(await deployTenantDatabaseSchema(rawDbUrl))
      const ok = await testDatabaseConnection(rawDbUrl, 5000)
      return NextResponse.json({
        success: ok,
        message: ok
          ? "PostgreSQL database is online & accepting connections"
          : "PostgreSQL connection timed out or failed",
      })
    }
    default:
      return apiError("validation", { message: "Invalid action" })
  }
})

export const DELETE = withAdminAuth(async (_req, context) => {
  const { id } = await context.params
  const ok = await destroyServer(id)
  return NextResponse.json({ success: ok, message: ok ? "Server destroyed and cleaned up" : "Destroy failed" })
})
