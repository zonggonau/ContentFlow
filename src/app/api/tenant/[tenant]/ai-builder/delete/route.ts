import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { deleteV0Chat } from "@/lib/v0-client"
import { deleteClaudeChat } from "@/lib/claude-builder-client"
import { withStaffAuth } from "@/lib/api/route-helpers"

export const POST = withStaffAuth(
  async (_req, _context, { access }) => {
    const tenant = access.tenant

    const chatIdSetting = await db.setting.findUnique({ where: { key: `${tenant.id}_v0ChatId` } })
    const v0ChatId = chatIdSetting?.value

    if (v0ChatId) {
      try {
        if (v0ChatId.startsWith("sacms_claude_")) {
          await deleteClaudeChat(v0ChatId)
        } else {
          await deleteV0Chat(v0ChatId)
        }
      } catch (err: any) {
        console.warn("Could not delete chat:", err.message)
      }
    }

    await db.setting.deleteMany({
      where: {
        tenantId: tenant.id,
        key: {
          in: [
            `${tenant.id}_v0ChatId`,
            `${tenant.id}_v0PreviewUrl`,
            `${tenant.id}_v0FrontendPrompt`,
            `${tenant.id}_v0Status`,
            `${tenant.id}_vercelProjectId`,
          ],
        },
      },
    })

    const site = await db.site.findFirst({ where: { tenantId: tenant.id } })
    if (site) {
      await db.siteFile.deleteMany({ where: { siteId: site.id } })
      await db.site.delete({ where: { id: site.id } })
    }

    return NextResponse.json({ success: true, message: "Draft / Project berhasil dihapus." })
  },
  { minRole: "admin" },
)
