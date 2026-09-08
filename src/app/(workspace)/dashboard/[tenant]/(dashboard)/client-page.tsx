"use client"

import { useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Database, FileText, ImageIcon, Users, Plus, PenTool,
  AlertTriangle, Clock, CheckCircle2, Archive, CalendarClock,
  Eye, Key, Globe, XCircle, ArrowRight, Webhook, Activity,
  Zap, Upload, Play, BookOpen, ClipboardList, TrendingUp,
  ChevronRight, ShieldCheck, Sparkles, Plug
} from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

interface AssignedContentType {
  id: string
  name: string
  slug: string
  description?: string
  fields: Array<{ id: string; name: string; type: string }>
  _count?: { entries: number }
}

interface TenantStats {
  tenant?: {
    id: string
    name: string
    slug: string
  }
  contentTypeCount: number
  singleTypeCount: number
  totalEntries: number
  mediaCount: number
  memberCount: number
  apiTokenCount: number
  webhookCount: number
  entries: {
    draft: number
    in_review: number
    approved: number
    scheduled: number
    published: number
    archived: number
  }
  recentEntries: Array<{
    id: string
    status: string
    contentType: string
    contentTypeSlug: string
    updatedAt: string
  }>
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; icon: React.ElementType }> = {
  draft:     { label: "Draft",      dot: "bg-gray-400",    bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",         icon: FileText },
  in_review: { label: "In Review",  dot: "bg-yellow-500",  bg: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300", icon: Clock },
  approved:  { label: "Approved",   dot: "bg-blue-500",    bg: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",         icon: CheckCircle2 },
  scheduled: { label: "Scheduled",  dot: "bg-purple-500",  bg: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", icon: CalendarClock },
  published: { label: "Published",  dot: "bg-emerald-500", bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: Eye },
  archived:  { label: "Archived",   dot: "bg-orange-500",  bg: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", icon: Archive },
  rejected:  { label: "Rejected",   dot: "bg-red-500",     bg: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",             icon: XCircle },
}

interface AssignedSingleType {
  id: string
  name: string
  slug: string
  description?: string
  fields: Array<{ id: string; name: string; type: string }>
}

interface TenantDashboardClientProps {
  tenantId?: string
  contentTypes: AssignedContentType[]
  singleTypes?: AssignedSingleType[]
  stats: TenantStats
  usage: any[]
  activities?: any[]
  session?: any
}

export default function TenantDashboardClient({
  tenantId: initialTenantId,
  contentTypes: initialContentTypes,
  singleTypes: initialSingleTypes = [],
  stats: initialStats,
  usage: initialUsage,
  session: initialSession,
}: TenantDashboardClientProps) {
  const { data: sessionData } = useSession()
  const session = sessionData || initialSession
  const params = useParams()
  const tenantId = (params?.tenant as string) || initialTenantId

  // These come from the Server Component (page.tsx) — no client-side re-fetch needed.
  const contentTypes = initialContentTypes
  const singleTypes = initialSingleTypes
  const stats = initialStats
  const usage = initialUsage

  // UI-only state: tab toggle between Collections and Single Types
  const [schemaView, setSchemaView] = useState<"collections" | "single_types">("collections")

  const userId = session?.user?.id
  const tenants = useMemo(() => session?.user?.tenants || [], [session?.user?.tenants])
  const currentTenant = useMemo(() => {
    if (stats?.tenant) return stats.tenant
    return tenants.find((t) => t.id === tenantId || t.slug === tenantId)
  }, [tenants, tenantId, stats?.tenant])

  const usageAlerts = useMemo(() => {
    return usage.filter(u => (u.current / u.limit) >= 0.9)
  }, [usage])

  const totalEntries = useMemo(() => {
    if (!stats?.entries) return 0
    return Object.values(stats.entries).reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0)
  }, [stats])

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">
              {currentTenant?.name || tenantId}
            </h1>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Workspace Aktif
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Pusat kendali konten, database skema, dan integrasi frontend workspace <strong>{currentTenant?.name || "Anda"}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button asChild className="h-9 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-all cursor-pointer">
            <Link href={`/dashboard/${tenantId}/content-type-builder/aiwebsitebuilder`}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              AI Website Studio
            </Link>
          </Button>

          <Button variant="outline" asChild className="h-9 px-3 text-xs font-semibold rounded-xl border-border/80 bg-card hover:bg-muted/50 cursor-pointer">
            <Link href={`/dashboard/${tenantId}/cms`}>
              <PenTool className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              CMS Studio
            </Link>
          </Button>

          <Button variant="outline" asChild className="h-9 px-3 text-xs font-semibold rounded-xl border-border/80 bg-card hover:bg-muted/50 cursor-pointer">
            <Link href={`/dashboard/${tenantId}/media`}>
              <Upload className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              Pustaka Media
            </Link>
          </Button>
        </div>
      </div>

      {/* AI Spotlight Hero Card */}
      <Card className="relative overflow-hidden border-border/80 bg-gradient-to-br from-primary/10 via-purple-500/5 to-background rounded-2xl p-5 md:p-6 shadow-xs border">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold">
              <Sparkles className="h-3 w-3" />
              <span>AI Frontend Builder & Vercel Cockpit</span>
            </div>
            <h2 className="text-lg md:text-xl font-black tracking-tight text-foreground">
              Bangun Website Modern Berbasis Prompt
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ketik deskripsi ide website, AI secara otomatis membuat skema koleksi di PostgreSQL, mengisi data via MCP, dan mengompilasi frontend interaktif siap deploy ke Vercel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button asChild className="h-9 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-all cursor-pointer">
              <Link href={`/dashboard/${tenantId}/content-type-builder/aiwebsitebuilder`}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Buka AI Studio
              </Link>
            </Button>
            <Button variant="outline" asChild className="h-9 px-3.5 text-xs font-bold rounded-xl border-border/80 bg-card hover:bg-muted/60 cursor-pointer">
              <Link href={`/dashboard/${tenantId}/developer/docs`}>
                <Zap className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                API Docs
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      {/* Quota Usage Alerts */}
      {usageAlerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3 text-center md:text-left">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs font-bold text-red-700 dark:text-red-400">Batas Kuota Hampir Penuh</p>
              <p className="text-[11px] text-muted-foreground">
                Penggunaan telah melampaui 90% pada kuota {usageAlerts.map(u => u.label).join(", ")}.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl h-8 px-4 cursor-pointer">
            <Link href={`/dashboard/${tenantId}/subscriptions`}>
              Upgrade Paket
            </Link>
          </Button>
        </div>
      )}

      {/* Usage Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(usage && usage.length > 0 ? usage : [
          { label: "Content Entries", current: 0, limit: 100, unit: "entries" },
          { label: "Media Storage", current: 0, limit: 104857600, unit: "bytes" },
          { label: "Team Members", current: 1, limit: 3, unit: "users" }
        ]).map((item) => {
          const percentage = Math.min(100, (item.current / item.limit) * 100)
          const formatValue = (val: number, unit: string) => {
            if (unit === "bytes") {
              const mb = val / (1024 * 1024)
              return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
            }
            return val.toLocaleString('id-ID')
          }

          return (
            <Card key={item.label} className="border border-border/80 bg-card rounded-2xl shadow-xs">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{item.label}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground font-mono">
                    {formatValue(item.current, item.unit)} / {(item.unit === 'bytes' ? item.limit >= 999999 * 1024 * 1024 : item.limit >= 999999) ? "Unlimited" : formatValue(item.limit, item.unit)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
                      percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Alert Queue */}
      {stats?.entries && (stats.entries as any).in_review > 0 && (
        <Link href={`/dashboard/${tenantId}/cms`}>
          <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 transition-colors group">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Persetujuan Diperlukan</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Terdapat {(stats.entries as any).in_review} entri konten yang menunggu persetujuan Anda.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      )}

      {/* Quick Stats KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Aset Media", value: stats?.mediaCount ?? 0, icon: ImageIcon, color: "text-blue-500", bg: "bg-blue-500/10", href: `/dashboard/${tenantId}/media` },
          { label: "Anggota Tim", value: stats?.memberCount ?? 1, icon: Users, color: "text-purple-500", bg: "bg-purple-500/10", href: `/dashboard/${tenantId}/users` },
          { label: "Webhook Aktif", value: stats?.webhookCount ?? 0, icon: Webhook, color: "text-amber-500", bg: "bg-amber-500/10", href: `/dashboard/${tenantId}/developer/webhooks` },
          { label: "API Token", value: stats?.apiTokenCount ?? 0, icon: Key, color: "text-emerald-500", bg: "bg-emerald-500/10", href: `/dashboard/${tenantId}/developer/api-keys` },
        ].map((kpi) => (
          <Link key={kpi.label} href={kpi.href}>
            <Card className="hover:border-primary/40 hover:shadow-md transition-all cursor-pointer border border-border/80 bg-card rounded-2xl shadow-xs group">
              <CardContent className="p-4 flex items-center gap-3.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shrink-0", kpi.bg)}>
                  <kpi.icon className={cn("h-5 w-5", kpi.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground truncate">{kpi.label}</p>
                  <p className="text-xl font-black text-foreground leading-tight mt-0.5">{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Content Pipeline & Schema Explorer */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Pipeline Overview */}
          <Card className="border border-border/80 bg-card rounded-2xl shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Pipeline Konten</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Status alur kerja pada total {totalEntries} entri konten</CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold rounded-full px-2 py-0.5 border-border">
                  Live Status
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-1 space-y-4">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/60">
                {stats?.entries && Object.entries(stats.entries).map(([key, count]) => {
                  const numCount = Number(count) || 0
                  if (numCount === 0 || totalEntries === 0) return null
                  const pct = (numCount / totalEntries) * 100
                  const colors: Record<string, string> = {
                    draft: "bg-slate-400", in_review: "bg-amber-400", approved: "bg-blue-400",
                    scheduled: "bg-purple-400", published: "bg-emerald-500", archived: "bg-orange-400",
                  }
                  return <div key={key} className={cn("h-full transition-all", colors[key])} style={{ width: `${pct}%` }} />
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {stats?.entries && Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const count = (stats.entries as any)?.[key] || 0
                  return (
                    <div key={key} className="flex items-center justify-between p-2.5 rounded-xl border border-border/60 bg-muted/20">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                        <span className="text-xs font-semibold text-muted-foreground">{cfg.label}</span>
                      </div>
                      <span className="text-xs font-black text-foreground">{count}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Schema Explorer: Collections vs Single Types */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-xl border border-border/80">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSchemaView("collections")}
                  className={cn(
                    "h-7 text-xs font-bold px-3 rounded-lg cursor-pointer transition-all",
                    schemaView === "collections" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Database className="h-3.5 w-3.5 mr-1.5" />
                  Koleksi ({contentTypes.length})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSchemaView("single_types")}
                  className={cn(
                    "h-7 text-xs font-bold px-3 rounded-lg cursor-pointer transition-all",
                    schemaView === "single_types" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Single Types ({singleTypes.length})
                </Button>
              </div>

              <Link 
                href={schemaView === "collections" ? `/dashboard/${tenantId}/content-type-builder/content-types` : `/dashboard/${tenantId}/content-type-builder/single-types`} 
                className="text-xs font-semibold text-primary hover:underline"
              >
                Kelola Semua &rarr;
              </Link>
            </div>

            {schemaView === "collections" ? (
              contentTypes.length === 0 ? (
                <Card className="border-dashed border-border/80 rounded-2xl bg-card/60">
                  <CardContent className="py-12 text-center space-y-2">
                    <PenTool className="h-8 w-8 mx-auto text-muted-foreground/30" />
                    <p className="text-xs font-bold text-foreground">Belum ada tipe koleksi yang dibuat</p>
                    <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                      Buat skema tipe konten pertama Anda di Content Studio atau gunakan AI Schema Builder.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {contentTypes.map((ct) => (
                    <Link key={ct.id} href={`/dashboard/${tenantId}/cms/content/${ct.slug}`}>
                      <Card className="hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group bg-card border border-border/80 rounded-2xl shadow-xs">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shrink-0">
                                <Database className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">{ct.name}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{ct._count?.entries ?? 0} entri &middot; {ct.fields?.length ?? 0} field</p>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )
            ) : (
              singleTypes.length === 0 ? (
                <Card className="border-dashed border-border/80 rounded-2xl bg-card/60">
                  <CardContent className="py-12 text-center space-y-2">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground/30" />
                    <p className="text-xs font-bold text-foreground">Belum ada single type</p>
                    <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                      Buat skema Single Type untuk profil perusahaan, beranda, atau konfigurasi umum.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {singleTypes.map((st) => (
                    <Link key={st.id} href={`/dashboard/${tenantId}/cms/single-types/${st.slug}`}>
                      <Card className="hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group bg-card border border-border/80 rounded-2xl shadow-xs">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform shrink-0">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">{st.name}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{st.fields?.length ?? 0} field konfigurasi</p>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right: Activity & Quick Developer Links */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <Card className="border border-border/80 bg-card rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-4 pb-2 border-b border-border/60">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Aktivitas Terakhir</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(!stats?.recentEntries || stats.recentEntries.length === 0) ? (
                <div className="py-10 text-center">
                  <Activity className="h-6 w-6 mx-auto text-muted-foreground/30 mb-1" />
                  <p className="text-xs text-muted-foreground italic">Belum ada aktivitas</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {stats.recentEntries.map((entry) => {
                    const cfg = STATUS_CONFIG[entry.status.toLowerCase()] || STATUS_CONFIG.draft
                    return (
                      <Link key={entry.id} href={`/dashboard/${tenantId}/cms/content/${entry.contentTypeSlug}`}>
                        <div className="flex items-center justify-between p-3 px-4 hover:bg-muted/40 transition-colors">
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate text-foreground">{entry.contentType}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {new Date(entry.updatedAt).toLocaleDateString("id-ID", { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          </div>
                          <Badge className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border-0", cfg.bg)}>
                            {cfg.label}
                          </Badge>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Developer Resources */}
          <Card className="bg-card border border-border/80 rounded-2xl shadow-xs">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary">Akses Integrasi & API</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-1">
              <Link href={`/dashboard/${tenantId}/developer/api`}>
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/60 hover:border-primary/40 transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">API Explorer</p>
                    <p className="text-[10px] text-muted-foreground truncate">Uji REST & GraphQL endpoint</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
              <Link href={`/dashboard/${tenantId}/developer/sdk`}>
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/60 hover:border-primary/40 transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">TypeScript SDK</p>
                    <p className="text-[10px] text-muted-foreground truncate">Dokumentasi client library</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
              <Link href={`/dashboard/${tenantId}/developer/mcp`}>
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/60 hover:border-primary/40 transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Plug className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">MCP Server</p>
                    <p className="text-[10px] text-muted-foreground truncate">Integrasi Model Context Protocol</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Security Note */}
          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/60 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Semua perubahan entri konten dicatat secara otomatis dalam audit log workspace.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
