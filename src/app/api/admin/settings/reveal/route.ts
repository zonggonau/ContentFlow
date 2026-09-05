import { NextResponse } from "next/server"
import { getPlatformSettings } from "@/lib/settings"
import { isSecretSettingKey } from "@/lib/settings-secrets"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { withAdminAuth, apiError } from "@/lib/api/route-helpers"

/**
 * GET /api/admin/settings/reveal?key=<settingKey>
 *
 * Returns the real plaintext value of exactly ONE secret platform setting,
 * on demand — the counterpart to GET /api/admin/settings, which always
 * masks secret fields. Every reveal is audit-logged (who, when, which key —
 * never the value itself) so unmasking a production credential is
 * traceable, unlike the previous behavior where every secret was already
 * sitting in the page's initial payload with no record of who looked at it.
 */
export const GET = withAdminAuth(async (request, _context, { session }) => {
  const key = request.nextUrl.searchParams.get("key")
  if (!key || !isSecretSettingKey(key)) {
    return apiError("validation", { message: "Invalid or non-secret settings key" })
  }

  const settings = await getPlatformSettings()
  const value = settings[key]

  logAudit({
    userId: session.user.id,
    action: AuditAction.SETTINGS_UPDATED,
    entity: "PlatformSettingsSecretRevealed",
    data: { key },
  })

  return NextResponse.json({ key, value: value ?? "" })
})
