import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/database"
import { logAudit, AuditAction } from "@/lib/audit-log"

const MASK = "••••••••"

// GET /api/auth/user/infrastructure - masked view of the current user's
// master DB/S3 override. Real secrets never leave the server here; use
// ?reveal=databaseUrl|s3SecretKey|s3AccessKey to fetch one real value on
// demand (audited).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { masterDatabaseUrl: true, masterStorageConfig: true },
  })

  const storageConfig = (user?.masterStorageConfig as any) || {}
  const reveal = req.nextUrl.searchParams.get("reveal")

  if (reveal) {
    const REVEALABLE = ["databaseUrl", "s3AccessKey", "s3SecretKey"] as const
    if (!REVEALABLE.includes(reveal as any)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 })
    }
    const values: Record<string, string> = {
      databaseUrl: user?.masterDatabaseUrl || "",
      s3AccessKey: storageConfig.accessKeyId || "",
      s3SecretKey: storageConfig.secretAccessKey || "",
    }
    logAudit({
      userId: session.user.id,
      action: AuditAction.SETTINGS_UPDATED,
      entity: "UserMasterInfraRevealed",
      data: { field: reveal },
    })
    return NextResponse.json({ field: reveal, value: values[reveal] })
  }

  return NextResponse.json({
    databaseUrl: user?.masterDatabaseUrl ? MASK : "",
    s3Bucket: storageConfig.bucket || "",
    s3Region: storageConfig.region || "",
    s3AccessKey: storageConfig.accessKeyId ? MASK : "",
    s3SecretKey: storageConfig.secretAccessKey ? MASK : "",
  })
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only Enterprise users can set master infrastructure
    if (session.user.plan !== "enterprise") {
      return NextResponse.json({ error: "Forbidden: Enterprise plan required" }, { status: 403 })
    }

    const data = await req.json()
    const { databaseUrl, s3Bucket, s3Region, s3AccessKey, s3SecretKey } = data

    const existing = await db.user.findUnique({
      where: { id: session.user.id },
      select: { masterDatabaseUrl: true, masterStorageConfig: true },
    })
    const existingStorage = (existing?.masterStorageConfig as any) || {}

    const nextDatabaseUrl = databaseUrl === MASK ? existing?.masterDatabaseUrl || "" : databaseUrl || ""
    const nextAccessKey = s3AccessKey === MASK ? existingStorage.accessKeyId || "" : s3AccessKey || ""
    const nextSecretKey = s3SecretKey === MASK ? existingStorage.secretAccessKey || "" : s3SecretKey || ""

    await db.user.update({
      where: { id: session.user.id },
      data: {
        masterDatabaseUrl: nextDatabaseUrl,
        masterStorageConfig: {
          bucket: s3Bucket || "",
          region: s3Region || "",
          accessKeyId: nextAccessKey,
          secretAccessKey: nextSecretKey,
        },
      },
    })

    logAudit({
      userId: session.user.id,
      action: AuditAction.SETTINGS_UPDATED,
      entity: "UserMasterInfraUpdated",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to update user infrastructure:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
