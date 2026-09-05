"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Webhook,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Building2,
  ExternalLink,
  Loader2,
  Eye,
  RotateCcw,
  Zap,
  Clock,
  Code,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminPageSkeleton } from "@/components/admin/admin-page-skeleton"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface WebhookItem {
  id: string
  name: string
  url: string
  enabled: boolean
  hookType: string
  events: any
  failureCount: number
  lastTriggeredAt: string | null
  tenant: {
    id: string
    name: string
    slug: string
  }
  _count: {
    deadLetters: number
    logs: number
  }
}

interface WebhookLogItem {
  id: string
  event: string
  statusCode: number | null
  success: boolean
  duration: number | null
  error: string | null
  createdAt: string
  payload: any
  response: any
  webhook: {
    id: string
    name: string
    url: string
    tenantId: string
  }
}

interface DeadLetterItem {
  id: string
  event: string
  payload: any
  lastError: string | null
  attempts: number
  maxAttempts: number
  nextRetryAt: string | null
  status: string
  createdAt: string
  webhook: {
    id: string
    name: string
    url: string
    tenant: {
      id: string
      name: string
      slug: string
    }
  }
}

export default function AdminWebhooksPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [logs, setLogs] = useState<WebhookLogItem[]>([])
  const [deadLetters, setDeadLetters] = useState<DeadLetterItem[]>([])
  const [stats, setStats] = useState<any>(null)

  const [webhooksPage, setWebhooksPage] = useState(1)
  const [webhooksTotalPages, setWebhooksTotalPages] = useState(1)
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotalPages, setLogsTotalPages] = useState(1)
  const [dlqPage, setDlqPage] = useState(1)
  const [dlqTotalPages, setDlqTotalPages] = useState(1)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [inspectItem, setInspectItem] = useState<{ title: string; data: any } | null>(null)

  const isAdmin = session?.user?.role === "super_admin" || session?.user?.role === "admin"

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  const fetchData = async () => {
    try {
      const params = new URLSearchParams({
        webhooksPage: String(webhooksPage),
        logsPage: String(logsPage),
        dlqPage: String(dlqPage),
      })
      const res = await fetch(`/api/admin/webhooks?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setWebhooks(data.webhooks || [])
        setLogs(data.recentLogs || [])
        setDeadLetters(data.deadLetters || [])
        setStats(data.stats || null)
        setWebhooksTotalPages(data.webhooksTotalPages || 1)
        setLogsTotalPages(data.logsTotalPages || 1)
        setDlqTotalPages(data.dlqTotalPages || 1)
      } else {
        toast({ variant: "destructive", title: "Gagal", description: "Gagal memuat data webhook" })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan jaringan" })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      fetchData()
    }
  }, [isAdmin, webhooksPage, logsPage, dlqPage])

  const handleRetry = async (deadLetterId: string) => {
    setRetryingId(deadLetterId)
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadLetterId, action: "retry" })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast({ title: "Berhasil", description: "Webhook berhasil dikirim ulang ke endpoint tujuan!" })
        fetchData()
      } else {
        toast({ variant: "destructive", title: "Pengiriman Ulang Gagal", description: data.error || "Endpoint tujuan mengembalikan error" })
        fetchData()
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan jaringan" })
    } finally {
      setRetryingId(null)
    }
  }

  const Pager = ({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) => {
    if (totalPages <= 1) return null
    return (
      <div className="flex items-center justify-between p-4 border-t border-border/60">
        <span className="text-xs text-muted-foreground">Halaman {page} dari {totalPages}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-lg h-8 text-xs font-bold"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Sebelumnya
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-lg h-8 text-xs font-bold"
          >
            Berikutnya <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  const handlePurgeAll = async () => {
    if (
      !(await confirm({
        title: "Kosongkan seluruh Dead Letter Queue?",
        confirmLabel: "Kosongkan antrean",
        variant: "destructive",
      }))
    )
      return
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge_all" })
      })

      if (res.ok) {
        toast({ title: "Berhasil", description: "Dead letter queue telah dikosongkan." })
        fetchData()
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan jaringan" })
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 flex-col w-full">
        <AdminPageSkeleton layout="table" cardsCount={4} />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-center text-muted-foreground">
        <p>Akses dibatasi khusus untuk Super Administrator.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col w-full">
      {confirmDialog}
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Webhooks & Event Deliveries</h1>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20 rounded-full">
                  Dead Letter Queue
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                Pantau pengiriman webhook sistem, kegagalan request (DLQ), dan picu pengiriman ulang instan (*manual retry*).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setRefreshing(true); fetchData(); }} 
                disabled={refreshing} 
                className="rounded-xl h-9 text-xs font-bold shadow-xs border-border/80"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> 
                Muat Ulang
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="rounded-2xl border border-border/80 bg-card shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Webhook</CardTitle>
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Webhook className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="text-2xl font-black text-foreground tracking-tight">{stats?.totalWebhooks ?? 0}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{stats?.activeWebhooks ?? 0} aktif memantau event</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-rose-500/20 bg-card shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Dead Letters (DLQ)</CardTitle>
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">{stats?.deadLetterCount ?? 0}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Payload gagal terkirim ke endpoint</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-emerald-500/20 bg-card shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Pengiriman Sukses</CardTitle>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{stats?.successLogsCount ?? 0}</div>
                <p className="text-[11px] text-muted-foreground mt-1">HTTP 2xx dalam log terakhir</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-border/80 bg-card shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pengiriman Gagal</CardTitle>
                <div className="w-8 h-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
                  <Activity className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="text-2xl font-black text-foreground tracking-tight">{stats?.failedLogsCount ?? 0}</div>
                <p className="text-[11px] text-muted-foreground mt-1">HTTP 4xx / 5xx / Timeout</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="dlq" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <TabsList className="bg-muted/40 border border-border/80 p-1 rounded-2xl">
                <TabsTrigger 
                  value="dlq" 
                  className="rounded-xl font-bold text-xs px-4 py-2 flex items-center gap-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Dead Letter Queue ({deadLetters.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="logs" 
                  className="rounded-xl font-bold text-xs px-4 py-2 flex items-center gap-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Log Pengiriman Terbaru ({logs.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="webhooks" 
                  className="rounded-xl font-bold text-xs px-4 py-2 flex items-center gap-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
                >
                  <Webhook className="w-3.5 h-3.5" />
                  Daftar Webhook Tenant ({webhooks.length})
                </TabsTrigger>
              </TabsList>

              {deadLetters.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePurgeAll}
                  className="rounded-xl text-xs font-bold h-8 text-destructive hover:bg-destructive/10 border-destructive/20"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Kosongkan DLQ
                </Button>
              )}
            </div>

            {/* DLQ Tab */}
            <TabsContent value="dlq">
              <Card className="border border-border/80 shadow-xs overflow-hidden rounded-2xl bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/60">
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[200px]">
                          Event & Webhook
                        </th>
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[240px]">
                          URL Endpoint
                        </th>
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[200px]">
                          Alasan Error
                        </th>
                        <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[100px]">
                          Percobaan
                        </th>
                        <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[180px]">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {deadLetters.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-muted-foreground">
                            <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                            <p className="text-xs font-semibold text-foreground">Dead Letter Queue Bersih</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Semua payload webhook berhasil terkirim atau belum ada kegagalan yang tertahan.</p>
                          </td>
                        </tr>
                      ) : (
                        deadLetters.map((dl) => {
                          const isRetrying = retryingId === dl.id
                          return (
                            <tr key={dl.id} className="hover:bg-muted/10 transition-colors">
                              <td className="p-4">
                                <div>
                                  <Badge variant="outline" className="text-[9px] font-bold uppercase bg-primary/10 text-primary border-primary/20 rounded-full">
                                    {dl.event}
                                  </Badge>
                                  <p className="text-xs font-bold text-foreground mt-1">{dl.webhook?.name || "Webhook"}</p>
                                  <p className="text-[10px] text-muted-foreground font-mono">Workspace: {dl.webhook?.tenant?.name}</p>
                                </div>
                              </td>
                              <td className="p-4">
                                <span className="text-xs font-mono text-muted-foreground truncate block max-w-xs">{dl.webhook?.url}</span>
                                <span className="text-[10px] text-muted-foreground">Dibuat: {new Date(dl.createdAt).toLocaleTimeString("id-ID")}</span>
                              </td>
                              <td className="p-4">
                                <span className="text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-500/20 block truncate max-w-xs">
                                  {dl.lastError || "Unknown connection error"}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-xs font-bold font-mono">{dl.attempts}/{dl.maxAttempts}</span>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setInspectItem({ title: `Payload: ${dl.event}`, data: dl.payload })}
                                    className="h-8 text-[11px] font-bold rounded-lg"
                                  >
                                    <Eye className="w-3.5 h-3.5 mr-1" /> Payload
                                  </Button>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    disabled={isRetrying}
                                    onClick={() => handleRetry(dl.id)}
                                    className="h-8 text-[11px] font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
                                  >
                                    {isRetrying ? (
                                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                    ) : (
                                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                    )}
                                    Kirim Ulang
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager page={dlqPage} totalPages={dlqTotalPages} onChange={setDlqPage} />
              </Card>
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs">
              <Card className="border border-border/80 shadow-xs overflow-hidden rounded-2xl bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/60">
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[140px]">Status</th>
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[160px]">Event</th>
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[240px]">Webhook & URL</th>
                        <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[100px]">Durasi</th>
                        <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[160px]">Waktu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-muted-foreground">
                            <Activity className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                            <p className="text-xs font-semibold">Belum ada log pengiriman webhook</p>
                          </td>
                        </tr>
                      ) : (
                        logs.map((l) => (
                          <tr key={l.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-4">
                              {l.success ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold rounded-full">
                                  HTTP {l.statusCode || 200} OK
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] font-bold rounded-full">
                                  {l.statusCode ? `HTTP ${l.statusCode}` : "Failed"}
                                </Badge>
                              )}
                            </td>
                            <td className="p-4">
                              <span className="text-xs font-bold font-mono">{l.event}</span>
                            </td>
                            <td className="p-4">
                              <p className="text-xs font-bold text-foreground">{l.webhook?.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono truncate max-w-sm">{l.webhook?.url}</p>
                            </td>
                            <td className="p-4 text-center text-xs font-mono text-muted-foreground">
                              {l.duration ? `${l.duration}ms` : "-"}
                            </td>
                            <td className="p-4 text-right text-xs text-muted-foreground">
                              {new Date(l.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager page={logsPage} totalPages={logsTotalPages} onChange={setLogsPage} />
              </Card>
            </TabsContent>

            {/* Webhooks List Tab */}
            <TabsContent value="webhooks">
              <Card className="border border-border/80 shadow-xs overflow-hidden rounded-2xl bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/60">
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[200px]">Nama Webhook</th>
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[180px]">Tenant Workspace</th>
                        <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[240px]">Endpoint URL</th>
                        <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[120px]">Status</th>
                        <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[140px]">Total Log</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {webhooks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-muted-foreground">
                            <Webhook className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                            <p className="text-xs font-semibold">Belum ada webhook yang dibuat oleh tenant</p>
                          </td>
                        </tr>
                      ) : (
                        webhooks.map((w) => (
                          <tr key={w.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-4">
                              <p className="text-xs font-bold text-foreground">{w.name}</p>
                              <Badge variant="outline" className="text-[9px] font-bold mt-0.5 uppercase">
                                {w.hookType}
                              </Badge>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs font-bold">{w.tenant?.name}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="text-xs font-mono text-muted-foreground truncate block max-w-sm">{w.url}</span>
                            </td>
                            <td className="p-4 text-center">
                              {w.enabled ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold rounded-full">
                                  Aktif
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground rounded-full">
                                  Nonaktif
                                </Badge>
                              )}
                            </td>
                            <td className="p-4 text-right text-xs font-bold font-mono">
                              {w._count?.logs ?? 0} request
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager page={webhooksPage} totalPages={webhooksTotalPages} onChange={setWebhooksPage} />
              </Card>
            </TabsContent>

          </Tabs>

        </div>
      </div>

      {/* Inspect JSON Modal */}
      <Dialog open={!!inspectItem} onOpenChange={(open) => !open && setInspectItem(null)}>
        <DialogContent className="rounded-2xl border-border/80 shadow-xl bg-card sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Code className="h-4 w-4 text-primary" />
              {inspectItem?.title || "Inspect Payload"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              JSON data payload yang dikirim saat event webhook terjadi.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-muted/40 border border-border/60 rounded-xl max-h-96 overflow-y-auto font-mono text-xs text-foreground">
            <pre className="whitespace-pre-wrap">{JSON.stringify(inspectItem?.data, null, 2)}</pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setInspectItem(null)} className="rounded-xl text-xs font-bold h-9">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
