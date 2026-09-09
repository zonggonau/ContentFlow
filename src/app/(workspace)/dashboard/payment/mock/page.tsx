"use client"

/**
 * Mock Midtrans Snap checkout — stands in for the real Snap popup when no
 * MIDTRANS_SERVER_KEY is configured (dev/test only; see lib/dev-mode.ts and
 * lib/payment/mock.ts). Lets a developer manually drive a mock transaction
 * to "success" or "failed", which POSTs a Midtrans-shaped notification to
 * the real webhook endpoint (/api/billing/midtrans/webhooks) — the same
 * endpoint a real Midtrans server calls — so the rest of the payment flow
 * (subscription activation, invoices, provisioning) is exercised exactly as
 * it would be in production, without ever touching a real gateway.
 */

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, CheckCircle2, XCircle, FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function MockCheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get("orderId") || ""
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle")
  const [error, setError] = useState<string | null>(null)

  async function resolve(outcome: "success" | "failed") {
    setStatus("working")
    setError(null)
    try {
      const res = await fetch("/api/billing/midtrans/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          status_code: "200",
          gross_amount: "0",
          signature_key: "mock",
          transaction_status: outcome === "success" ? "settlement" : "deny",
          payment_type: "mock",
          transaction_id: `mock-${orderId}`,
          transaction_time: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Webhook responded with ${res.status}`)
      }
      setStatus("done")
      setTimeout(() => {
        router.push(`/dashboard/payment/${outcome === "success" ? "success" : "failed"}?order_id=${encodeURIComponent(orderId)}`)
      }, 800)
    } catch (err: any) {
      setStatus("idle")
      setError(err?.message || "Gagal memproses transaksi mock")
    }
  }

  if (!orderId) {
    return (
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Tidak ada order ID. Halaman ini hanya diakses melalui redirect dari proses checkout.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md w-full">
      <CardHeader className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          <FlaskConical className="h-4 w-4" />
          Mode Pengembangan — Simulasi Pembayaran
        </div>
        <CardTitle>Checkout Mock Midtrans</CardTitle>
        <CardDescription>
          Tidak ada <code>MIDTRANS_SERVER_KEY</code> yang dikonfigurasi, jadi pembayaran ini disimulasikan
          agar alur checkout tetap bisa diuji secara lengkap tanpa kredensial asli. Halaman ini tidak akan
          pernah muncul di production dengan kredensial yang valid.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
          order_id: {orderId}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => resolve("success")}
            disabled={status === "working"}
            className="gap-2"
          >
            {status === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Tandai Berhasil
          </Button>
          <Button
            onClick={() => resolve("failed")}
            disabled={status === "working"}
            variant="outline"
            className="gap-2"
          >
            {status === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Tandai Gagal
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function MockPaymentPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}>
        <MockCheckoutContent />
      </Suspense>
    </div>
  )
}
