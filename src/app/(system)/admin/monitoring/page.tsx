"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Loader2, Activity, Cpu, HardDrive, Globe, RefreshCw, 
  AlertTriangle, Search, Filter, CheckCircle2, Clock,
  ChevronLeft, ChevronRight
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { AdminPageSkeleton } from "@/components/admin/admin-page-skeleton"

interface SystemMetric {
  type: string
  value: number
  metadata: string | null
  timestamp: string
}

interface ApiRequest {
  id: string
  tenantId: string | null
  endpoint: string
  method: string
  statusCode: number
  duration: number
  apiKeyId: string | null
  createdAt: string
}

interface ComponentHealth {
  name: string
  status: "HEALTHY" | "DOWN" | "CONFIGURED" | "NOT_CONFIGURED" | "RUNNING" | "UNKNOWN"
  detail: string
}

export default function AdminMonitoringPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  const [metrics, setMetrics] = useState<SystemMetric[]>([])
  const [componentHealth, setComponentHealth] = useState<ComponentHealth[]>([])
  const [apiRequests, setApiRequests] = useState<ApiRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [methodFilter, setMethodFilter] = useState("all")

  // Pagination States
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRequests, setTotalRequests] = useState(0)

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 500)
    return () => clearTimeout(handler)
  }, [searchQuery])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilter, methodFilter])

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const [metricsRes, requestsRes] = await Promise.all([
        fetch("/api/admin/monitoring/metrics"),
        fetch(`/api/admin/monitoring/requests?page=${page}&limit=10&search=${encodeURIComponent(debouncedSearch)}&status=${statusFilter}&method=${methodFilter}`),
      ])

      if (metricsRes.ok) {
        const data = await metricsRes.json()
        setMetrics(data.metrics || [])
        setComponentHealth(data.componentHealth || [])
      }

      if (requestsRes.ok) {
        const data = await requestsRes.json()
        setApiRequests(data.requests || [])
        setTotalPages(data.totalPages || 1)
        setTotalRequests(data.total || 0)
        setPage(data.page || 1)
      }
    } catch (error) {
      console.error("Failed to fetch monitoring data:", error)
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, methodFilter])

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session?.user?.role === "super_admin") {
      fetchData()
    }
  }, [session, fetchData])

  // Auto-refresh logic
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchData()
      }, 30000)
    }
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const getStatusBadge = (code: number) => {
    if (code < 300) return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-none font-mono text-[10px] px-2 py-0.5 rounded-full border">{code}</Badge>
    if (code < 400) return <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 shadow-none font-mono text-[10px] px-2 py-0.5 rounded-full border">{code}</Badge>
    if (code < 500) return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shadow-none font-mono text-[10px] px-2 py-0.5 rounded-full border">{code}</Badge>
    return <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shadow-none font-mono text-[10px] px-2 py-0.5 rounded-full border" variant="outline">{code}</Badge>
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 flex-col w-full">
        <AdminPageSkeleton layout="table" cardsCount={4} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Pemantauan Sistem & API</h1>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold rounded-full">
                  Real-time
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Metrik performa infrastruktur server dan pemantauan lalu lintas API gateway.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-card p-1.5 px-3 rounded-xl border border-border/80 shadow-xs">
                <Switch 
                  id="auto-refresh" 
                  checked={autoRefresh} 
                  onCheckedChange={setAutoRefresh} 
                />
                <Label htmlFor="auto-refresh" className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                  {autoRefresh ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Auto-Refresh
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                      Jeda
                    </>
                  )}
                </Label>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchData} 
                disabled={refreshing} 
                className="h-9 rounded-xl border-border/80 font-bold text-xs shadow-xs"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
                {refreshing ? "Memuat..." : "Segarkan"}
              </Button>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Penggunaan CPU", value: `${metrics.find(m => m.type === 'cpu')?.value || 0}%`, icon: Cpu, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Memori RAM", value: `${metrics.find(m => m.type === 'memory')?.value || 0}%`, icon: HardDrive, color: "text-purple-500", bg: "bg-purple-500/10" },
              { label: "Permintaan/Menit", value: metrics.find(m => m.type === 'requests')?.value || 0, icon: Globe, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { label: "Galat (1 Jam)", value: metrics.find(m => m.type === 'errors')?.value || 0, icon: AlertTriangle, color: "text-rose-500", bg: "bg-rose-500/10" },
            ].map((m) => (
              <Card key={m.label} className="border border-border/80 rounded-2xl shadow-xs bg-card">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border/60", m.bg)}>
                    <m.icon className={cn("h-5 w-5", m.color)} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{m.label}</p>
                    <p className="text-2xl font-black tracking-tight text-foreground font-mono">{m.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* API Traffic Area */}
          <Card className="border border-border/80 rounded-2xl shadow-xs bg-card overflow-hidden">
            <CardHeader className="bg-muted/20 border-b border-border/60 p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">Log Lalu Lintas API</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">Pemantauan riwayat pemanggilan endpoint secara real-time</CardDescription>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input 
                      placeholder="Cari endpoint atau tenant..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 h-9 w-[200px] text-xs bg-background border-border/80 rounded-xl"
                    />
                  </div>
                  
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 w-[130px] text-xs bg-background border-border/80 rounded-xl">
                      <Filter className="h-3 w-3 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border bg-card">
                      <SelectItem value="all" className="text-xs rounded-lg">Semua Status</SelectItem>
                      <SelectItem value="success" className="text-xs rounded-lg">Sukses (2xx)</SelectItem>
                      <SelectItem value="client_error" className="text-xs rounded-lg">Client Error (4xx)</SelectItem>
                      <SelectItem value="server_error" className="text-xs rounded-lg">Server Error (5xx)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={methodFilter} onValueChange={setMethodFilter}>
                    <SelectTrigger className="h-9 w-[110px] text-xs bg-background border-border/80 rounded-xl">
                      <SelectValue placeholder="Metode" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border bg-card">
                      <SelectItem value="all" className="text-xs rounded-lg">Semua</SelectItem>
                      <SelectItem value="GET" className="text-xs rounded-lg">GET</SelectItem>
                      <SelectItem value="POST" className="text-xs rounded-lg">POST</SelectItem>
                      <SelectItem value="PATCH" className="text-xs rounded-lg">PATCH</SelectItem>
                      <SelectItem value="DELETE" className="text-xs rounded-lg">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border/60">
                    <tr>
                      <th className="px-5 py-3">Metode & Status</th>
                      <th className="px-5 py-3">Endpoint</th>
                      <th className="px-5 py-3">Tenant ID</th>
                      <th className="px-5 py-3">Latensi</th>
                      <th className="px-5 py-3 text-right">Waktu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 bg-card">
                    {apiRequests.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground text-xs">
                          {searchQuery ? "Tidak ada permintaan yang cocok dengan filter" : "Menunggu lalu lintas API..."}
                        </td>
                      </tr>
                    ) : (
                      apiRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs w-12 text-foreground font-mono">{req.method}</span>
                              {getStatusBadge(req.statusCode)}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <code className="text-[11px] bg-muted/30 border border-border/60 px-2 py-0.5 rounded-lg font-mono text-foreground max-w-[320px] truncate block">
                              {req.endpoint}
                            </code>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-mono text-muted-foreground">
                              {req.tenantId ? (
                                <span className="border border-border/60 px-1.5 py-0.5 bg-muted/20 rounded-md text-[10px]">{req.tenantId}</span>
                              ) : (
                                <span className="text-primary font-bold text-[10px] uppercase bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20">global</span>
                              )}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 font-mono text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className={`font-bold ${req.duration > 500 ? 'text-amber-500' : 'text-foreground'}`}>
                                {req.duration}ms
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono text-xs text-muted-foreground">
                            {new Date(req.createdAt).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {!loading && totalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t border-border/60 bg-muted/20">
                  <div className="text-xs text-muted-foreground">
                    Halaman <span className="font-bold text-foreground">{page}</span> dari <span className="font-bold text-foreground">{totalPages || 1}</span> ({totalRequests} Total)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="rounded-lg h-8 text-xs font-bold"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Sebelumnya
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages || totalPages === 0}
                      className="rounded-lg h-8 text-xs font-bold"
                    >
                      Berikutnya <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom Health Checks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border border-border/80 rounded-2xl shadow-xs bg-card">
              <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status Komponen Platform</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 p-4">
                {componentHealth.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-3">Memuat status komponen...</div>
                ) : (
                  componentHealth.map(s => {
                    const isHealthy = s.status === "HEALTHY" || s.status === "CONFIGURED" || s.status === "RUNNING"
                    const isDown = s.status === "DOWN"
                    const Icon = isHealthy ? CheckCircle2 : AlertTriangle
                    const color = isHealthy ? "text-emerald-500" : isDown ? "text-rose-500" : "text-amber-500"
                    const badgeClass = isHealthy
                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                      : isDown
                        ? "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20"
                        : "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                    return (
                      <div key={s.name} className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/10 font-mono">
                        <div>
                          <span className="text-xs font-bold text-foreground">{s.name}</span>
                          <div className="text-[9px] text-muted-foreground">{s.detail}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", badgeClass)}>{s.status}</span>
                          <Icon className={cn("h-4 w-4", color)} />
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/80 rounded-2xl shadow-xs bg-card flex flex-col justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-2xl border border-primary/20 bg-primary/10 flex items-center justify-center mx-auto mb-3 text-primary">
                <Activity className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Infrastruktur Terintegrasi</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 leading-relaxed">
                Seluruh metrik performa dipantau otomatis. Gunakan log ini untuk mengidentifikasi bottleneck latensi atau anomali akses API.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
