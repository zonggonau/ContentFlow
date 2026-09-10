"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Server,
  Database,
  HardDrive,
  Cpu,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Copy,
  Check,
  Trash2,
  Shield,
  Loader2,
  RotateCw,
  Play,
  Square,
  FolderSync,
  Globe,
  Zap,
  Wrench,
  Wifi,
  KeyRound,
  AlertTriangle,
  ExternalLink,
  Boxes,
  Layers,
  Triangle,
  Camera,
  History,
  Power,
  PowerOff,
  Settings2,
  Pencil,
  HardDriveDownload,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { AdminPageSkeleton } from "@/components/admin/admin-page-skeleton"
import { cn } from "@/lib/utils"

interface InfrastructureServer {
  id: string
  tenantId: string
  name: string
  hostname: string
  ipv4: string
  region: string
  plan: string
  diskGb: number
  ramMb: number
  cpuCount: number
  status: "pending" | "provisioning" | "configuring" | "active" | "suspended" | "error" | "destroyed"
  healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown"
  errorMessage?: string
  dbHost: string
  dbPort: number
  mediaHost: string
  mediaPort: number
  lastHealthCheckAt: string | null
  createdAt: string
  metricsSnapshot?: {
    cpuUsagePercent?: number
    cpuCores?: number
    ramUsageMb?: number
    ramTotalMb?: number
    ramUsagePercent?: number
    diskUsageGb?: number
    diskTotalGb?: number
    diskUsagePercent?: number
    dbConnectionsActive?: number
    dbConnectionsMax?: number
    dbLatencyMs?: number | null
    mediaLatencyMs?: number | null
  }
  tenant: {
    id: string
    name: string
    slug: string
    plan: string
  }
}

interface ServerCredentials {
  databaseName: string
  dbUser: string
  dbPassword: string
  minioUser: string
  minioSecret: string
  connectionString: string
  s3Endpoint: string
  s3Bucket: string
  s3PublicUrl: string
}

interface ContaboInstanceRow {
  instanceId: string
  name: string
  displayName: string
  status: string
  ipv4: string
  ipv6: string
  region: string
  regionName: string
  productId: string
  productName: string
  kind: "VPS" | "VDS" | "Storage"
  cpuCores: number
  ramMb: number
  diskGb: number
  createdDate: string | null
  tracked: boolean
  serverId: string | null
  tenant: { id: string; name: string; slug: string; plan: string } | null
  healthStatus: string | null
  dbHealthStatus: string | null
  metricsSnapshot: InfrastructureServer["metricsSnapshot"] | null
  lastHealthCheckAt: string | null
  orphan?: boolean
}

interface VercelProjectRow {
  id: string
  name: string
  framework: string | null
  nodeVersion: string | null
  url: string
  latestDeploymentState: string | null
  latestDeploymentUrl: string | null
  latestDeploymentAt: number | null
  createdAt: number | null
  gitRepo: string | null
}

interface ProvidersData {
  contabo: {
    configured: boolean
    available: boolean
    counts: { vps: number; vds: number; storage: number }
    vps: ContaboInstanceRow[]
    vds: ContaboInstanceRow[]
    storage: ContaboInstanceRow[]
  }
  vercel: {
    configured: boolean
    available: boolean
    count: number
    projects: VercelProjectRow[]
  }
}

export default function AdminInfrastructurePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()

  const [servers, setServers] = useState<InfrastructureServer[]>([])
  const [summary, setSummary] = useState<any>({ total: 0, active: 0, provisioning: 0, error: 0 })
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const [providers, setProviders] = useState<ProvidersData | null>(null)
  const [providersLoading, setProvidersLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"vps" | "vds" | "storage" | "vercel">("vps")

  // Modal States
  const [selectedServer, setSelectedServer] = useState<InfrastructureServer | null>(null)
  const [credentials, setCredentials] = useState<ServerCredentials | null>(null)
  const [credModalOpen, setCredModalOpen] = useState(false)
  const [loadingCreds, setLoadingCreds] = useState(false)

  // Troubleshooting / Action Modal
  const [troubleshootServer, setTroubleshootServer] = useState<InfrastructureServer | null>(null)
  const [troubleshootModalOpen, setTroubleshootModalOpen] = useState(false)

  // Delete Alert
  const [serverToDelete, setServerToDelete] = useState<InfrastructureServer | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Actions loading
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Contabo instance management modal (keyed by provider instanceId — works
  // for tracked AND untracked instances shown in the VPS/VDS/Storage tabs)
  const [contaboModalOpen, setContaboModalOpen] = useState(false)
  const [contaboRow, setContaboRow] = useState<ContaboInstanceRow | null>(null)
  const [contaboDetail, setContaboDetail] = useState<any>(null)
  const [contaboSnapshots, setContaboSnapshots] = useState<any[]>([])
  const [contaboDetailLoading, setContaboDetailLoading] = useState(false)
  const [contaboActionKey, setContaboActionKey] = useState<string | null>(null)
  const [newSnapshotName, setNewSnapshotName] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const [reinstallImageId, setReinstallImageId] = useState("")
  const [contaboConfirm, setContaboConfirm] = useState<null | { kind: "rollback" | "snapshot-delete" | "reinstall" | "cancel"; snapshotId?: string; label: string }>(null)

  // Provision Modal States
  const [provisionModalOpen, setProvisionModalOpen] = useState(false)
  const [provisionLoading, setProvisionLoading] = useState(false)
  const [metaOptions, setMetaOptions] = useState<{
    plans: any[]
    regions: any[]
    defaultRegion: string
    images: { label: string; id: string }[]
    tenants: any[]
  }>({
    plans: [],
    regions: [],
    defaultRegion: "SIN",
    images: [],
    tenants: [],
  })
  const [provisionForm, setProvisionForm] = useState({
    tenantId: "",
    plan: "vps-4",
    region: "SIN",
  })

  const isSuperAdmin = session?.user?.role === "super_admin"

  const fetchServers = async (silent = false) => {
    if (!silent) setIsRefreshing(true)
    try {
      const res = await fetch(`/api/admin/infrastructure`)
      if (res.ok) {
        const data = await res.json()
        setServers(data.servers || [])
        setSummary(data.summary || {})
        if (data.meta) {
          setMetaOptions(data.meta)
          if (!provisionForm.tenantId && data.meta.tenants?.length > 0) {
            setProvisionForm(prev => ({
              ...prev,
              tenantId: data.meta.tenants[0].id,
              region: data.meta.defaultRegion || "SIN",
            }))
          }
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Gagal memuat daftar monitoring server." })
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  const fetchProviders = async (silent = false) => {
    if (!silent) setProvidersLoading(true)
    try {
      const res = await fetch("/api/admin/infrastructure/providers")
      if (res.ok) {
        setProviders(await res.json())
      }
    } catch {
      // Non-fatal — the tab just shows an "unavailable" state.
    } finally {
      setProvidersLoading(false)
    }
  }

  const openContaboManage = async (row: ContaboInstanceRow) => {
    setContaboRow(row)
    setContaboModalOpen(true)
    setContaboDetail(null)
    setContaboSnapshots([])
    setNewSnapshotName("")
    setRenameValue(row.displayName || row.name)
    setReinstallImageId("")
    setContaboConfirm(null)
    setContaboDetailLoading(true)
    try {
      const res = await fetch(`/api/admin/infrastructure/contabo/${encodeURIComponent(row.instanceId)}`)
      const data = await res.json()
      if (res.ok) {
        setContaboDetail(data.instance)
        setContaboSnapshots(data.snapshots || [])
        setRenameValue(data.instance?.displayName || row.displayName || row.name)
      } else {
        toast({ variant: "destructive", title: "Gagal", description: data.error || "Gagal memuat detail instance." })
      }
    } catch {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Kesalahan jaringan saat memuat instance." })
    } finally {
      setContaboDetailLoading(false)
    }
  }

  const refreshContaboDetail = async () => {
    if (!contaboRow) return
    setContaboDetailLoading(true)
    try {
      const res = await fetch(`/api/admin/infrastructure/contabo/${encodeURIComponent(contaboRow.instanceId)}`)
      const data = await res.json()
      if (res.ok) {
        setContaboDetail(data.instance)
        setContaboSnapshots(data.snapshots || [])
      }
    } catch {
      /* keep stale detail */
    } finally {
      setContaboDetailLoading(false)
    }
  }

  const runContaboAction = async (
    action: string,
    params: Record<string, unknown> = {},
    opts: { successTitle?: string } = {},
  ) => {
    if (!contaboRow) return
    setContaboActionKey(`${action}-${params.snapshotId || ""}`)
    try {
      const res = await fetch(`/api/admin/infrastructure/contabo/${encodeURIComponent(contaboRow.instanceId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...params }),
      })
      const data = await res.json()
      if (res.ok && data.success !== false) {
        toast({ title: opts.successTitle || "Berhasil", description: data.message || "Operasi dijalankan." })
        setContaboConfirm(null)
        await refreshContaboDetail()
        fetchProviders(true)
        fetchServers(true)
      } else {
        toast({ variant: "destructive", title: "Gagal", description: data.error || data.message || "Operasi gagal." })
      }
    } catch {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Kesalahan jaringan." })
    } finally {
      setContaboActionKey(null)
    }
  }

  const runContaboCancel = async () => {
    if (!contaboRow) return
    setContaboActionKey("cancel-")
    try {
      const res = await fetch(
        `/api/admin/infrastructure/contabo/${encodeURIComponent(contaboRow.instanceId)}?confirm=CANCEL`,
        { method: "DELETE" },
      )
      const data = await res.json()
      if (res.ok && data.success !== false) {
        toast({ title: "Permintaan Terkirim", description: data.message || "Instance dibatalkan." })
        setContaboConfirm(null)
        setContaboModalOpen(false)
        fetchProviders(true)
        fetchServers(true)
      } else {
        toast({ variant: "destructive", title: "Gagal", description: data.error || "Gagal membatalkan instance." })
      }
    } catch {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Kesalahan jaringan." })
    } finally {
      setContaboActionKey(null)
    }
  }

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!provisionForm.tenantId) {
      toast({ variant: "destructive", title: "Form Belum Lengkap", description: "Pilih tenant tujuan terlebih dahulu." })
      return
    }

    setProvisionLoading(true)
    try {
      const res = await fetch("/api/admin/infrastructure/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provisionForm),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "Provisioning Dimulai!",
          description: `Server dedicated untuk workspace berhasil dibuat di region ${provisionForm.region} (Ubuntu 24.04).`,
        })
        setProvisionModalOpen(false)
        fetchServers()
      } else {
        toast({
          variant: "destructive",
          title: "Provisioning Gagal",
          description: data.error || data.message || "Gagal menginisialisasi server di Contabo.",
        })
      }
    } catch {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Kesalahan jaringan saat melakukan provisioning." })
    } finally {
      setProvisionLoading(false)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) {
      fetchServers()
    }
  }, [isSuperAdmin])

  useEffect(() => {
    if (isSuperAdmin) {
      fetchProviders()
    }
  }, [isSuperAdmin])

  // Auto-refresh monitoring every 30 seconds
  useEffect(() => {
    if (!isSuperAdmin) return
    const timer = setInterval(() => {
      fetchServers(true)
      fetchProviders(true)
    }, 30000)
    return () => clearInterval(timer)
  }, [isSuperAdmin])

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
    toast({ title: "Disalin!", description: "Teks berhasil disalin ke clipboard." })
  }

  const handleViewCredentials = async (server: InfrastructureServer) => {
    setSelectedServer(server)
    setCredModalOpen(true)
    setLoadingCreds(true)
    try {
      const res = await fetch(`/api/admin/infrastructure/${server.id}`)
      if (res.ok) {
        const data = await res.json()
        setCredentials(data.credentials)
      } else {
        toast({ variant: "destructive", title: "Gagal", description: "Gagal memuat kredensial server." })
      }
    } catch {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan jaringan." })
    } finally {
      setLoadingCreds(false)
    }
  }

  const handleAction = async (serverId: string, action: "health-check" | "restart" | "start" | "stop" | "sync-schema" | "sync-dns" | "test-db") => {
    const actionKey = `${serverId}-${action}`
    setActionLoadingKey(actionKey)
    try {
      const res = await fetch(`/api/admin/infrastructure/${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({
          title: "Tindakan Berhasil",
          description: data.message || "Operasi troubleshooting berhasil dijalankan.",
        })
        fetchServers(true)
      } else {
        toast({ variant: "destructive", title: "Tindakan Gagal", description: data.error || "Operasi gagal dijalankan." })
      }
    } catch {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan saat memproses tindakan." })
    } finally {
      setActionLoadingKey(null)
    }
  }

  const handleDelete = async () => {
    if (!serverToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/infrastructure/${serverToDelete.id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        toast({ title: "Terhapus", description: "Server VPS dan konfigurasi DNS berhasil dihentikan." })
        setServerToDelete(null)
        setTroubleshootModalOpen(false)
        fetchServers()
      } else {
        toast({ variant: "destructive", title: "Gagal", description: "Gagal menghapus server." })
      }
    } catch {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan sistem." })
    } finally {
      setIsDeleting(false)
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 flex-col w-full">
        <AdminPageSkeleton layout="grid" cardsCount={4} />
      </div>
    )
  }

  const findTrackedServer = (serverId: string | null) =>
    serverId ? servers.find((s) => s.id === serverId) || null : null

  const matchesSearch = (row: ContaboInstanceRow) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      (row.displayName || row.name || "").toLowerCase().includes(q) ||
      (row.ipv4 || "").toLowerCase().includes(q) ||
      (row.productName || row.productId || "").toLowerCase().includes(q) ||
      (row.instanceId || "").toLowerCase().includes(q) ||
      (row.tenant?.name || "").toLowerCase().includes(q) ||
      (row.tenant?.slug || "").toLowerCase().includes(q)
    )
  }

  const contaboStatusColor = (s: string) => {
    const v = (s || "").toLowerCase()
    if (v.includes("running") || v === "ok" || v === "active") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
    if (v.includes("provision") || v.includes("install") || v.includes("pending") || v.includes("configuring")) return "bg-amber-500/10 text-amber-600 border-amber-500/30"
    if (v.includes("stopped") || v.includes("suspend")) return "bg-slate-500/10 text-slate-600 border-slate-500/30"
    if (v.includes("error") || v.includes("fail")) return "bg-rose-500/10 text-rose-600 border-rose-500/30"
    return "bg-muted text-muted-foreground border-border"
  }

  const vercelStateColor = (s: string) => {
    const v = (s || "").toLowerCase()
    if (v === "ready") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
    if (["building", "queued", "initializing"].includes(v)) return "bg-amber-500/10 text-amber-600 border-amber-500/30"
    if (["error", "canceled"].includes(v)) return "bg-rose-500/10 text-rose-600 border-rose-500/30"
    return "bg-muted text-muted-foreground border-border"
  }

  const healthPill = (h: string | null) => (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          h === "healthy" && "bg-emerald-500",
          h === "degraded" && "bg-amber-500",
          h === "unhealthy" && "bg-rose-500",
          (!h || h === "unknown") && "bg-slate-400",
        )}
      />
      <span className="text-xs font-semibold capitalize text-foreground">
        {h === "healthy" ? "Sehat" : h === "degraded" ? "Degraded" : h === "unhealthy" ? "Kritis" : "Belum Dicek"}
      </span>
    </div>
  )

  const renderContaboTable = (rows: ContaboInstanceRow[], kindLabel: string, credentialHint: string) => {
    const filtered = rows.filter(matchesSearch)
    return (
      <Card className="border-border/60 bg-card/60 backdrop-blur-sm rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-xs">Instance & Tenant</TableHead>
                <TableHead className="font-bold text-xs">Paket & Region</TableHead>
                <TableHead className="font-bold text-xs">Spesifikasi</TableHead>
                <TableHead className="font-bold text-xs">Status Provider</TableHead>
                <TableHead className="font-bold text-xs">Kesehatan SaCMS</TableHead>
                <TableHead className="font-bold text-xs text-right">Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providersLoading && !providers ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground text-xs">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : !providers?.contabo.configured ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground text-xs">
                    Kredensial Contabo belum dikonfigurasi. Set <code className="bg-muted px-1 rounded font-mono">{credentialHint}</code> di environment atau Platform Settings.
                  </TableCell>
                </TableRow>
              ) : !providers.contabo.available ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground text-xs">
                    Gagal mengambil data dari Contabo API. Periksa kredensial atau coba perbarui lagi.
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground text-xs">
                    Tidak ada instance {kindLabel} yang cocok.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const full = findTrackedServer(row.serverId)
                  return (
                    <TableRow key={row.instanceId} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="font-bold text-foreground text-sm flex items-center gap-2 flex-wrap">
                          {row.displayName || row.name}
                          {row.orphan && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[9px] font-black uppercase">
                              Hilang di Provider
                            </Badge>
                          )}
                          {!row.tracked && (
                            <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-500/30 text-[9px] font-black uppercase">
                              Untracked
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {row.tenant ? `${row.tenant.name} · ${row.tenant.slug}` : "Tidak terhubung ke tenant"}
                        </div>
                        <div className="text-[11px] font-mono mt-0.5">
                          <span className="text-primary">{row.ipv4 || "IPv4 —"}</span>
                          <span className="text-muted-foreground"> · ID {row.instanceId}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="text-xs font-medium text-foreground">{row.productName || row.productId || "—"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{row.regionName || row.region || "—"}</div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                          <Cpu className="h-3.5 w-3.5 text-primary" /> {row.cpuCores || "—"} vCPU · {row.ramMb ? `${Math.round(row.ramMb / 1024)} GB` : "—"}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 font-medium">
                          <HardDrive className="h-3.5 w-3.5 text-primary" /> {row.diskGb ? `${row.diskGb} GB` : "—"}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className={cn("capitalize font-bold text-[10px] px-2.5 py-0.5 rounded-full", contaboStatusColor(row.status))}>
                          {row.status}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {row.tracked ? healthPill(row.healthStatus) : <span className="text-[11px] text-muted-foreground">Tidak dipantau</span>}
                        {row.lastHealthCheckAt && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Cek: {new Date(row.lastHealthCheckAt).toLocaleTimeString("id-ID")}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!row.orphan && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => openContaboManage(row)}
                              className="rounded-xl h-8 px-3 text-xs font-bold gap-1.5 shadow-xs"
                              title="Power, snapshot, reinstall & pengaturan Contabo"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              Kelola
                            </Button>
                          )}
                          {full && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setTroubleshootServer(full)
                                  setTroubleshootModalOpen(true)
                                }}
                                className="rounded-xl h-8 px-3 text-xs font-bold gap-1.5"
                                title="Diagnostik DB / DNS / skema tenant"
                              >
                                <Wrench className="h-3.5 w-3.5" />
                                Diagnostik
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-xl"
                                title="Lihat Kredensial & Endpoint"
                                onClick={() => handleViewCredentials(full)}
                              >
                                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </>
                          )}
                          {row.orphan && !full && (
                            <span className="text-[11px] text-muted-foreground">Instance tidak aktif</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  const renderVercelTable = () => {
    const projects = providers?.vercel.projects || []
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.gitRepo || "").toLowerCase().includes(q) ||
            (p.framework || "").toLowerCase().includes(q),
        )
      : projects
    return (
      <Card className="border-border/60 bg-card/60 backdrop-blur-sm rounded-2xl shadow-xs overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-xs">Project</TableHead>
                <TableHead className="font-bold text-xs">Framework</TableHead>
                <TableHead className="font-bold text-xs">Deployment Terakhir</TableHead>
                <TableHead className="font-bold text-xs">Dibuat</TableHead>
                <TableHead className="font-bold text-xs text-right">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providersLoading && !providers ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16 text-muted-foreground text-xs">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : !providers?.vercel.configured ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16 text-muted-foreground text-xs">
                    Token Vercel belum dikonfigurasi. Set <code className="bg-muted px-1 rounded font-mono">VERCEL_ACCESS_TOKEN</code> di environment atau isi di Platform Settings.
                  </TableCell>
                </TableRow>
              ) : !providers.vercel.available ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16 text-muted-foreground text-xs">
                    Gagal memuat project dari Vercel API. Periksa token atau coba perbarui lagi.
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16 text-muted-foreground text-xs">
                    Tidak ada project Vercel yang cocok.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="font-bold text-foreground text-sm">{p.name}</div>
                      {p.gitRepo && <div className="text-xs text-muted-foreground font-mono mt-0.5">{p.gitRepo}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">
                      {p.framework || "—"}
                      {p.nodeVersion ? ` · Node ${p.nodeVersion}` : ""}
                    </TableCell>
                    <TableCell>
                      {p.latestDeploymentState ? (
                        <Badge variant="outline" className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5 capitalize", vercelStateColor(p.latestDeploymentState))}>
                          {p.latestDeploymentState}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Belum ada</span>
                      )}
                      {p.latestDeploymentAt && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(p.latestDeploymentAt).toLocaleString("id-ID")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString("id-ID") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.url && (
                          <Button asChild variant="outline" size="icon" className="h-8 w-8 rounded-xl" title="Buka situs">
                            <a href={p.url} target="_blank" rel="noreferrer">
                              <Globe className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button asChild variant="outline" size="icon" className="h-8 w-8 rounded-xl" title="Buka di Vercel">
                          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">
                Monitoring & Status Infrastruktur
              </h1>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] uppercase font-black flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Monitoring
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Pantau kesehatan dedicated server (PostgreSQL 17 + MinIO S3 + Caddy SSL + DNS) dan ambil tindakan pemulihan jika terjadi gangguan.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchServers(); fetchProviders() }}
              disabled={isRefreshing}
              className="gap-2 text-xs h-9 rounded-xl border-border/80"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
              {isRefreshing ? "Memperbarui..." : "Perbarui Data"}
            </Button>

            <Button
              size="sm"
              onClick={() => setProvisionModalOpen(true)}
              className="gap-2 text-xs h-9 rounded-xl font-bold bg-primary text-primary-foreground shadow-xs"
            >
              <Server className="h-3.5 w-3.5" />
              Provision Dedicated Server
            </Button>
          </div>
        </div>

        {/* Health & Monitoring Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm rounded-2xl shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Dedicated Server</CardTitle>
              <Server className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-foreground">{summary.total}</div>
              <p className="text-xs text-muted-foreground mt-0.5">Instance Terpasang</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur-sm rounded-2xl shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Normal & Sehat</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary.active}</div>
              <p className="text-xs text-muted-foreground mt-0.5">DB & Storage Beroperasi</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur-sm rounded-2xl shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Sedang Boot / Konfigurasi</CardTitle>
              <RotateCw className="h-4 w-4 text-amber-500 animate-spin" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{summary.provisioning}</div>
              <p className="text-xs text-muted-foreground mt-0.5">Proses Cloud-Init / DNS</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur-sm rounded-2xl shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Gangguan / Butuh Tindakan</CardTitle>
              <AlertCircle className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{summary.error}</div>
              <p className="text-xs text-muted-foreground mt-0.5">Perlu Pemeriksaan</p>
            </CardContent>
          </Card>
        </div>

        {/* Search + Provider Tabs */}
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari instance, tenant, IP, project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs rounded-xl"
          />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="w-full sm:w-auto flex-wrap h-auto">
            <TabsTrigger value="vps" className="text-xs gap-1.5">
              <Server className="h-3.5 w-3.5" /> VPS
              {providers && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] font-bold">
                  {providers.contabo.counts.vps}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="vds" className="text-xs gap-1.5">
              <Boxes className="h-3.5 w-3.5" /> VDS
              {providers && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] font-bold">
                  {providers.contabo.counts.vds}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="storage" className="text-xs gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Storage
              {providers && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] font-bold">
                  {providers.contabo.counts.storage}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="vercel" className="text-xs gap-1.5">
              <Triangle className="h-3 w-3 fill-current" /> Hosting Vercel
              {providers && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] font-bold">
                  {providers.vercel.count}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vps" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              Semua Cloud VPS di akun Contabo. Baris yang terhubung ke tenant menampilkan status kesehatan SaCMS &amp; aksi troubleshooting.
            </p>
            {renderContaboTable(providers?.contabo.vps || [], "VPS", "CONTABO_CLIENT_ID / CONTABO_CLIENT_SECRET / CONTABO_API_USER / CONTABO_API_PASSWORD")}
          </TabsContent>

          <TabsContent value="vds" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              Cloud VDS (Dedicated CPU) di akun Contabo.
            </p>
            {renderContaboTable(providers?.contabo.vds || [], "VDS", "CONTABO_CLIENT_ID / CONTABO_CLIENT_SECRET / CONTABO_API_USER / CONTABO_API_PASSWORD")}
          </TabsContent>

          <TabsContent value="storage" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              Instance VPS Storage / object storage appliance di akun Contabo.
            </p>
            {renderContaboTable(providers?.contabo.storage || [], "Storage", "CONTABO_CLIENT_ID / CONTABO_CLIENT_SECRET / CONTABO_API_USER / CONTABO_API_PASSWORD")}
          </TabsContent>

          <TabsContent value="vercel" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              Seluruh project hosting di akun / tim Vercel beserta status deployment terakhirnya.
            </p>
            {renderVercelTable()}
          </TabsContent>
        </Tabs>

        {/* Troubleshooting & Actions Modal */}
        <Dialog open={troubleshootModalOpen} onOpenChange={setTroubleshootModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Wrench className="h-5 w-5 text-primary" /> Panel Tindakan & Pemulihan Server
              </DialogTitle>
              <DialogDescription>
                Pusat penanganan trouble untuk server <strong className="text-foreground">{troubleshootServer?.tenant?.name}</strong> ({troubleshootServer?.hostname})
              </DialogDescription>
            </DialogHeader>

            {troubleshootServer && (
              <div className="space-y-4 py-2 text-xs">
                {/* Server Status Summary Bar */}
                <div className="p-3 bg-muted/40 rounded-xl border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant="outline" className="font-bold text-[10px] uppercase">
                      {troubleshootServer.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Kesehatan:</span>
                    <Badge variant="outline" className="font-bold text-[10px] uppercase">
                      {troubleshootServer.healthStatus}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">IP Server:</span>
                    <code className="bg-background px-1.5 py-0.5 rounded font-mono font-bold text-foreground">
                      {troubleshootServer.ipv4 || "Belum ada IP"}
                    </code>
                  </div>
                </div>

                {/* Live Resource Utilization Gauges */}
                <div className="p-3.5 bg-card rounded-xl border border-border/80 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                    <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-primary" /> Penggunaan Resource Server (Real-time)</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Sinkron: {troubleshootServer.lastHealthCheckAt ? new Date(troubleshootServer.lastHealthCheckAt).toLocaleTimeString("id-ID") : "Baru"}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="p-2 bg-muted/40 rounded-lg border border-border/40">
                      <div className="text-[10px] text-muted-foreground font-semibold">Beban CPU</div>
                      <div className="text-sm font-black text-foreground mt-0.5">{troubleshootServer.metricsSnapshot?.cpuUsagePercent != null ? `${troubleshootServer.metricsSnapshot.cpuUsagePercent}%` : "Tidak tersedia"}</div>
                      <div className="text-[9px] text-muted-foreground">{troubleshootServer.cpuCount} Cores (Active)</div>
                    </div>

                    <div className="p-2 bg-muted/40 rounded-lg border border-border/40">
                      <div className="text-[10px] text-muted-foreground font-semibold">Alokasi RAM</div>
                      <div className="text-sm font-black text-foreground mt-0.5">{troubleshootServer.metricsSnapshot?.ramUsagePercent != null ? `${troubleshootServer.metricsSnapshot.ramUsagePercent}%` : "Tidak tersedia"}</div>
                      <div className="text-[9px] text-muted-foreground">{troubleshootServer.metricsSnapshot?.ramUsageMb != null ? `${(troubleshootServer.metricsSnapshot.ramUsageMb / 1024).toFixed(1)} / ${troubleshootServer.ramMb / 1024} GB` : `-- / ${troubleshootServer.ramMb / 1024} GB`}</div>
                    </div>

                    <div className="p-2 bg-muted/40 rounded-lg border border-border/40">
                      <div className="text-[10px] text-muted-foreground font-semibold">Penyimpanan NVMe</div>
                      <div className="text-sm font-black text-foreground mt-0.5">{troubleshootServer.metricsSnapshot?.diskUsagePercent != null ? `${troubleshootServer.metricsSnapshot.diskUsagePercent}%` : "Tidak tersedia"}</div>
                      <div className="text-[9px] text-muted-foreground">{troubleshootServer.metricsSnapshot?.diskUsageGb != null ? `${troubleshootServer.metricsSnapshot.diskUsageGb} / ${troubleshootServer.diskGb} GB` : `-- / ${troubleshootServer.diskGb} GB`}</div>
                    </div>

                    <div className="p-2 bg-muted/40 rounded-lg border border-border/40">
                      <div className="text-[10px] text-muted-foreground font-semibold">Koneksi DB Pool</div>
                      <div className="text-sm font-black text-foreground mt-0.5">{troubleshootServer.metricsSnapshot?.dbConnectionsActive != null ? <>{troubleshootServer.metricsSnapshot.dbConnectionsActive} <span className="text-[10px] font-normal text-muted-foreground">/ 100</span></> : "Tidak tersedia"}</div>
                      <div className="text-[9px] text-emerald-500 font-semibold">{troubleshootServer.metricsSnapshot?.dbLatencyMs != null ? `Latensi: ${troubleshootServer.metricsSnapshot.dbLatencyMs}ms` : "Latensi tidak tersedia"}</div>
                    </div>
                  </div>
                </div>

                {/* Remediation Action Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  
                  {/* 1. Live Health Check */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-card hover:border-primary/40 transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-bold text-foreground mb-1 text-xs">
                        <Activity className="h-4 w-4 text-emerald-500" />
                        Periksa Kesehatan (Ping)
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Kirim sinyal uji ke port PostgreSQL dan MinIO S3 untuk memastikan layanan merespons normal.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoadingKey === `${troubleshootServer.id}-health-check`}
                      onClick={() => handleAction(troubleshootServer.id, "health-check")}
                      className="mt-3 w-full h-8 text-xs font-bold gap-1.5"
                    >
                      {actionLoadingKey === `${troubleshootServer.id}-health-check` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      Jalankan Cek Kesehatan
                    </Button>
                  </div>

                  {/* 2. Test DB Connection */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-card hover:border-primary/40 transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-bold text-foreground mb-1 text-xs">
                        <Database className="h-4 w-4 text-blue-500" />
                        Uji Koneksi PostgreSQL
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Lakukan query uji <code className="bg-muted px-1 rounded font-mono">SELECT 1</code> langsung ke database dedicated.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoadingKey === `${troubleshootServer.id}-test-db`}
                      onClick={() => handleAction(troubleshootServer.id, "test-db")}
                      className="mt-3 w-full h-8 text-xs font-bold gap-1.5"
                    >
                      {actionLoadingKey === `${troubleshootServer.id}-test-db` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 text-blue-500" />
                      )}
                      Uji Koneksi Database
                    </Button>
                  </div>

                  {/* 3. Sync Schema Prisma */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-card hover:border-primary/40 transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-bold text-foreground mb-1 text-xs">
                        <FolderSync className="h-4 w-4 text-amber-500" />
                        Perbaiki Skema Tabel (Sync Schema)
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Terapkan ulang migrasi tabel Prisma jika database mengalami korupsi atau tabel hilang.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoadingKey === `${troubleshootServer.id}-sync-schema`}
                      onClick={() => handleAction(troubleshootServer.id, "sync-schema")}
                      className="mt-3 w-full h-8 text-xs font-bold gap-1.5"
                    >
                      {actionLoadingKey === `${troubleshootServer.id}-sync-schema` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FolderSync className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      Sinkronkan Skema Tabel
                    </Button>
                  </div>

                  {/* 4. Sync Cloudflare DNS */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-card hover:border-primary/40 transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-bold text-foreground mb-1 text-xs">
                        <Globe className="h-4 w-4 text-primary" />
                        Perbarui DNS Cloudflare
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Daftarkan ulang subdomain <code className="bg-muted px-1 rounded font-mono">db-</code> dan <code className="bg-muted px-1 rounded font-mono">media-</code> jika DNS tidak merespons.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoadingKey === `${troubleshootServer.id}-sync-dns`}
                      onClick={() => handleAction(troubleshootServer.id, "sync-dns")}
                      className="mt-3 w-full h-8 text-xs font-bold gap-1.5"
                    >
                      {actionLoadingKey === `${troubleshootServer.id}-sync-dns` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Globe className="h-3.5 w-3.5 text-primary" />
                      )}
                      Sinkronkan DNS Record
                    </Button>
                  </div>

                </div>

                {/* Power Controls: Start / Stop / Restart */}
                <div className="pt-2 border-t mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoadingKey === `${troubleshootServer.id}-start`}
                    onClick={() => handleAction(troubleshootServer.id, "start")}
                    className="h-8 text-xs font-bold gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                  >
                    {actionLoadingKey === `${troubleshootServer.id}-start` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Start VPS
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoadingKey === `${troubleshootServer.id}-stop`}
                    onClick={() => handleAction(troubleshootServer.id, "stop")}
                    className="h-8 text-xs font-bold gap-1.5 border-slate-500/40 text-slate-600 hover:bg-slate-500/10"
                  >
                    {actionLoadingKey === `${troubleshootServer.id}-stop` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                    Stop VPS
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoadingKey === `${troubleshootServer.id}-restart`}
                    onClick={() => handleAction(troubleshootServer.id, "restart")}
                    className="h-8 text-xs font-bold gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                  >
                    {actionLoadingKey === `${troubleshootServer.id}-restart` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="h-3.5 w-3.5" />
                    )}
                    Reboot / Restart VPS
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setServerToDelete(troubleshootServer)}
                    className="h-8 text-xs font-bold gap-1.5 ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus / Nonaktifkan Server
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setTroubleshootModalOpen(false)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Contabo Instance Management Modal */}
        <Dialog open={contaboModalOpen} onOpenChange={setContaboModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="h-5 w-5 text-primary" /> Kelola Instance Contabo
              </DialogTitle>
              <DialogDescription>
                {contaboRow?.displayName || contaboRow?.name}
                {contaboRow?.tenant ? ` · ${contaboRow.tenant.name}` : ""}
                {" · "}
                <code className="font-mono">ID {contaboRow?.instanceId}</code>
              </DialogDescription>
            </DialogHeader>

            {contaboDetailLoading && !contaboDetail ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-5 py-1 text-xs">
                {/* Live detail bar */}
                <div className="p-3 bg-muted/40 rounded-xl border grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">Status</div>
                    <Badge variant="outline" className={cn("mt-0.5 capitalize text-[10px] font-bold rounded-full px-2 py-0.5", contaboStatusColor(contaboDetail?.status || contaboRow?.status || ""))}>
                      {contaboDetail?.status || contaboRow?.status || "—"}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">IPv4</div>
                    <code className="text-[11px] font-mono font-bold text-foreground">{contaboDetail?.ipv4 || contaboRow?.ipv4 || "—"}</code>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">Region</div>
                    <div className="font-semibold text-foreground">{contaboDetail?.regionName || contaboDetail?.region || contaboRow?.regionName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">Paket</div>
                    <div className="font-semibold text-foreground truncate">{contaboDetail?.productName || contaboRow?.productName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">vCPU / RAM</div>
                    <div className="font-semibold text-foreground">
                      {(contaboDetail?.cpuCores ?? contaboRow?.cpuCores) || "—"} · {contaboDetail?.ramMb ? `${Math.round(contaboDetail.ramMb / 1024)} GB` : contaboRow?.ramMb ? `${Math.round(contaboRow.ramMb / 1024)} GB` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">Disk</div>
                    <div className="font-semibold text-foreground">{(contaboDetail?.diskGb ?? contaboRow?.diskGb) ? `${contaboDetail?.diskGb ?? contaboRow?.diskGb} GB` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">Dibuat</div>
                    <div className="font-semibold text-foreground">{contaboDetail?.createdDate ? new Date(contaboDetail.createdDate).toLocaleDateString("id-ID") : "—"}</div>
                  </div>
                  <div className="flex items-end">
                    <Button variant="ghost" size="sm" onClick={refreshContaboDetail} disabled={contaboDetailLoading} className="h-7 px-2 text-[11px] gap-1.5">
                      <RefreshCw className={cn("h-3 w-3", contaboDetailLoading && "animate-spin")} /> Refresh
                    </Button>
                  </div>
                </div>

                {/* Power controls */}
                <div>
                  <div className="font-bold text-foreground mb-2 flex items-center gap-1.5"><Power className="h-4 w-4 text-primary" /> Kontrol Daya</div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={!!contaboActionKey} onClick={() => runContaboAction("start", {}, { successTitle: "Start" })}
                      className="h-8 text-xs font-bold gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10">
                      {contaboActionKey === "start-" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Start
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!contaboActionKey} onClick={() => runContaboAction("shutdown", {}, { successTitle: "Shutdown" })}
                      className="h-8 text-xs font-bold gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10">
                      {contaboActionKey === "shutdown-" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PowerOff className="h-3.5 w-3.5" />} Shutdown (ACPI)
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!contaboActionKey} onClick={() => runContaboAction("stop", {}, { successTitle: "Stop" })}
                      className="h-8 text-xs font-bold gap-1.5 border-slate-500/40 text-slate-600 hover:bg-slate-500/10">
                      {contaboActionKey === "stop-" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Stop (Power-off)
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!contaboActionKey} onClick={() => runContaboAction("restart", {}, { successTitle: "Restart" })}
                      className="h-8 text-xs font-bold gap-1.5 border-blue-500/40 text-blue-600 hover:bg-blue-500/10">
                      {contaboActionKey === "restart-" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Restart
                    </Button>
                  </div>
                </div>

                {/* Snapshots */}
                <div>
                  <div className="font-bold text-foreground mb-2 flex items-center gap-1.5"><Camera className="h-4 w-4 text-primary" /> Snapshot ({contaboSnapshots.length})</div>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={newSnapshotName}
                      onChange={(e) => setNewSnapshotName(e.target.value)}
                      placeholder="Nama snapshot baru..."
                      className="h-8 text-xs rounded-lg"
                    />
                    <Button
                      size="sm"
                      disabled={!!contaboActionKey || !newSnapshotName.trim()}
                      onClick={() => runContaboAction("snapshot-create", { name: newSnapshotName.trim() }, { successTitle: "Snapshot" }).then(() => setNewSnapshotName(""))}
                      className="h-8 text-xs font-bold gap-1.5 shrink-0"
                    >
                      {contaboActionKey === "snapshot-create-" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Buat
                    </Button>
                  </div>
                  <div className="rounded-xl border divide-y">
                    {contaboSnapshots.length === 0 ? (
                      <div className="p-3 text-center text-muted-foreground text-[11px]">Belum ada snapshot.</div>
                    ) : (
                      contaboSnapshots.map((snap) => (
                        <div key={snap.snapshotId} className="p-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate">{snap.name || snap.snapshotId}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {snap.createdDate ? new Date(snap.createdDate).toLocaleString("id-ID") : "—"}
                              {snap.autoDeleteDate ? ` · auto-hapus ${new Date(snap.autoDeleteDate).toLocaleDateString("id-ID")}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm" variant="outline"
                              disabled={!!contaboActionKey}
                              onClick={() => setContaboConfirm({ kind: "rollback", snapshotId: snap.snapshotId, label: snap.name || snap.snapshotId })}
                              className="h-7 px-2 text-[11px] font-bold gap-1 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                            >
                              <History className="h-3 w-3" /> Rollback
                            </Button>
                            <Button
                              size="icon" variant="outline"
                              disabled={!!contaboActionKey}
                              onClick={() => setContaboConfirm({ kind: "snapshot-delete", snapshotId: snap.snapshotId, label: snap.name || snap.snapshotId })}
                              className="h-7 w-7 rounded-lg"
                              title="Hapus snapshot"
                            >
                              <Trash2 className="h-3 w-3 text-rose-500" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Advanced */}
                <div>
                  <div className="font-bold text-foreground mb-2 flex items-center gap-1.5"><Wrench className="h-4 w-4 text-primary" /> Lanjutan</div>
                  <div className="space-y-3">
                    {/* Rename */}
                    <div className="flex gap-2 items-center">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Nama tampilan instance" className="h-8 text-xs rounded-lg" />
                      <Button
                        size="sm" variant="outline"
                        disabled={!!contaboActionKey || !renameValue.trim() || renameValue.trim() === (contaboDetail?.displayName || contaboRow?.displayName)}
                        onClick={() => runContaboAction("rename", { displayName: renameValue.trim() }, { successTitle: "Ubah Nama" })}
                        className="h-8 text-xs font-bold shrink-0"
                      >
                        Simpan
                      </Button>
                    </div>

                    {/* Reinstall */}
                    <div className="flex gap-2 items-center">
                      <HardDriveDownload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Select value={reinstallImageId} onValueChange={setReinstallImageId}>
                        <SelectTrigger className="h-8 text-xs rounded-lg">
                          <SelectValue placeholder="Pilih OS untuk reinstall..." />
                        </SelectTrigger>
                        <SelectContent>
                          {metaOptions.images.map((img) => (
                            <SelectItem key={img.id} value={img.id} className="text-xs">{img.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm" variant="outline"
                        disabled={!!contaboActionKey || !reinstallImageId}
                        onClick={() => setContaboConfirm({ kind: "reinstall", label: metaOptions.images.find((i) => i.id === reinstallImageId)?.label || reinstallImageId })}
                        className="h-8 text-xs font-bold shrink-0 border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                      >
                        Reinstall
                      </Button>
                    </div>

                    {/* Cancel instance */}
                    <div className="pt-2 border-t flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Batalkan kontrak instance di Contabo (tidak bisa dibatalkan).</span>
                      <Button
                        size="sm" variant="destructive"
                        disabled={!!contaboActionKey}
                        onClick={() => setContaboConfirm({ kind: "cancel", label: contaboRow?.displayName || contaboRow?.name || "" })}
                        className="h-8 text-xs font-bold gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Batalkan Instance
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setContaboModalOpen(false)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Contabo destructive-action confirm */}
        <AlertDialog open={!!contaboConfirm} onOpenChange={(o) => !o && setContaboConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-rose-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                {contaboConfirm?.kind === "rollback" && "Rollback ke snapshot?"}
                {contaboConfirm?.kind === "snapshot-delete" && "Hapus snapshot?"}
                {contaboConfirm?.kind === "reinstall" && "Reinstall OS?"}
                {contaboConfirm?.kind === "cancel" && "Batalkan instance?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                {contaboConfirm?.kind === "rollback" && (
                  <>Instance akan reboot dan seluruh perubahan data setelah snapshot <strong>{contaboConfirm.label}</strong> dibuat akan hilang.</>
                )}
                {contaboConfirm?.kind === "snapshot-delete" && (
                  <>Snapshot <strong>{contaboConfirm.label}</strong> akan dihapus permanen.</>
                )}
                {contaboConfirm?.kind === "reinstall" && (
                  <>Seluruh data pada disk instance akan <strong>terhapus total</strong> dan OS <strong>{contaboConfirm.label}</strong> dipasang bersih. Untuk server tenant, ini memutus database & storage-nya.</>
                )}
                {contaboConfirm?.kind === "cancel" && (
                  <>Instance <strong>{contaboConfirm.label}</strong> akan dibatalkan di Contabo. Data tidak dapat dipulihkan.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!contaboActionKey} className="text-xs">Batal</AlertDialogCancel>
              <AlertDialogAction
                disabled={!!contaboActionKey}
                onClick={(e) => {
                  e.preventDefault()
                  if (!contaboConfirm) return
                  if (contaboConfirm.kind === "rollback") runContaboAction("snapshot-rollback", { snapshotId: contaboConfirm.snapshotId }, { successTitle: "Rollback" })
                  else if (contaboConfirm.kind === "snapshot-delete") runContaboAction("snapshot-delete", { snapshotId: contaboConfirm.snapshotId }, { successTitle: "Hapus Snapshot" })
                  else if (contaboConfirm.kind === "reinstall") runContaboAction("reinstall", { imageId: reinstallImageId }, { successTitle: "Reinstall" })
                  else if (contaboConfirm.kind === "cancel") runContaboCancel()
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {contaboActionKey ? "Memproses..." : "Ya, Lanjutkan"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Credentials Modal */}
        <Dialog open={credModalOpen} onOpenChange={setCredModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Detail Kredensial & Endpoint Dedicated
              </DialogTitle>
              <DialogDescription>
                Tenant: <span className="font-semibold text-foreground">{selectedServer?.tenant?.name}</span> ({selectedServer?.tenant?.slug})
              </DialogDescription>
            </DialogHeader>

            {loadingCreds ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : credentials ? (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-muted/50 rounded-xl space-y-2 border">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">PostgreSQL Database (Port 5432)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Host:</span> <code className="bg-background px-1 py-0.5 rounded font-mono">{selectedServer?.dbHost}</code></div>
                    <div><span className="text-muted-foreground">Port:</span> <code className="bg-background px-1 py-0.5 rounded font-mono">{selectedServer?.dbPort}</code></div>
                    <div><span className="text-muted-foreground">Database:</span> <code className="bg-background px-1 py-0.5 rounded font-mono">{credentials.databaseName}</code></div>
                    <div><span className="text-muted-foreground">User:</span> <code className="bg-background px-1 py-0.5 rounded font-mono">{credentials.dbUser}</code></div>
                  </div>

                  <div className="pt-2">
                    <Label className="text-[11px] text-muted-foreground font-semibold">Connection String (Encrypted at rest):</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input readOnly value={credentials.connectionString} className="font-mono text-xs h-8" />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => copyToClipboard(credentials.connectionString, "conn-str")}
                      >
                        {copiedKey === "conn-str" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-xl space-y-2 border">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">MinIO S3 Object Storage (Port 443 HTTPS)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Endpoint:</span> <code className="bg-background px-1 py-0.5 rounded font-mono">{credentials.s3Endpoint}</code></div>
                    <div><span className="text-muted-foreground">Bucket:</span> <code className="bg-background px-1 py-0.5 rounded font-mono">{credentials.s3Bucket}</code></div>
                    <div><span className="text-muted-foreground">Access Key:</span> <code className="bg-background px-1 py-0.5 rounded font-mono">{credentials.minioUser}</code></div>
                    <div><span className="text-muted-foreground">Public URL:</span> <code className="bg-background px-1 py-0.5 rounded font-mono">{credentials.s3PublicUrl}</code></div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6 text-xs">Kredensial tidak ditemukan.</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setCredModalOpen(false)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Provision Dedicated Server Modal */}
        <Dialog open={provisionModalOpen} onOpenChange={setProvisionModalOpen}>
          <DialogContent className="max-w-xl">
            <form onSubmit={handleProvisionSubmit}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <Server className="h-5 w-5 text-primary" /> Provision Dedicated Server
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Alokasikan VPS/VDS appliance khusus (PostgreSQL 17 + MinIO S3 + UFW Firewall) di Contabo Cloud.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4 text-xs">
                {/* Workspace Target */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Workspace / Tenant Tujuan</Label>
                  <Select
                    value={provisionForm.tenantId}
                    onValueChange={(val) => setProvisionForm((prev) => ({ ...prev, tenantId: val }))}
                  >
                    <SelectTrigger className="text-xs rounded-xl h-10">
                      <SelectValue placeholder="Pilih workspace..." />
                    </SelectTrigger>
                    <SelectContent>
                      {metaOptions.tenants?.map((t: any) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.name} ({t.slug}) — Plan {t.plan}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Contabo Plan */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Paket Server Dedicated (Contabo)</Label>
                  <Select
                    value={provisionForm.plan}
                    onValueChange={(val) => setProvisionForm((prev) => ({ ...prev, plan: val }))}
                  >
                    <SelectTrigger className="text-xs rounded-xl h-10">
                      <SelectValue placeholder="Pilih paket VPS/VDS..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {metaOptions.plans?.map((p: any) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name} — {p.cpuCores} vCPU, {p.ramMb / 1024} GB RAM, {p.diskGb} GB {p.diskType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Contabo Region Location Selector */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-primary" /> Lokasi Data Center (Region)
                    </Label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      Default: Singapore (Asia)
                    </span>
                  </div>
                  <Select
                    value={provisionForm.region}
                    onValueChange={(val) => setProvisionForm((prev) => ({ ...prev, region: val }))}
                  >
                    <SelectTrigger className="text-xs rounded-xl h-10">
                      <SelectValue placeholder="Pilih Region..." />
                    </SelectTrigger>
                    <SelectContent>
                      {metaOptions.regions?.map((r: any) => (
                        <SelectItem key={r.id} value={r.id} className="text-xs">
                          {r.flag} {r.name} {r.isDefault ? "★ (Rekomendasi Asia)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Lokasi Singapore (SIN) memberikan latensi paling rendah & optimal untuk pengguna di Indonesia.
                  </p>
                </div>

                {/* OS System */}
                <div className="p-3 bg-muted/50 rounded-xl border flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground text-xs">Sistem Operasi (OS)</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Ubuntu 24.04 LTS (64-bit Server Standard)</div>
                  </div>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] font-bold">
                    Default Auto-Config
                  </Badge>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProvisionModalOpen(false)}
                  disabled={provisionLoading}
                  className="text-xs rounded-xl"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={provisionLoading || !provisionForm.tenantId}
                  className="text-xs rounded-xl font-bold bg-primary text-primary-foreground gap-2"
                >
                  {provisionLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sedang Memesan ke Contabo...
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5" /> Konfirmasi & Provision Server
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Alert */}
        <AlertDialog open={!!serverToDelete} onOpenChange={() => setServerToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-rose-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Hapus Dedicated VPS?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                Tindakan ini akan menghapus instance VPS pada Contabo, menghapus DNS record, dan memutuskan database dedicated dari workspace <strong>{serverToDelete?.tenant?.name}</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting} className="text-xs">Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {isDeleting ? "Menghapus..." : "Ya, Hapus VPS"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  )
}
