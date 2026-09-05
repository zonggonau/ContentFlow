import { NextResponse } from "next/server"
import { getRedis } from "@/lib/redis"
import { invalidatePattern } from "@/lib/cache"
import { withAdminAuth } from "@/lib/api/route-helpers"

// Only clear SaCMS's own cache key namespaces — never flushdb(), which would
// also wipe rate-limit counters (cf:rl:*) and anything else sharing this
// Redis instance.
const CACHE_KEY_PATTERNS = ["content:*", "system:*"]

export const POST = withAdminAuth(async () => {
  const redis = getRedis()
  if (redis) {
    try {
      await Promise.all(CACHE_KEY_PATTERNS.map((pattern) => invalidatePattern(pattern)))
    } catch (err) {
      console.warn("Redis cache purge warning:", err)
    }
  }
  return NextResponse.json({ success: true, message: "Cache platform berhasil dibersihkan." })
})
