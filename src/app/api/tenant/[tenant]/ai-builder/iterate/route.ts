import { NextResponse } from "next/server"
import { db } from "@/lib/database"
import { iterateV0Chat } from "@/lib/v0-client"
import { iterateClaudeChat } from "@/lib/claude-builder-client"
import { withStaffAuth, apiError } from "@/lib/api/route-helpers"
import { chatBelongsToTenant } from "@/lib/ai/chat-access"

export const POST = withStaffAuth(async (req, context, { access, session }) => {
  const { tenant: tenantSlug } = await context.params
  const body = await req.json().catch(() => ({}))
  const chatId = typeof body?.chatId === "string" ? body.chatId : ""
  const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 5000) : ""
  if (!chatId || !prompt) return apiError("validation", { message: "Missing chatId or prompt" })

  if (!(await chatBelongsToTenant(chatId, access.tenantId))) {
    return apiError("not_found", { message: "Chat not found" })
  }

  // Personal AI credits: 5 per UI iteration.
  const { enforceUserAiCredits, deductUserAiCredits } = await import("@/lib/plan-enforcement")
  const creditCheck = await enforceUserAiCredits(session.user.id, 5)
  if (!creditCheck.allowed) return apiError("rate_limited", { message: creditCheck.message })

  const usingClaude = chatId.startsWith("sacms_claude_")
  let files: { name: string; content: string }[] = []

  if (usingClaude) {
    // Claude has no server-side chat state to append to — load the
    // currently-saved files and send the full set back for a complete
    // rewrite (see iterateClaudeChat's contract).
    const site = await db.site.findFirst({ where: { tenantId: access.tenantId }, orderBy: { updatedAt: "desc" }, include: { files: true } })
    const currentFiles = (site?.files || []).map((f) => ({ name: f.path, content: f.content }))
    const iterRes = await iterateClaudeChat(currentFiles, prompt, access.tenantId, session.user.id)
    files = iterRes?.files || []
  } else {
    const iterRes = await iterateV0Chat(chatId, prompt)
    files = iterRes?.files || []
  }

  await deductUserAiCredits(session.user.id, 5, "iterate_frontend", access.tenant.id, usingClaude ? "claude" : "v0.dev")

  // Keep Site/SiteFile in sync the same way generate-frontend does, so the
  // builder UI and any later reload see the iterated files.
  if (usingClaude && files.length > 0) {
    try {
      const site = await db.site.findFirst({ where: { tenantId: access.tenantId }, orderBy: { updatedAt: "desc" } })
      if (site) {
        for (const f of files) {
          const filePath = f.name.startsWith("app/") || f.name.startsWith("components/") || f.name.startsWith("lib/") ? f.name : `app/${f.name}`
          await db.siteFile.upsert({
            where: { siteId_path: { siteId: site.id, path: filePath } },
            create: { siteId: site.id, path: filePath, content: f.content },
            update: { content: f.content },
          })
        }
      }
    } catch (err: any) {
      console.warn("Could not sync Site record during iteration:", err.message)
    }
  }

  const previewUrl = usingClaude ? "" : `/api/tenant/${tenantSlug}/ai-builder/preview/${chatId}`
  return NextResponse.json({ success: true, previewUrl, files })
}, { minRole: "admin" })
