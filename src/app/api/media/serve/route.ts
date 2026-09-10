import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/database"
import { resolveWithinBase, SsrfError } from "@/lib/safe-url"
import { readFromStorage } from "@/lib/r2"
import path from "path"

/**
 * GET /api/media/serve?key=...
 * Serves private media files after permission check.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const key = searchParams.get("key")
    if (!key) return NextResponse.json({ error: "Key is required" }, { status: 400 })

    // 1. Identify tenant from key (Format: upload/tenant-slug/...)
    const parts = key.split("/").filter(Boolean)
    const tenantSlug = parts[1]
    if (parts[0] !== "upload" || !tenantSlug || !/^[a-z0-9-]+$/i.test(tenantSlug)) {
      return NextResponse.json({ error: "Invalid key format" }, { status: 400 })
    }

    // 2. Check if user belongs to this tenant
    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true }
    })

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

    const membership = await db.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: session.user.id }
    })

    if (!membership && session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // 3. Reject any `key` that could escape the tenant's own directory
    //    before it's used against either local disk or the storage bucket.
    const tenantBase = path.join(process.cwd(), "public", "upload", tenantSlug)
    try {
      resolveWithinBase(tenantBase, ...parts.slice(2))
    } catch (e) {
      if (e instanceof SsrfError) {
        return NextResponse.json({ error: "Invalid key" }, { status: 400 })
      }
      throw e
    }

    // 4. Read the object wherever it actually lives — local disk, or R2/S3
    //    if this tenant/instance is storage-configured. Uploads that went
    //    to R2 without a public bucket URL configured are referenced by
    //    this exact route (see buildUrl() in lib/r2.ts), so it must be able
    //    to fetch from R2 too, not just local disk.
    const stored = await readFromStorage(key)
    if (!stored) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const ext = path.extname(key).toLowerCase()
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".mp4": "video/mp4"
    }
    const contentType = stored.contentType || contentTypeMap[ext] || "application/octet-stream"

    return new NextResponse(new Uint8Array(stored.buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600"
      }
    })
  } catch (error) {
    console.error("Error serving private media:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
