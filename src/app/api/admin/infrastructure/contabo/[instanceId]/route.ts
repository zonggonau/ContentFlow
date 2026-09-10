import { NextResponse } from "next/server"
import { withAdminAuth, apiError } from "@/lib/api/route-helpers"
import { logAudit, AuditAction } from "@/lib/audit-log"

/**
 * Direct Contabo instance management, keyed by the provider's own
 * `instanceId` (not our InfrastructureServer id) — so it works for every
 * instance shown in the admin dashboard's VPS / VDS / Storage tabs,
 * including ones SaCMS never provisioned itself.
 *
 * GET    → live instance detail + its snapshots
 * POST   → { action, ...params }: start | stop | restart | shutdown |
 *          rename | snapshot-create | snapshot-rollback | snapshot-delete |
 *          reinstall
 * DELETE → cancel/terminate the instance (requires ?confirm=CANCEL)
 */

const CONTABO_ENV_HINT = "CONTABO_CLIENT_ID / CONTABO_CLIENT_SECRET / CONTABO_API_USER / CONTABO_API_PASSWORD"

export const GET = withAdminAuth(async (_req, context) => {
  const { instanceId } = await context.params
  const contabo = await import("@/lib/infrastructure/contabo")
  if (!contabo.isContaboConfigured()) {
    return apiError("validation", { message: `Contabo belum dikonfigurasi. Set ${CONTABO_ENV_HINT}.` })
  }

  const [instance, snapshots] = await Promise.all([
    contabo.getContaboInstanceDetail(instanceId).catch(() => null),
    contabo.listContaboSnapshots(instanceId).catch(() => []),
  ])

  if (!instance) return apiError("not_found", { message: "Instance tidak ditemukan di Contabo." })
  return NextResponse.json({ instance, snapshots })
})

export const POST = withAdminAuth(async (req, context, { session }) => {
  const { instanceId } = await context.params
  const body = await req.json().catch(() => ({}))
  const action: string = body.action
  const contabo = await import("@/lib/infrastructure/contabo")

  if (!contabo.isContaboConfigured()) {
    return apiError("validation", { message: `Contabo belum dikonfigurasi. Set ${CONTABO_ENV_HINT}.` })
  }

  const audit = (detail: Record<string, unknown>) =>
    logAudit({
      userId: session.user.id,
      action: AuditAction.SETTINGS_UPDATED,
      entity: "ContaboInstance",
      entityId: String(instanceId),
      data: { action, ...detail },
    })

  try {
    switch (action) {
      case "start": {
        const ok = await contabo.startContaboInstance(instanceId)
        audit({ ok })
        return NextResponse.json({ success: ok, message: ok ? "Sinyal start dikirim." : "Gagal start." })
      }
      case "stop": {
        const ok = await contabo.stopContaboInstance(instanceId)
        audit({ ok })
        return NextResponse.json({ success: ok, message: ok ? "Sinyal stop (power-off) dikirim." : "Gagal stop." })
      }
      case "shutdown": {
        const ok = await contabo.shutdownContaboInstance(instanceId)
        audit({ ok })
        return NextResponse.json({ success: ok, message: ok ? "Sinyal shutdown (ACPI) dikirim." : "Gagal shutdown." })
      }
      case "restart": {
        const ok = await contabo.restartContaboInstance(instanceId)
        audit({ ok })
        return NextResponse.json({ success: ok, message: ok ? "Sinyal restart dikirim." : "Gagal restart." })
      }
      case "rename": {
        const displayName = String(body.displayName || "").trim()
        if (!displayName) return apiError("validation", { message: "Nama baru wajib diisi." })
        const ok = await contabo.updateContaboInstanceName(instanceId, displayName)
        audit({ ok, displayName })
        return NextResponse.json({ success: ok, message: ok ? "Nama instance diperbarui." : "Gagal mengubah nama." })
      }
      case "snapshot-create": {
        const name = String(body.name || "").trim()
        if (!name) return apiError("validation", { message: "Nama snapshot wajib diisi." })
        const snap = await contabo.createContaboSnapshot(instanceId, name, body.description ? String(body.description) : undefined)
        audit({ snapshotId: snap.snapshotId, name })
        return NextResponse.json({ success: true, message: "Snapshot dibuat.", snapshot: snap })
      }
      case "snapshot-rollback": {
        const snapshotId = String(body.snapshotId || "")
        if (!snapshotId) return apiError("validation", { message: "snapshotId wajib." })
        const ok = await contabo.rollbackContaboSnapshot(instanceId, snapshotId)
        audit({ ok, snapshotId })
        return NextResponse.json({
          success: ok,
          message: ok ? "Rollback dimulai — instance akan reboot ke state snapshot." : "Rollback gagal.",
        })
      }
      case "snapshot-delete": {
        const snapshotId = String(body.snapshotId || "")
        if (!snapshotId) return apiError("validation", { message: "snapshotId wajib." })
        const ok = await contabo.deleteContaboSnapshot(instanceId, snapshotId)
        audit({ ok, snapshotId })
        return NextResponse.json({ success: ok, message: ok ? "Snapshot dihapus." : "Gagal menghapus snapshot." })
      }
      case "reinstall": {
        const imageId = String(body.imageId || "")
        if (!imageId) return apiError("validation", { message: "imageId wajib." })
        await contabo.reinstallContaboInstance(instanceId, imageId)
        audit({ imageId, destructive: true })
        return NextResponse.json({ success: true, message: "Reinstall OS dimulai. Seluruh data pada disk instance akan terhapus." })
      }
      default:
        return apiError("validation", { message: `Aksi tidak dikenal: ${action}` })
    }
  } catch (err: any) {
    return apiError("internal", { message: err?.message || "Operasi Contabo gagal." })
  }
})

export const DELETE = withAdminAuth(async (req, context, { session }) => {
  const { instanceId } = await context.params
  const url = new URL(req.url)
  if (url.searchParams.get("confirm") !== "CANCEL") {
    return apiError("validation", { message: "Konfirmasi diperlukan: tambahkan ?confirm=CANCEL." })
  }
  const contabo = await import("@/lib/infrastructure/contabo")
  if (!contabo.isContaboConfigured()) {
    return apiError("validation", { message: `Contabo belum dikonfigurasi. Set ${CONTABO_ENV_HINT}.` })
  }
  try {
    const ok = await contabo.deleteContaboInstance(instanceId)
    logAudit({
      userId: session.user.id,
      action: AuditAction.SETTINGS_UPDATED,
      entity: "ContaboInstanceCancel",
      entityId: String(instanceId),
      data: { ok },
    })
    return NextResponse.json({
      success: ok,
      message: ok ? "Permintaan pembatalan instance dikirim ke Contabo." : "Gagal membatalkan instance.",
    })
  } catch (err: any) {
    return apiError("internal", { message: err?.message || "Gagal membatalkan instance." })
  }
})
