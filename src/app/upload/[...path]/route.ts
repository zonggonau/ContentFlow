import { NextRequest, NextResponse } from "next/server"
import { resolveWithinBase, SsrfError } from "@/lib/safe-url"
import fs from "fs"
import path from "path"

/**
 * Live-serves locally-stored media at the exact `/upload/<tenant>/...` URL
 * every local upload's `url`/`thumbnailUrl` already points to (see
 * uploadToLocal() in lib/r2.ts) — WITHOUT this route, that path was left to
 * Next.js's standalone production server's built-in `public/` static file
 * handler.
 *
 * The problem: that built-in handler resolves against a list of public
 * files it computes once when the server process starts, not a live
 * filesystem check on every request. A file written to `public/upload/...`
 * *after* the server has already booted (i.e. every single upload, since
 * uploads always happen against an already-running server) is invisible to
 * that list — the request falls through to the App Router, which renders
 * its own not-found page (confirmed in production: the response carries
 * Next's `Vary: rsc, next-router-state-tree, ...` headers, not a plain
 * static 404). The file really is sitting on disk the whole time; it just
 * takes the *next* deploy — a fresh server boot, which rescans the
 * Docker-volume-persisted upload directory — for it to become visible.
 * That exactly matches the reported symptom: "upload succeeds, thumbnail
 * shows broken, starts working after the next deploy."
 *
 * Next.js always prefers an actual route over a public static file when
 * both would match the same path, so simply having this route here is
 * enough to take over `/upload/*` and make every request check disk live,
 * fixing new AND previously-uploaded (already broken) files alike — no
 * database migration needed, since their stored `url` already points here.
 *
 * Deliberately unauthenticated: local disk is the default storage tier for
 * shared-plan workspaces and is meant to behave like a public bucket (the
 * same visibility a real R2 bucket with a public URL would have) — not
 * like the tenant-membership-gated `/api/media/serve` fallback, which
 * exists for a different case (R2 configured without a public URL).
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params
  if (!segments || segments.length === 0) {
    return new NextResponse("Not found", { status: 404 })
  }

  const base = path.join(process.cwd(), "public", "upload")
  let fullPath: string
  try {
    fullPath = resolveWithinBase(base, ...segments)
  } catch (e) {
    if (e instanceof SsrfError) return new NextResponse("Invalid path", { status: 400 })
    throw e
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return new NextResponse("Not found", { status: 404 })
  }

  const buffer = fs.readFileSync(fullPath)
  const ext = path.extname(fullPath).toLowerCase()
  const contentTypeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
  }
  const contentType = contentTypeMap[ext] || "application/octet-stream"

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      // Filenames are timestamp-suffixed and never reused/overwritten, so
      // a given URL's bytes never change once written — safe to cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
