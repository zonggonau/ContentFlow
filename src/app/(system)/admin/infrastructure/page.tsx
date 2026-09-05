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
  FolderSync,
  Globe,
  Zap,
  Wrench,
  Wifi,
  KeyRound,
  AlertTriangle,
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

export default function AdminInfrastructurePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()

  const [servers, setServers] = useState<InfrastructureServer[]>([])
  const [summary, setSummary] = useState<any>({ total: 0, active: 0, provisioning: 0, error: 0 })
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

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

  // Provision Modal States
  const [provisionModalOpen, setProvisionModalOpen] = useState(false)
  const [provisionLoading, setProvisionLoading] = useState(false)
  const [metaOptions, setMetaOptions] = useState<{
    plans: any[]
    regions: any[]
    defaultRegion: string
    tenants: any[]
  }>({
    plans: [],
    regions: [],
    defaultRegion: "SIN",
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
      const query = new URLSearchParams()
      if (statusFilter !== "all") query.set("status", statusFilter)
      if (searchQuery) query.set("search", searchQuery)

      const res = await fetch(`/api/admin/infrastructure?${query.toString()}`)
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
  }, [isSuperAdmin, statusFilter, searchQuery])

  // Auto-refresh monitoring every 30 seconds
  useEffect(() => {
    if (!isSuperAdmin) return
    const timer = setInterval(() => {
      fetchServers(true)
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

  const handleAction = async (serverId: string, action: "health-check" | "restart" | "sync-schema" | "sync-dns" | "test-db") => {
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
              onClick={() => fetchServers()} 
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari tenant, IP, hostname..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs rounded-xl"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 text-xs rounded-xl">
              <SelectValue placeholder="Status Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="active">Active (Normal)</SelectItem>
              <SelectItem value="provisioning">Provisioning / Boot</SelectItem>
              <SelectItem value="error">Error / Gangguan</SelectItem>
              <SelectItem value="destroyed">Destroyed (Nonaktif)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Server List Table */}
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm rounded-2xl shadow-xs overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-bold text-xs">Tenant & Identitas Server</TableHead>
                  <TableHead className="font-bold text-xs">Spesifikasi & Region</TableHead>
                  <TableHead className="font-bold text-xs">Endpoint Layanan</TableHead>
                  <TableHead className="font-bold text-xs">Status Server</TableHead>
                  <TableHead className="font-bold text-xs">Kesehatan Layanan</TableHead>
                  <TableHead className="font-bold text-xs text-right">Tindakan & Troubleshooting</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground text-xs">
                      Tidak ada server dedicated yang sesuai dengan kriteria pencarian.
                    </TableCell>
                  </TableRow>
                ) : (
                  servers.map((server) => {
                    const isHealthChecking = actionLoadingKey === `${server.id}-health-check`
                    const isRestarting = actionLoadingKey === `${server.id}-restart`

                    return (
                      <TableRow key={server.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="font-bold text-foreground text-sm">{server.tenant?.name || "Unknown Workspace"}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            {server.tenant?.slug} &bull; <span className="text-primary">{server.ipv4 || "IPv4 Menunggu..."}</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                            <Cpu className="h-3.5 w-3.5 text-primary" /> {server.cpuCount} Cores &bull; {server.ramMb / 1024} GB RAM
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 font-medium">
                            <HardDrive className="h-3.5 w-3.5 text-primary" /> {server.diskGb} GB NVMe &bull; {server.region}
                          </div>
                          {server.status === "active" && (
                            <div className="mt-1.5 pt-1 border-t border-border/40 space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>CPU: {server.metricsSnapshot?.cpuUsagePercent != null ? `${server.metricsSnapshot.cpuUsagePercent}%` : "Tidak tersedia"}</span>
                                <span>RAM: {server.metricsSnapshot?.ramUsagePercent != null ? `${server.metricsSnapshot.ramUsagePercent}%` : "Tidak tersedia"}</span>
                              </div>
                              {server.metricsSnapshot?.ramUsagePercent != null && (
                                <div className="w-full bg-muted h-1 rounded-full overflow-hidden flex">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full transition-all"
                                    style={{ width: `${Math.min(100, server.metricsSnapshot.ramUsagePercent)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[11px] font-mono">
                              <Database className="h-3 w-3 text-blue-500 shrink-0" />
                              <span className="truncate max-w-[170px]">{server.dbHost || "db-pending.sacms.cloud"}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-mono">
                              <HardDrive className="h-3 w-3 text-amber-500 shrink-0" />
                              <span className="truncate max-w-[170px]">{server.mediaHost || "media-pending.sacms.cloud"}</span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize font-bold text-[10px] px-2.5 py-0.5 rounded-full",
                              server.status === "active" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
                              server.status === "provisioning" && "bg-amber-500/10 text-amber-600 border-amber-500/30",
                              server.status === "configuring" && "bg-blue-500/10 text-blue-600 border-blue-500/30",
                              server.status === "error" && "bg-rose-500/10 text-rose-600 border-rose-500/30",
                              server.status === "destroyed" && "bg-muted text-muted-foreground border-muted"
                            )}
                          >
                            {server.status}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div
                              className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                server.healthStatus === "healthy" && "bg-emerald-500 shadow-xs shadow-emerald-500/50",
                                server.healthStatus === "degraded" && "bg-amber-500 shadow-xs shadow-amber-500/50",
                                server.healthStatus === "unhealthy" && "bg-rose-500 shadow-xs shadow-rose-500/50",
                                server.healthStatus === "unknown" && "bg-slate-400"
                              )}
                            />
                            <span className="text-xs font-semibold capitalize text-foreground">
                              {server.healthStatus === "healthy" ? "Sehat" : server.healthStatus === "degraded" ? "Degraded" : server.healthStatus === "unhealthy" ? "Kritis" : "Belum Dicek"}
                            </span>
                          </div>
                          {server.lastHealthCheckAt && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Cek: {new Date(server.lastHealthCheckAt).toLocaleTimeString("id-ID")}
                            </p>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Diagnostic & Action Hub Button */}
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setTroubleshootServer(server)
                                setTroubleshootModalOpen(true)
                              }}
                              className="rounded-xl h-8 px-3 text-xs font-bold gap-1.5 shadow-xs"
                            >
                              <Wrench className="h-3.5 w-3.5" />
                              Tindakan
                            </Button>

                            {/* View Credentials */}
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-xl"
                              title="Lihat Kredensial & Endpoint"
                              onClick={() => handleViewCredentials(server)}
                            >
                              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
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

                {/* Danger Zone: Reboot & Terminate */}
                <div className="pt-2 border-t mt-3 flex items-center justify-between gap-2">
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
                    className="h-8 text-xs font-bold gap-1.5"
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
