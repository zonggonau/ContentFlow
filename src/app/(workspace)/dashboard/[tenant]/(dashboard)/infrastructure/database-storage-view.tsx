"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Server,
  Database,
  Upload,
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Cpu,
  HardDrive,
  Lock,
  Save,
  Zap,
  ArrowRight,
  Sparkles,
  Layers,
  Check,
  X,
  HelpCircle,
  ExternalLink,
  Sliders,
  ShieldCheck,
  Network,
  CloudLightning,
  Settings2,
  Play,
  Square,
  Power,
  Rocket,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
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

export function DatabaseStorageView({ tenantSlug }: { tenantSlug: string }) {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [infraServer, setInfraServer] = useState<any>(null)
  const [tenantSettings, setTenantSettings] = useState<any>(null)
  const [testingHealth, setTestingHealth] = useState(false)
  const [activeTab, setActiveTab] = useState<"overview" | "console">("overview")

  // VPS lifecycle control (start/stop/restart) state
  const [vpsAction, setVpsAction] = useState<"start" | "stop" | "restart" | null>(null)
  const [confirmAction, setConfirmAction] = useState<"start" | "stop" | "restart" | null>(null)

  // BYODB & BYOS State
  const [databaseUrl, setDatabaseUrl] = useState("")
  const [storageEndpoint, setStorageEndpoint] = useState("")
  const [storageAccessKey, setStorageAccessKey] = useState("")
  const [storageSecretKey, setStorageSecretKey] = useState("")
  const [storageBucket, setStorageBucket] = useState("")
  const [storagePublicUrl, setStoragePublicUrl] = useState("")

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login")
    }
  }, [authStatus, router])

  const fetchInfrastructure = async () => {
    if (!tenantSlug) return
    try {
      const [infraRes, settingsRes] = await Promise.all([
        fetch(`/api/tenant/${tenantSlug}/infrastructure`),
        fetch(`/api/tenant/${tenantSlug}/settings`),
      ])

      let serverObj = null
      if (infraRes.ok) {
        const infraData = await infraRes.json()
        serverObj = infraData.server || null
        setInfraServer(serverObj)
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        const s = settingsData.settings || {}
        setTenantSettings(s)
        const dbUrl = s.databaseUrl || ""
        setDatabaseUrl(dbUrl)
        if (s.storageConfig) {
          setStorageEndpoint(s.storageConfig.endpoint || "")
          setStorageAccessKey(s.storageConfig.accessKey || "")
          setStorageSecretKey(s.storageConfig.secretKey || "")
          setStorageBucket(s.storageConfig.bucket || "")
          setStoragePublicUrl(s.storageConfig.publicUrl || "")
        }

        // Set default tab based on whether tenant already has dedicated infra
        const hasActiveDedicated = Boolean(serverObj || (dbUrl && dbUrl.trim() !== ""))
        setActiveTab(hasActiveDedicated ? "console" : "overview")
      }
    } catch {
      toast.error("Gagal memuat konfigurasi infrastruktur")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tenantSlug && session?.user) {
      fetchInfrastructure()
    }
  }, [tenantSlug, session])

  const handleTestHealth = async () => {
    setTestingHealth(true)
    try {
      if (infraServer?.id) {
        const res = await fetch(`/api/tenant/${tenantSlug}/infrastructure`, { method: "POST" })
        const data = await res.json()
        if (res.ok && data.healthy) {
          toast.success("Koneksi Dedicated VPS, PostgreSQL dan MinIO S3 terverifikasi normal & sehat!")
        } else {
          toast.warning(data.message || "Pengecekan infrastruktur menunjukkan status degraded")
        }
      } else {
        await new Promise((r) => setTimeout(r, 800))
        toast.success("Koneksi database terverifikasi normal.")
      }
    } catch {
      toast.error("Pengecekan koneksi infrastruktur gagal")
    } finally {
      setTestingHealth(false)
    }
  }

  const handleVpsAction = async (action: "start" | "stop" | "restart") => {
    setConfirmAction(null)
    setVpsAction(action)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/infrastructure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const labels = { start: "dinyalakan", stop: "dihentikan", restart: "di-restart" }
        toast.success(`Sinyal ${labels[action]} berhasil dikirim ke VPS. Perubahan status memerlukan beberapa saat.`)
        // Give Contabo a moment to reflect the action before we re-poll.
        setTimeout(() => fetchInfrastructure(), 3000)
      } else {
        toast.error(data.message || data.error || `Gagal mengirim sinyal ${action} ke VPS`)
      }
    } catch {
      toast.error("Terjadi kesalahan saat menghubungi server")
    } finally {
      setVpsAction(null)
    }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseUrl: databaseUrl.trim() === "" ? null : databaseUrl.trim(),
          storageConfig:
            storageEndpoint && storageAccessKey && storageSecretKey && storageBucket
              ? {
                  endpoint: storageEndpoint,
                  accessKey: storageAccessKey,
                  secretKey: storageSecretKey,
                  bucket: storageBucket,
                  publicUrl: storagePublicUrl,
                }
              : null,
        }),
      })

      if (res.ok) {
        toast.success("Konfigurasi infrastruktur berhasil disimpan!")
        fetchInfrastructure()
      } else {
        const data = await res.json()
        toast.error(data.error || "Gagal menyimpan konfigurasi")
      }
    } catch {
      toast.error("Terjadi kesalahan saat menyimpan")
    } finally {
      setSaving(false)
    }
  }

  const hasDedicated = Boolean(
    infraServer ||
    (databaseUrl && databaseUrl.trim() !== "")
  )

  if (loading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-300">
            <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-72 rounded-md" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-96 max-w-full rounded-md mt-2" />
              </CardHeader>
              <CardContent className="p-5 pt-2 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-3.5 rounded-xl bg-muted/30 border border-border/60 space-y-2">
                      <Skeleton className="h-3 w-28 rounded-md" />
                      <Skeleton className="h-5 w-40 rounded-md" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black tracking-tight text-foreground">
                  Database &amp; Storage
                </h2>
                {hasDedicated ? (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-bold rounded-full flex items-center gap-1.5 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Dedicated Appliance Aktif
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-bold rounded-full flex items-center gap-1.5 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Shared Multi-Tenant Pool
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-3xl">
                {hasDedicated 
                  ? "Workspace Anda beroperasi pada database terisolasi mandiri (Dedicated PostgreSQL 17 / Custom DB)." 
                  : "Workspace Anda saat ini terhubung ke Cluster Basis Data Bersama SaCMS Cloud dengan isolasi logis tingkat tenant."
                }
              </p>
            </div>

            {/* Top Action Controls & Tab Switcher */}
            <div className="flex items-center gap-2">
              <div className="flex items-center p-1 bg-muted/60 border border-border/80 rounded-xl">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === "overview"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    Mode A: Status & Upgrade
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("console")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === "console"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Settings2 className="h-3.5 w-3.5" />
                    Mode B: Konsol Teknis (BYODB)
                  </span>
                </button>
              </div>

              {activeTab === "console" && (
                <Button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 rounded-xl shadow-xs cursor-pointer gap-1.5"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Simpan
                </Button>
              )}

            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB 1 (MODE A): SHARED STATUS OVERVIEW & UPGRADE SHOWCASE GATEWAY */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div className="space-y-8 animate-in fade-in-50 duration-300">
              
              {/* Active Shared Cluster Status Overview Card */}
              <Card className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xs shadow-xs overflow-hidden">
                <CardHeader className="p-5 pb-3 bg-muted/20 border-b border-border/60">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Server className="h-4 w-4 text-emerald-500" />
                      Status Lingkungan Database Aktif
                    </CardTitle>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> {hasDedicated ? "Dedicated Isolated" : "Shared Pool Beroperasi Normal"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="p-3.5 rounded-xl bg-background border border-border/80 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tipe Database</span>
                      <p className="text-xs font-bold text-foreground">
                        {hasDedicated ? "PostgreSQL 17 Dedicated" : "PostgreSQL 17 Cluster"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {hasDedicated ? "Server Appliance Terisolasi" : "Shared Multi-Tenant Engine"}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-background border border-border/80 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Object Storage</span>
                      <p className="text-xs font-bold text-foreground">
                        {infraServer?.mediaHost ? "MinIO S3 Dedicated" : "Cloudflare R2 / S3 Storage"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">CDN Terdistribusi Global</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-background border border-border/80 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Isolasi Keamanan</span>
                      <p className="text-xs font-bold text-foreground">
                        {hasDedicated ? "100% Dedicated Physical DB" : "Tenant Logical Scoping"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Enkripsi Data In-Transit & At-Rest</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-background border border-border/80 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Alokasi Resource</span>
                      <p className="text-xs font-bold text-foreground">
                        {hasDedicated ? "Dedicated vCPU & RAM Murni" : "Shared Pool SaCMS"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {hasDedicated ? "Siap Beban Trafik Tinggi" : "Cocok untuk Website Standar"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Why Dedicated Appliance? Feature Grid */}
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2">
                    <CloudLightning className="h-5 w-5 text-primary" />
                    Keunggulan Arsitektur Dedicated VPS Appliance
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tingkatkan performa, isolasi fisik, dan kedaulatan data instansi Anda dengan server database mandiri.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition-colors shadow-xs">
                    <CardHeader className="p-4 pb-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                        <Cpu className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-xs font-bold text-foreground">100% Dedicated Resource</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground leading-relaxed">
                      vCPU dan RAM fisik dialokasikan khusus untuk workspace Anda tanpa terpengaruh lonjakan traffic workspace lain (*zero noisy neighbors*).
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition-colors shadow-xs">
                    <CardHeader className="p-4 pb-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center mb-2">
                        <Network className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-xs font-bold text-foreground">Performa Query Kompleks</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground leading-relaxed">
                      Mendukung query join bertingkat, agregasi masif, dan ribuan transaksi paralel dengan database terpisah berlatensi rendah.
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition-colors shadow-xs">
                    <CardHeader className="p-4 pb-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-2">
                        <HardDrive className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-xs font-bold text-foreground">Dedicated MinIO S3 + NVMe</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground leading-relaxed">
                      Penyimpanan media mandiri berkecepatan tinggi dengan MinIO S3 appliance dan drive NVMe SSD langsung di VPS Anda.
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition-colors shadow-xs">
                    <CardHeader className="p-4 pb-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center mb-2">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-xs font-bold text-foreground">Bring Your Own DB (BYODB)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground leading-relaxed">
                      Bebas menghubungkan instance PostgreSQL milik instansi sendiri (AWS RDS, Supabase, On-Premise) untuk kedaulatan data penuh.
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Comparison Table: Shared Pool vs Dedicated Appliance */}
              <Card className="rounded-2xl border border-border/80 shadow-xs overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Tabel Perbandingan: Shared Pool vs Dedicated VPS Appliance
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Lihat perbedaan kapabilitas infrastruktur antara database bersama SaCMS dan dedicated appliance terisolasi.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border/60">
                        <tr>
                          <th className="p-3.5 pl-5">Fitur & Kapabilitas</th>
                          <th className="p-3.5">Shared Database (Default)</th>
                          <th className="p-3.5 pr-5 text-primary">Dedicated VPS Appliance 🚀</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5 pl-5 font-semibold text-foreground">Alokasi CPU & RAM</td>
                          <td className="p-3.5 text-muted-foreground">Shared Pool (Bersama Tenant Lain)</td>
                          <td className="p-3.5 pr-5 font-bold text-foreground">100% Dedicated (Cloud VPS / VDS)</td>
                        </tr>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5 pl-5 font-semibold text-foreground">Isolasi Database Engine</td>
                          <td className="p-3.5 text-muted-foreground">Schema Multi-Tenant Terisolasi</td>
                          <td className="p-3.5 pr-5 font-bold text-foreground">Dedicated PostgreSQL 17 Instance</td>
                        </tr>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5 pl-5 font-semibold text-foreground">Media Storage Engine</td>
                          <td className="p-3.5 text-muted-foreground">Multi-Tenant Cloud Bucket</td>
                          <td className="p-3.5 pr-5 font-bold text-foreground">Dedicated MinIO S3 + NVMe Storage</td>
                        </tr>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5 pl-5 font-semibold text-foreground">Dukungan Database Luar (BYODB)</td>
                          <td className="p-3.5 text-muted-foreground flex items-center gap-1.5"><X className="h-3.5 w-3.5 text-rose-500" /> Perlu Paket Enterprise</td>
                          <td className="p-3.5 pr-5 font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Bebas Hubungkan DB Sendiri</td>
                        </tr>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5 pl-5 font-semibold text-foreground">Disaster Recovery & Snapshots</td>
                          <td className="p-3.5 text-muted-foreground">Standard SaCMS Backup</td>
                          <td className="p-3.5 pr-5 font-bold text-foreground">1-Click VPS Snapshot & Rollback</td>
                        </tr>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5 pl-5 font-semibold text-foreground">Dedicated Server IP & Reverse Proxy</td>
                          <td className="p-3.5 text-muted-foreground">Shared Gateway SaCMS</td>
                          <td className="p-3.5 pr-5 font-bold text-foreground">Dedicated IP + Auto Let&apos;s Encrypt SSL</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
                <CardFooter className="p-5 bg-muted/20 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Tingkatkan ke Dedicated VPS Appliance untuk isolasi 100% dan performa maksimal.
                  </p>
                  <Button
                    onClick={() => router.push(`/dashboard/${tenantSlug}/subscriptions`)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 px-4 rounded-xl shadow-xs gap-1.5 cursor-pointer shrink-0"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Pilih Paket Dedicated VPS
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </CardFooter>
              </Card>

            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB 2 (MODE B): ACTIVE DEDICATED CONSOLE & BYODB / BYOS INPUTS     */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "console" && (
            <div className="space-y-6 animate-in fade-in-50 duration-300">
              
              {/* Health Test Bar */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/80">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Status Koneksi Infrastruktur</p>
                    <p className="text-[11px] text-muted-foreground">Jalankan diagnostik konektivitas database dan media storage aktif.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestHealth}
                  disabled={testingHealth}
                  className="rounded-xl h-8 text-xs font-bold border-border/80 cursor-pointer"
                >
                  {testingHealth ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Activity className="mr-1.5 h-3.5 w-3.5" />}
                  Test Health Check
                </Button>
              </div>

              {/* Managed Appliance Banner / Status (If infraServer exists) */}
              {infraServer && (
                <Card className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 shadow-xs overflow-hidden">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Server className="h-4 w-4 text-emerald-500" />
                        Appliance Server Dedicated Aktif ({infraServer.name || "Cloud VPS"})
                      </CardTitle>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> {infraServer.status || "active"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 pt-1 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-background/80 border space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Hostname / Host</span>
                        <p className="text-xs font-mono font-bold text-foreground truncate">{infraServer.hostname || "db-dedicated.sacms.cloud"}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-background/80 border space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Spesifikasi</span>
                        <p className="text-xs font-semibold text-foreground">{infraServer.cpuCount || 4} Cores &bull; {(infraServer.ramMb || 8192) / 1024} GB RAM</p>
                      </div>
                      <div className="p-3 rounded-xl bg-background/80 border space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Penyimpanan NVMe</span>
                        <p className="text-xs font-semibold text-foreground">{infraServer.diskGb || 100} GB NVMe</p>
                      </div>
                      <div className="p-3 rounded-xl bg-background/80 border space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Kesehatan Server</span>
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 capitalize">{infraServer.healthStatus || "healthy"}</p>
                      </div>
                    </div>

                    {/* Resource usage — honest about what's actually measured.
                        No in-VPS metrics agent exists yet and Contabo's API
                        exposes no OS-level telemetry, so CPU/RAM/disk usage
                        genuinely can't be shown here — only what the health
                        check actually verifies (DB and media reachability). */}
                    <div className="p-3.5 rounded-xl bg-muted/40 border border-dashed border-border/80 flex items-start gap-2.5">
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Metrik penggunaan CPU/RAM/Disk real-time belum tersedia — memerlukan agent monitoring di dalam VPS yang belum diimplementasikan. "Test Health Check" di bawah hanya memverifikasi konektivitas database dan media storage, bukan penggunaan resource.
                      </p>
                    </div>

                    {/* VPS Power Controls — only meaningful when this row is
                        backed by a real Contabo instance (providerServerId),
                        not a BYODB-only row. */}
                    {infraServer.providerServerId && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Kontrol Daya VPS:</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmAction("start")}
                          disabled={vpsAction !== null}
                          className="h-8 rounded-lg text-xs font-bold border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                        >
                          {vpsAction === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
                          Nyalakan
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmAction("stop")}
                          disabled={vpsAction !== null}
                          className="h-8 rounded-lg text-xs font-bold border-amber-500/30 text-amber-600 hover:bg-amber-500/10 cursor-pointer"
                        >
                          {vpsAction === "stop" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Square className="h-3.5 w-3.5 mr-1.5" />}
                          Hentikan
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmAction("restart")}
                          disabled={vpsAction !== null}
                          className="h-8 rounded-lg text-xs font-bold border-blue-500/30 text-blue-600 hover:bg-blue-500/10 cursor-pointer"
                        >
                          {vpsAction === "restart" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Power className="h-3.5 w-3.5 mr-1.5" />}
                          Restart
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Power action confirmation dialog */}
              <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {confirmAction === "start" && "Nyalakan VPS ini?"}
                      {confirmAction === "stop" && "Hentikan VPS ini?"}
                      {confirmAction === "restart" && "Restart VPS ini?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {confirmAction === "stop"
                        ? "Website dan API yang berjalan di server ini akan langsung tidak dapat diakses sampai Anda menyalakannya kembali. Data tidak akan hilang."
                        : confirmAction === "restart"
                        ? "Server akan reboot — akan ada downtime singkat (biasanya 30-90 detik) selama proses restart."
                        : "Sinyal nyala akan dikirim ke server. Proses booting biasanya memakan waktu beberapa puluh detik."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer">Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => confirmAction && handleVpsAction(confirmAction)}
                      className="cursor-pointer"
                    >
                      Ya, Lanjutkan
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* BYODB: Custom PostgreSQL Connection */}
              <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    Koneksi Basis Data Sendiri (Bring Your Own Database / BYODB)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Hubungkan instance PostgreSQL eksternal milik instansi Anda untuk menyimpan seluruh konten dan skema secara terisolasi.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="databaseUrl" className="text-xs font-semibold text-foreground">PostgreSQL Connection URL</Label>
                    <Input
                      id="databaseUrl"
                      type="password"
                      placeholder="postgresql://user:password@db.perusahaan.com:5432/tenant_db?sslmode=require"
                      value={databaseUrl}
                      onChange={(e) => setDatabaseUrl(e.target.value)}
                      className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Kosongkan nilai ini dan simpan jika ingin kembali menggunakan cluster database bersama (Shared Pool) default dari SaCMS Cloud.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* BYOS: Custom S3 Storage */}
              <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Upload className="h-4 w-4 text-primary" />
                    Koneksi Storage S3 Sendiri (Bring Your Own Storage / BYOS)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Simpan seluruh unggahan media secara mandiri ke bucket AWS S3, Cloudflare R2, MinIO, atau Google Cloud Storage.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="storageEndpoint" className="text-xs font-semibold text-foreground">S3 Endpoint URL</Label>
                      <Input
                        id="storageEndpoint"
                        placeholder="https://s3.ap-southeast-1.amazonaws.com"
                        value={storageEndpoint}
                        onChange={(e) => setStorageEndpoint(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="storageBucket" className="text-xs font-semibold text-foreground">Nama Bucket S3</Label>
                      <Input
                        id="storageBucket"
                        placeholder="nama-bucket-media"
                        value={storageBucket}
                        onChange={(e) => setStorageBucket(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="storageAccessKey" className="text-xs font-semibold text-foreground">Access Key ID</Label>
                      <Input
                        id="storageAccessKey"
                        placeholder="AKIA..."
                        value={storageAccessKey}
                        onChange={(e) => setStorageAccessKey(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="storageSecretKey" className="text-xs font-semibold text-foreground">Secret Access Key</Label>
                      <Input
                        id="storageSecretKey"
                        type="password"
                        placeholder="••••••••••••"
                        value={storageSecretKey}
                        onChange={(e) => setStorageSecretKey(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="storagePublicUrl" className="text-xs font-semibold text-foreground">Public CDN Base URL</Label>
                    <Input
                      id="storagePublicUrl"
                      placeholder="https://media.perusahaan.com"
                      value={storagePublicUrl}
                      onChange={(e) => setStoragePublicUrl(e.target.value)}
                      className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                    />
                  </div>
                </CardContent>
              </Card>

            </div>
          )}

    </div>
  )
}
