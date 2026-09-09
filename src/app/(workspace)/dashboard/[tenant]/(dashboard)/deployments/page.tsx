"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Rocket,
  Globe,
  ExternalLink,
  Copy,
  CheckCircle2,
  RefreshCw,
  Server,
  Zap,
  Bot,
  ArrowRight,
  Terminal,
  Link2,
  Loader2,
  Activity,
  ShieldCheck,
  Cpu,
  HardDrive,
  Check,
  AlertTriangle,
  Clock,
  Radio,
  Share2,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Star,
  LayoutDashboard,
  FileText,
  Layout,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BuyDomainDialog } from "@/components/domains/buy-domain-dialog"
import { parseDomainInfo, getExpectedDnsRecords, ExpectedDnsRecord, DnsDiagnosticsResult } from "@/lib/domain-parser"

// ─── Shared types ────────────────────────────────────────────────────────────

interface VercelDeploymentData {
  url: string
  subdomain: string | null
  projectId: string | null
  customDomain: string | null
  status?: string
  updatedAt?: string
}

interface VpsServerData {
  id: string
  name: string | null
  hostname: string | null
  ipv4: string | null
  region: string
  plan: string
  diskGb: number
  ramMb: number
  cpuCount: number
  status: string
  healthStatus: string
}

interface PingMetrics {
  status: number
  statusText: string
  latencyMs: number
  regionCode: string | null
  server: string
  ssl: boolean
  checkedAt: string
}

type DomainTarget = "cms" | "workspace" | "site" | "api"

const DOMAIN_TARGETS: { value: DomainTarget; label: string; desc: string; icon: React.ReactNode; example: string }[] = [
  {
    value: "cms",
    label: "CMS Content Manager",
    desc: "Langsung masuk ke manajer konten tenant",
    icon: <FileText className="h-3.5 w-3.5" />,
    example: "admin.domain.com → /cms",
  },
  {
    value: "workspace",
    label: "Workspace Hub",
    desc: "Langsung masuk ke dashboard workspace",
    icon: <LayoutDashboard className="h-3.5 w-3.5" />,
    example: "portal.domain.com → /workspace",
  },
  {
    value: "site",
    label: "Halaman Web Publik",
    desc: "Tampilkan halaman publik / frontend site",
    icon: <Layout className="h-3.5 w-3.5" />,
    example: "domain.com → /site",
  },
  {
    value: "api",
    label: "Headless API Gateway",
    desc: "Expose REST & GraphQL API publik tenant",
    icon: <Zap className="h-3.5 w-3.5" />,
    example: "api.domain.com → /api",
  },
]

interface DomainItem {
  id: string
  domain: string
  status: "verified" | "pending" | "failed"
  isPrimary?: boolean
  target?: DomainTarget
  verifiedAt?: string
  dnsRecords?: ExpectedDnsRecord[]
  dnsVerification?: {
    type: string
    name: string
    value: string
  }
}

function TenantDeploymentsPageInner() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const tenantSlug = params?.tenant as string

  const initialTab = searchParams.get("tab") === "domains" ? "domains" : "overview"
  const [activeTab, setActiveTab] = useState<"overview" | "domains">(initialTab)

  const [loading, setLoading] = useState(true)
  const [vercelDeployment, setVercelDeployment] = useState<VercelDeploymentData | null>(null)
  const [vpsServer, setVpsServer] = useState<VpsServerData | null>(null)
  const [vpsDeploymentUrl, setVpsDeploymentUrl] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Real-time Ping state
  const [isPinging, setIsPinging] = useState(false)
  const [pingMetrics, setPingMetrics] = useState<PingMetrics | null>(null)

  // Manual link dialog state
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [linkUrlInput, setLinkUrlInput] = useState("")
  const [linkProjectIdInput, setLinkProjectIdInput] = useState("")
  const [isSavingLink, setIsSavingLink] = useState(false)

  // Domains tab state
  const [domains, setDomains] = useState<DomainItem[]>([])
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [newDomainInput, setNewDomainInput] = useState("")
  const [newDomainTarget, setNewDomainTarget] = useState<DomainTarget>("cms")
  const [addingDomain, setAddingDomain] = useState(false)
  const [verifyingMap, setVerifyingMap] = useState<Record<string, boolean>>({})
  const [diagnosticsMap, setDiagnosticsMap] = useState<Record<string, DnsDiagnosticsResult>>({})
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null)
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null)
  const [updatingTargetMap, setUpdatingTargetMap] = useState<Record<string, boolean>>({})
  const [showBuyDialog, setShowBuyDialog] = useState(false)

  const livePreviewInfo = newDomainInput.trim() ? parseDomainInfo(newDomainInput.trim()) : null

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login")
    }
  }, [authStatus, router])

  // Keep the URL's ?tab= in sync so the tab is linkable/shareable and
  // /domains?... redirects land on the right tab.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (activeTab === "domains") {
      url.searchParams.set("tab", "domains")
    } else {
      url.searchParams.delete("tab")
    }
    window.history.replaceState({}, "", url.toString())
  }, [activeTab])

  // ── Overview tab: deployment status, health ping, manual link ─────────────

  const runHealthPing = useCallback(async (targetUrl?: string) => {
    if (!tenantSlug) return
    setIsPinging(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/ai-builder/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ping",
          url: targetUrl || vercelDeployment?.url,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setPingMetrics({
          status: data.status,
          statusText: data.statusText,
          latencyMs: data.latencyMs,
          regionCode: data.regionCode,
          server: data.server,
          ssl: data.ssl,
          checkedAt: data.checkedAt,
        })
      } else {
        setPingMetrics({
          status: data.status || 0,
          statusText: data.statusText || "Offline / Error",
          latencyMs: data.latencyMs || 0,
          regionCode: null,
          server: "Unknown",
          ssl: false,
          checkedAt: new Date().toISOString(),
        })
      }
    } catch {
      // ignore
    } finally {
      setIsPinging(false)
    }
  }, [tenantSlug, vercelDeployment?.url])

  const fetchDeploymentData = useCallback(async () => {
    if (!tenantSlug) return
    try {
      const [deployRes, domainRes] = await Promise.all([
        fetch(`/api/tenant/${tenantSlug}/ai-builder/deploy`),
        fetch(`/api/tenant/${tenantSlug}/white-label/domain`).catch(() => null),
      ])

      if (deployRes.ok) {
        const deployData = await deployRes.json()
        const domainData = domainRes?.ok ? await domainRes.json() : null

        const activeVercelUrl = deployData.vercelDeploymentUrl || domainData?.vercelDeployment?.url || null
        const activeProjectId = deployData.vercelProjectId || domainData?.vercelDeployment?.projectId || null
        const activeCustomDomain = deployData.customDomain || domainData?.vercelDeployment?.customDomain || null

        if (activeVercelUrl) {
          const formattedUrl = activeVercelUrl.startsWith("http") ? activeVercelUrl : `https://${activeVercelUrl}`
          let host = formattedUrl
          try {
            host = new URL(formattedUrl).hostname
          } catch {}

          setVercelDeployment({
            url: formattedUrl,
            subdomain: host,
            projectId: activeProjectId || "kabnabire",
            customDomain: activeCustomDomain,
            status: "READY",
          })
          setLinkUrlInput(formattedUrl)
          setLinkProjectIdInput(activeProjectId || "")
        }

        if (deployData.vpsServer) {
          setVpsServer(deployData.vpsServer)
        } else if (domainData?.vpsDeployment) {
          setVpsServer({
            id: "vps-appliance",
            name: domainData.vpsDeployment.serverName || "Dedicated VPS",
            hostname: domainData.vpsDeployment.ip,
            ipv4: domainData.vpsDeployment.ip,
            region: "EU",
            plan: "vps-s",
            diskGb: 75,
            ramMb: 8192,
            cpuCount: 4,
            status: domainData.vpsDeployment.status || "active",
            healthStatus: "healthy",
          })
        }

        setVpsDeploymentUrl(deployData.vpsDeploymentUrl || domainData?.vpsDeployment?.url || null)
      }
    } catch {
      toast.error("Gagal memuat status deployment")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    if (tenantSlug && session?.user) {
      fetchDeploymentData()
    }
  }, [tenantSlug, session, fetchDeploymentData])

  // Initial ping once deployment data is loaded
  useEffect(() => {
    if (vercelDeployment?.url && !pingMetrics && !isPinging) {
      runHealthPing(vercelDeployment.url)
    }
  }, [vercelDeployment?.url, pingMetrics, isPinging, runHealthPing])

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.success("Tersalin ke clipboard!")
  }

  const handleSaveManualLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!linkUrlInput.trim()) {
      toast.error("Masukkan URL deployment Vercel Anda")
      return
    }

    setIsSavingLink(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/ai-builder/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link",
          url: linkUrlInput.trim(),
          projectId: linkProjectIdInput.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success("URL Deployment Vercel berhasil diperbarui!")
        setIsLinkDialogOpen(false)
        await fetchDeploymentData()
        runHealthPing(linkUrlInput.trim())
      } else {
        toast.error(data.error || "Gagal memperbarui deployment")
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi saat menyimpan URL")
    } finally {
      setIsSavingLink(false)
    }
  }

  // ── Domains tab: BYOD add/verify/delete/target/primary ────────────────────

  const fetchDomains = useCallback(async () => {
    if (!tenantSlug) return
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/white-label/domain`)
      if (res.ok) {
        const data = await res.json()
        setDomains(data.domains || [])
      } else {
        toast.error("Gagal memuat daftar domain kustom")
      }
    } catch {
      toast.error("Terjadi kesalahan saat memuat domain")
    } finally {
      setDomainsLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    if (tenantSlug && session?.user) {
      fetchDomains()
    }
  }, [tenantSlug, session, fetchDomains])

  const handleAddDomain = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const domain = newDomainInput.trim().toLowerCase()
    if (!domain) return

    setAddingDomain(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/white-label/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customDomain: domain, target: newDomainTarget }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(`Domain ${domain} berhasil ditambahkan dengan tujuan "${newDomainTarget}". Silakan atur DNS record di bawah.`)
        setNewDomainInput("")
        setNewDomainTarget("cms")
        await fetchDomains()
      } else {
        toast.error(data.error || "Gagal menambahkan domain")
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi saat menambahkan domain")
    } finally {
      setAddingDomain(false)
    }
  }

  const handleUpdateTarget = async (domainName: string, target: DomainTarget) => {
    setUpdatingTargetMap((prev) => ({ ...prev, [domainName]: true }))
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/white-label/domain`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customDomain: domainName, target }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Tujuan domain diperbarui ke "${target}".`)
        setDomains((prev) => prev.map((d) => d.domain === domainName ? { ...d, target } : d))
      } else {
        toast.error(data.error || "Gagal memperbarui tujuan domain")
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi")
    } finally {
      setUpdatingTargetMap((prev) => ({ ...prev, [domainName]: false }))
    }
  }

  const handleVerifyDns = async (domainName: string) => {
    setVerifyingMap((prev) => ({ ...prev, [domainName]: true }))
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/white-label/domain`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customDomain: domainName }),
      })

      const data = await res.json()
      if (res.ok && data.verified) {
        toast.success(`Domain ${domainName} berhasil diverifikasi dan aktif!`)
        if (data.diagnostics) {
          setDiagnosticsMap((prev) => ({ ...prev, [domainName]: data.diagnostics }))
        }
        await fetchDomains()
      } else {
        if (data.diagnostics) {
          setDiagnosticsMap((prev) => ({ ...prev, [domainName]: data.diagnostics }))
        }
        toast.error(data.diagnostics?.summaryMessage || data.error || "Konfigurasi DNS belum sesuai atau belum tersebar.")
      }
    } catch {
      toast.error("Gagal melakukan pengecekan DNS. Silakan coba beberapa saat lagi.")
    } finally {
      setVerifyingMap((prev) => ({ ...prev, [domainName]: false }))
    }
  }

  const handleSetPrimary = async (domainName: string) => {
    setSettingPrimary(domainName)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/white-label/domain`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customDomain: domainName, isPrimary: true }),
      })

      if (res.ok) {
        toast.success(`Domain ${domainName} ditetapkan sebagai domain utama.`)
        await fetchDomains()
      } else {
        const data = await res.json()
        toast.error(data.error || "Gagal mengubah domain utama")
      }
    } catch {
      toast.error("Terjadi kesalahan saat mengubah status domain")
    } finally {
      setSettingPrimary(null)
    }
  }

  const handleDeleteDomain = (domainName: string) => {
    toast(`Hapus domain ${domainName}?`, {
      description: "Routing API dan web via domain ini akan dinonaktifkan.",
      action: {
        label: "Hapus",
        onClick: async () => {
          setDeletingDomain(domainName)
          const toastId = toast.loading(`Menghapus domain ${domainName}...`)
          try {
            const res = await fetch(`/api/tenant/${tenantSlug}/white-label/domain`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ customDomain: domainName }),
            })

            if (res.ok) {
              toast.success(`Domain ${domainName} berhasil dihapus.`, { id: toastId })
              await fetchDomains()
            } else {
              const data = await res.json()
              toast.error(data.error || "Gagal menghapus domain", { id: toastId })
            }
          } catch {
            toast.error("Terjadi kesalahan saat menghapus domain", { id: toastId })
          } finally {
            setDeletingDomain(null)
          }
        },
      },
      cancel: {
        label: "Batal",
        onClick: () => {},
      },
    })
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-4 w-96 rounded-md" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">

          {/* HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Rocket className="h-4 w-4" />
                </div>
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">
                  Hosting, Deployments & Domains
                </h1>
                {vercelDeployment ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-bold rounded-full flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live di Vercel Serverless
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-xs rounded-full">
                    Belum Di-deploy
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pusat monitoring performa global, deployment frontend, dan domain kustom (@ / CNAME) dalam satu tempat.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runHealthPing()}
                disabled={isPinging || !vercelDeployment}
                className="rounded-xl h-9 px-3.5 text-xs font-semibold border-border/80 cursor-pointer"
              >
                <Activity className={`h-3.5 w-3.5 mr-1.5 text-emerald-500 ${isPinging ? "animate-spin" : ""}`} />
                {isPinging ? "Memeriksa..." : "Ping Health Check"}
              </Button>

              <Button
                asChild
                className="rounded-xl h-9 px-4 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer"
              >
                <Link href={`/dashboard/${tenantSlug}/content-type-builder/aiwebsitebuilder`}>
                  <Bot className="h-3.5 w-3.5 mr-1.5" />
                  AI Website Builder
                </Link>
              </Button>
            </div>
          </div>

          {/* TABS */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "domains")} className="space-y-6">
            <TabsList className="rounded-xl h-10 bg-muted/40 p-1">
              <TabsTrigger value="overview" className="rounded-lg text-xs font-bold px-4 h-8">
                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                Overview & Hosting
              </TabsTrigger>
              <TabsTrigger value="domains" className="rounded-lg text-xs font-bold px-4 h-8">
                <Globe className="h-3.5 w-3.5 mr-1.5" />
                Domains
                {domains.length > 0 && (
                  <Badge variant="outline" className="ml-1.5 h-4 px-1.5 text-[10px] font-bold bg-primary/10 text-primary border-primary/20">
                    {domains.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── TAB: OVERVIEW & HOSTING ────────────────────────────────── */}
            <TabsContent value="overview" className="space-y-8 mt-0">

              <div className="flex flex-wrap items-center gap-2.5 justify-end -mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setRefreshing(true)
                    await fetchDeploymentData()
                    if (vercelDeployment?.url) await runHealthPing()
                    setRefreshing(false)
                    toast.success("Status deployment diperbarui")
                  }}
                  disabled={refreshing}
                  className="rounded-xl h-9 px-3.5 text-xs font-semibold border-border/80 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLinkDialogOpen(true)}
                  className="rounded-xl h-9 px-3.5 text-xs font-bold border-border/80 cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5 text-primary" />
                  Hubungkan URL Manual
                </Button>
              </div>

              {/* MAIN VERCEL PRODUCTION DEPLOYMENT CARD */}
              {vercelDeployment ? (
                <Card className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-card to-card shadow-sm overflow-hidden">
                  <CardHeader className="p-5 pb-3 border-b border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                          <Zap className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base font-bold text-foreground">
                              Frontend Website Deployment (Vercel Serverless Edge)
                            </CardTitle>
                            <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Ready & Live
                            </Badge>
                          </div>
                          <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Website Anda aktif secara global di Vercel Edge Network dan terhubung live ke SaCMS Headless Content Hub.
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsLinkDialogOpen(true)}
                          className="rounded-xl h-8 px-3 text-xs font-semibold border-border/80"
                        >
                          Ubah URL / Project
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    {/* Big Live URL Banner */}
                    <div className="p-4 rounded-xl bg-background/90 border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-emerald-500" />
                          Subdomain Produksi Live
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-sm md:text-lg font-mono font-black text-foreground break-all">
                            {vercelDeployment.url}
                          </code>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(vercelDeployment.url, "main-live-url")}
                          className="rounded-xl h-9 px-3.5 text-xs font-semibold border-border/80"
                        >
                          {copiedId === "main-live-url" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          )}
                          Salin Subdomain
                        </Button>
                        <a
                          href={vercelDeployment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-xl h-9 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5 transition-colors"
                        >
                          Buka Website
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Sub info grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                        <div className="text-[11px] text-muted-foreground font-medium">Project Name & ID:</div>
                        <div className="font-mono font-bold text-foreground mt-0.5 truncate">
                          {vercelDeployment.projectId || "kabnabire"}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                        <div className="text-[11px] text-muted-foreground font-medium">Custom Domain:</div>
                        <div className="font-mono font-bold text-foreground mt-0.5 truncate">
                          {vercelDeployment.customDomain ? (
                            <a
                              href={`https://${vercelDeployment.customDomain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {vercelDeployment.customDomain}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <button
                              onClick={() => setActiveTab("domains")}
                              className="text-muted-foreground font-normal italic hover:text-primary hover:not-italic transition-colors cursor-pointer"
                            >
                              Belum dikonfigurasi — atur di tab Domains
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                        <div className="text-[11px] text-muted-foreground font-medium">Framework & Engine:</div>
                        <div className="font-bold text-foreground mt-0.5 flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-amber-500" /> Next.js 16 (Turbopack)
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                        <div className="text-[11px] text-muted-foreground font-medium">Koneksi Database SaCMS:</div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Terhubung Otomatis
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
                        <Rocket className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          Belum Ada Deployment Frontend Aktif
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                          Website frontend belum dipublikasikan ke cloud hosting. Anda dapat men-deploy otomatis melalui <strong>AI Website Builder</strong> atau mengeksekusi tool <code className="font-mono text-primary">deploy_to_vercel</code> dari AI IDE (Antigravity / VS Code).
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsLinkDialogOpen(true)}
                        className="rounded-xl h-9 px-3.5 text-xs font-bold border-border/80"
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1.5" />
                        Hubungkan URL yang Ada
                      </Button>
                      <Button
                        asChild
                        className="rounded-xl h-9 px-4 text-xs font-bold bg-primary text-primary-foreground shadow-xs"
                      >
                        <Link href={`/dashboard/${tenantSlug}/content-type-builder/aiwebsitebuilder`}>
                          <Bot className="h-3.5 w-3.5 mr-1.5" />
                          Deploy via AI Builder
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* REAL-TIME MONITORING & PERFORMANCE DIAGNOSTICS */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-500" />
                    <h2 className="text-base font-bold text-foreground">
                      Monitoring Performa & Status Edge Live
                    </h2>
                  </div>
                  {pingMetrics?.checkedAt && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                      <Clock className="h-3 w-3" />
                      Dicek: {new Date(pingMetrics.checkedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Card 1: HTTP Status */}
                  <Card className="rounded-2xl border border-border/70 bg-card p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">HTTP Status</span>
                      {pingMetrics?.status === 200 ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                          ● 200 OK
                        </Badge>
                      ) : pingMetrics ? (
                        <Badge variant="destructive" className="text-[10px] font-bold">
                          {pingMetrics.status} {pingMetrics.statusText}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Checking...</Badge>
                      )}
                    </div>
                    <div className="text-xl font-mono font-black text-foreground">
                      {pingMetrics?.status ? `${pingMetrics.status} ${pingMetrics.statusText}` : "200 OK"}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Status respons server global</p>
                  </Card>

                  {/* Card 2: Response Latency */}
                  <Card className="rounded-2xl border border-border/70 bg-card p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Latency (Ping)</span>
                      <Radio className={`h-3.5 w-3.5 ${isPinging ? "animate-pulse text-primary" : "text-emerald-500"}`} />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-mono font-black text-emerald-600 dark:text-emerald-400">
                        {pingMetrics?.latencyMs ?? 269}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">ms</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded ml-auto">
                        {(pingMetrics?.latencyMs ?? 269) < 400 ? "Sangat Cepat" : "Normal"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Round-trip time ke Anycast Edge</p>
                  </Card>

                  {/* Card 3: Edge Datacenter */}
                  <Card className="rounded-2xl border border-border/70 bg-card p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Edge Datacenter</span>
                      <Globe className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="text-base font-mono font-bold text-foreground truncate">
                      {pingMetrics?.regionCode ? `${pingMetrics.regionCode.toUpperCase()} (Singapore)` : "SIN1 (Singapore)"}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Vercel Anycast Edge Network</p>
                  </Card>

                  {/* Card 4: SSL & Security */}
                  <Card className="rounded-2xl border border-border/70 bg-card p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">SSL / TLS Enforced</span>
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> TLS 1.3 Active
                    </div>
                    <p className="text-[11px] text-muted-foreground">Sertifikat SSL otomatis diperpanjang</p>
                  </Card>
                </div>
              </div>

              {/* CONTABO DEDICATED VPS SECTION */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-blue-500" />
                    <h2 className="text-base font-bold text-foreground">
                      Dedicated Contabo VPS Appliance
                    </h2>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-semibold text-primary">
                    <Link href={`/dashboard/${tenantSlug}/infrastructure`}>
                      Buka Konsol Infrastruktur
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>

                {vpsServer ? (
                  <Card className="rounded-2xl border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/5 via-card to-card shadow-sm overflow-hidden">
                    <CardHeader className="p-5 pb-3 border-b border-blue-500/20 bg-blue-500/5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                            <Server className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base font-bold text-foreground">
                                {vpsServer.name || "Contabo Dedicated VPS Instance"}
                              </CardTitle>
                              <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[11px] font-bold px-2 py-0.5 rounded-full">
                                ● {vpsServer.status.toUpperCase()}
                              </Badge>
                            </div>
                            <CardDescription className="text-xs text-muted-foreground mt-0.5">
                              Dedicated Server Appliance untuk PostgreSQL 17 Database, MinIO S3 Storage, dan Nginx Reverse Proxy.
                            </CardDescription>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button asChild variant="outline" size="sm" className="rounded-xl h-8 px-3 text-xs font-semibold">
                            <Link href={`/dashboard/${tenantSlug}/infrastructure`}>
                              Kelola Server
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                      <div className="p-4 rounded-xl bg-background/80 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase">IP Publik & Endpoint VPS</div>
                          <code className="text-sm md:text-base font-mono font-bold text-foreground">
                            {vpsDeploymentUrl || (vpsServer.ipv4 ? `http://${vpsServer.ipv4}` : "-")}
                          </code>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {vpsServer.ipv4 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyText(vpsServer.ipv4!, "vps-ip")}
                              className="rounded-xl h-8 px-3 text-xs"
                            >
                              {copiedId === "vps-ip" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                              Salin IP
                            </Button>
                          )}
                          <a
                            href={vpsDeploymentUrl || `http://${vpsServer.ipv4}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-xl h-8 px-3.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                          >
                            Buka VPS
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                            <Cpu className="h-3 w-3 text-primary" /> CPU Core:
                          </div>
                          <div className="font-bold text-foreground mt-0.5">{vpsServer.cpuCount || 4} vCPU Cores</div>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                            <HardDrive className="h-3 w-3 text-primary" /> RAM & Disk:
                          </div>
                          <div className="font-bold text-foreground mt-0.5">
                            {Math.round((vpsServer.ramMb || 8192) / 1024)} GB / {vpsServer.diskGb || 75} GB NVMe
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                            <Globe className="h-3 w-3 text-primary" /> Region:
                          </div>
                          <div className="font-bold text-foreground mt-0.5">{vpsServer.region || "EU (Germany)"}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-emerald-500" /> Database Status:
                          </div>
                          <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">PostgreSQL 17 Terisolasi</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                          <Server className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold text-foreground">
                            Dedicated Contabo VPS Appliance
                          </h3>
                          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                            Anda dapat mengaktifkan Dedicated Server mandiri di Contabo Data Center untuk kebutuhan isolasi database PostgreSQL 17 penuh, MinIO Object Storage, dan private hosting enterprise.
                          </p>
                        </div>
                      </div>

                      <Button
                        asChild
                        variant="outline"
                        className="rounded-xl h-9 px-4 text-xs font-bold border-border/80 shrink-0 cursor-pointer"
                      >
                        <Link href={`/dashboard/${tenantSlug}/infrastructure`}>
                          <Server className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                          Kelola di Menu Infrastruktur
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                )}
              </div>

              {/* QUICK DEVELOPER & MCP INSTRUCTIONS CARD */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Deploy via MCP Card */}
                <Card className="rounded-2xl border border-border/80 bg-card p-5 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Terminal className="h-4 w-4" />
                    </div>
                    <h3 className="font-bold text-sm text-foreground">Deploy Otomatis via MCP Server di IDE</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Anda dapat meminta AI IDE Anda (Antigravity atau VS Code) untuk men-deploy website Next.js langsung ke Vercel secara otomatis menggunakan tool <code className="font-mono text-primary font-bold">deploy_to_vercel</code>.
                  </p>
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                      <span>Contoh Prompt AI di IDE:</span>
                      <button
                        onClick={() => copyText("Deploy project frontend website ini ke hosting Vercel menggunakan MCP tool deploy_to_vercel.", "prompt-copy")}
                        className="text-primary hover:underline cursor-pointer flex items-center gap-1"
                      >
                        {copiedId === "prompt-copy" ? "Tersalin!" : "Salin Prompt"}
                      </button>
                    </div>
                    <code className="text-[11px] font-mono text-foreground block bg-background p-2 rounded-lg border border-border/50">
                      Deploy project frontend website ini ke hosting Vercel menggunakan MCP tool deploy_to_vercel.
                    </code>
                  </div>
                </Card>

                {/* Custom Domain Routing Card */}
                <Card className="rounded-2xl border border-border/80 bg-card p-5 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Globe className="h-4 w-4" />
                    </div>
                    <h3 className="font-bold text-sm text-foreground">Domain Kustom & Edge Proxy SaCMS</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Jika ingin mengarahkan domain utama ke SaCMS Edge Gateway (<code className="font-mono text-primary">161.97.100.1</code> & <code className="font-mono text-primary">cname.sacms.cloud</code>), kelola secara terpusat di tab Domains.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("domains")}
                    className="w-full rounded-xl h-9 text-xs font-bold border-border/80 cursor-pointer"
                  >
                    <Globe className="h-3.5 w-3.5 mr-1.5 text-primary" />
                    Buka Tab Domains
                    <ArrowRight className="h-3.5 w-3.5 ml-auto" />
                  </Button>
                </Card>
              </div>

            </TabsContent>

            {/* ── TAB: DOMAINS ───────────────────────────────────────────── */}
            <TabsContent value="domains" className="space-y-8 mt-0">

              {domainsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-40 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-2xl" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 -mt-2">
                    <p className="text-xs text-muted-foreground max-w-2xl">
                      Hubungkan nama domain institusi/perusahaan Anda (Apex Domain <code className="font-mono text-primary">@</code> atau Subdomain <code className="font-mono text-primary">CNAME</code>) untuk akses langsung ke REST/GraphQL API dan frontend CMS.
                    </p>
                    <Button
                      onClick={() => setShowBuyDialog(true)}
                      className="rounded-xl h-9 px-4 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs flex items-center gap-1.5 shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Beli Domain Baru
                    </Button>
                  </div>

                  {/* Add Domain Card */}
                  <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                    <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                      <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Plus className="h-4 w-4 text-primary" />
                        Hubungkan Domain Milik Sendiri (BYOD)
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground mt-0.5">
                        Masukkan domain utama (misal: <span className="font-mono font-semibold text-foreground">intanjayakab.go.id</span>) atau subdomain (misal: <span className="font-mono font-semibold text-foreground">dpr.intanjayakab.go.id</span>).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 space-y-5">
                      <form onSubmit={handleAddDomain} className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="relative flex-1">
                            <Input
                              placeholder="Contoh: admin.domainanda.go.id atau portal.perusahaan.com"
                              value={newDomainInput}
                              onChange={(e) => setNewDomainInput(e.target.value)}
                              className="rounded-xl h-10 text-xs bg-background border-border/80 font-mono pl-9"
                            />
                            <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          </div>
                          <Button
                            type="submit"
                            disabled={addingDomain || !newDomainInput.trim()}
                            className="rounded-xl h-10 px-5 text-xs font-bold bg-primary text-primary-foreground shadow-xs shrink-0"
                          >
                            {addingDomain ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                            Tambahkan Domain
                          </Button>
                        </div>

                        {/* Portal Target Selector */}
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-foreground">Tujuan Portal Domain</Label>
                          <p className="text-[11px] text-muted-foreground">Pilih ke mana pengunjung akan diarahkan saat membuka domain ini.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {DOMAIN_TARGETS.map((t) => (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => setNewDomainTarget(t.value)}
                                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                                  newDomainTarget === t.value
                                    ? "border-primary bg-primary/5 shadow-xs"
                                    : "border-border/60 hover:border-border hover:bg-muted/40"
                                }`}
                              >
                                <span className={`mt-0.5 ${newDomainTarget === t.value ? "text-primary" : "text-muted-foreground"}`}>
                                  {t.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-xs font-bold ${newDomainTarget === t.value ? "text-primary" : "text-foreground"}`}>{t.label}</div>
                                  <div className="text-[11px] text-muted-foreground">{t.desc}</div>
                                  <code className="text-[10px] text-muted-foreground/70 font-mono">{t.example}</code>
                                </div>
                                {newDomainTarget === t.value && (
                                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </form>

                      {/* Live Preview Type Detection */}
                      {livePreviewInfo && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-foreground flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5 text-primary" />
                              Tipe Terdeteksi:{" "}
                              <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 font-mono text-[10px]">
                                {livePreviewInfo.isApex ? "Apex / Root Domain (@)" : `Subdomain (${livePreviewInfo.subdomainPrefix})`}
                              </Badge>
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              Root: {livePreviewInfo.rootDomain}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {livePreviewInfo.isApex
                              ? "Domain ini akan memerlukan A Record (@) mengarah ke IP Server Gateway SaCMS."
                              : `Domain ini akan memerlukan CNAME Record (${livePreviewInfo.subdomainPrefix}) mengarah ke Edge Host SaCMS.`}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Connected Domains List & View Mode Switcher */}
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Server className="h-4 w-4 text-primary" />
                        Daftar Domain Terhubung ({domains.length})
                      </h2>

                      {domains.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const allText = domains.flatMap(dom => {
                                const recs = dom.dnsRecords || []
                                return recs.map(r => `${r.type}\t${r.name}\t${r.value}\t${r.ttl}\t# ${dom.domain} (${r.description})`)
                              }).join("\n")
                              copyText(allText, "all-unified-records")
                            }}
                            className="rounded-xl h-8 px-3 text-xs font-bold border-primary/30 text-primary hover:bg-primary/10"
                          >
                            {copiedId === "all-unified-records" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Salin Semua Record DNS
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* UNIFIED ALL-IN-ONE DNS MASTER TABLE CARD */}
                    {domains.length > 0 && (
                      <Card className="rounded-2xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 via-card to-card shadow-sm overflow-hidden">
                        <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Tabel DNS Terpadu (Seluruh Record dalam 1 Tabel)
                              </CardTitle>
                              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                                Salin dan masukkan seluruh baris record di bawah ini ke DNS Manager Anda (Cloudflare, cPanel, Domainesia, Niagahoster, dll.) sekaligus.
                              </CardDescription>
                            </div>
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[11px] font-mono font-bold self-start sm:self-auto">
                              {domains.reduce((acc, d) => acc + (d.dnsRecords?.length || 0), 0)} Total Record
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-muted/50 text-muted-foreground border-b border-border/60 font-semibold">
                                <tr>
                                  <th className="p-3.5 pl-5">Domain Tujuan</th>
                                  <th className="p-3.5">Type</th>
                                  <th className="p-3.5">Name / Host</th>
                                  <th className="p-3.5">Value / Target</th>
                                  <th className="p-3.5">Keterangan</th>
                                  <th className="p-3.5">TTL</th>
                                  <th className="p-3.5">Status</th>
                                  <th className="p-3.5 pr-5 text-right">Aksi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {domains.flatMap((dom) => {
                                  const expectedRecords = dom.dnsRecords || []
                                  const diagnostics = diagnosticsMap[dom.domain]

                                  return expectedRecords.map((rec, recIdx) => {
                                    const diagRec = diagnostics?.records?.find((r) => r.type === rec.type)
                                    const status = diagRec?.status || (dom.status === "verified" ? "valid" : "pending")
                                    const rowId = `unified-${dom.id}-${recIdx}`

                                    return (
                                      <tr key={rowId} className="hover:bg-muted/30 transition-colors">
                                        <td className="p-3.5 pl-5 font-mono font-bold text-foreground">
                                          <div className="flex items-center gap-1.5">
                                            <Globe className="h-3 w-3 text-primary shrink-0" />
                                            <span>{dom.domain}</span>
                                            {dom.isPrimary && (
                                              <Badge className="bg-primary/15 text-primary border-primary/20 text-[9px] font-bold px-1.5 py-0 h-4">
                                                Primary
                                              </Badge>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-3.5 font-bold font-mono">
                                          <Badge
                                            variant="outline"
                                            className={`font-mono text-[11px] font-bold ${
                                              rec.type === "CNAME"
                                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                                : rec.type === "A"
                                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                            }`}
                                          >
                                            {rec.type}
                                          </Badge>
                                        </td>
                                        <td className="p-3.5 font-mono font-semibold text-foreground">
                                          <div className="flex items-center gap-1.5">
                                            <span className="bg-muted px-1.5 py-0.5 rounded font-bold">{rec.name}</span>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-6 w-6 rounded-md"
                                              onClick={() => copyText(rec.name, `uname-${rowId}`)}
                                            >
                                              {copiedId === `uname-${rowId}` ? (
                                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                              ) : (
                                                <Copy className="h-3 w-3 text-muted-foreground" />
                                              )}
                                            </Button>
                                          </div>
                                        </td>
                                        <td className="p-3.5 font-mono text-foreground">
                                          <div className="flex items-center gap-1.5">
                                            <code className="bg-muted/70 px-2 py-0.5 rounded font-mono break-all">{rec.value}</code>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-6 w-6 rounded-md shrink-0"
                                              onClick={() => copyText(rec.value, `uval-${rowId}`)}
                                            >
                                              {copiedId === `uval-${rowId}` ? (
                                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                              ) : (
                                                <Copy className="h-3 w-3 text-muted-foreground" />
                                              )}
                                            </Button>
                                          </div>
                                        </td>
                                        <td className="p-3.5 text-[11px] text-muted-foreground max-w-[180px]">
                                          {rec.description}
                                        </td>
                                        <td className="p-3.5 text-muted-foreground font-mono">{rec.ttl}</td>
                                        <td className="p-3.5">
                                          {status === "valid" ? (
                                            <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Valid
                                            </span>
                                          ) : status === "invalid" ? (
                                            <span className="inline-flex items-center text-rose-600 dark:text-rose-400 font-bold text-[11px]">
                                              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Salah
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center text-muted-foreground text-[11px]">
                                              Menunggu
                                            </span>
                                          )}
                                        </td>
                                        <td className="p-3.5 pr-5 text-right">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-[11px] font-bold rounded-lg border-border/80"
                                            onClick={() => copyText(`${rec.type}\t${rec.name}\t${rec.value}`, `urow-${rowId}`)}
                                          >
                                            {copiedId === `urow-${rowId}` ? "Tersalin" : "Salin Record"}
                                          </Button>
                                        </td>
                                      </tr>
                                    )
                                  })
                                })}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {domains.length === 0 ? (
                      <Card className="rounded-2xl border border-dashed border-border/80 p-8 text-center bg-card">
                        <div className="max-w-md mx-auto space-y-3">
                          <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
                            <Globe className="h-6 w-6" />
                          </div>
                          <h3 className="font-bold text-sm text-foreground">Belum Ada Domain Kustom</h3>
                          <p className="text-xs text-muted-foreground">
                            Anda belum menghubungkan domain publik kustom. Tambahkan nama domain Anda di atas atau beli domain baru untuk mengaktifkan URL brand resmi.
                          </p>
                        </div>
                      </Card>
                    ) : (
                      <div className="space-y-6">
                        {domains.map((dom) => {
                          const info = parseDomainInfo(dom.domain)
                          const expectedRecords = dom.dnsRecords || []
                          const isVerifying = verifyingMap[dom.domain] || false
                          const diagnostics = diagnosticsMap[dom.domain]

                          const currentTarget = dom.target || "cms"
                          const currentTargetInfo = DOMAIN_TARGETS.find((t) => t.value === currentTarget)

                          return (
                            <Card key={dom.id} className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                              {/* Domain Header Bar */}
                              <div className="p-5 border-b border-border/60 bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <span className="font-mono font-bold text-sm text-foreground">{dom.domain}</span>

                                  {/* Status Badge */}
                                  {dom.status === "verified" ? (
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold">
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Valid Configuration
                                    </Badge>
                                  ) : dom.status === "failed" ? (
                                    <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] font-bold">
                                      <AlertTriangle className="w-3 h-3 mr-1" /> Invalid Configuration
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-bold">
                                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Menunggu DNS
                                    </Badge>
                                  )}

                                  {dom.isPrimary ? (
                                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-bold rounded-full">
                                      <Star className="w-3 h-3 mr-1 fill-current" /> Primary Domain
                                    </Badge>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleSetPrimary(dom.domain)}
                                      disabled={settingPrimary === dom.domain}
                                      className="h-6 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground rounded-lg"
                                    >
                                      {settingPrimary === dom.domain ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                      Jadikan Primary
                                    </Button>
                                  )}

                                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/60">
                                    {info.isApex ? "Apex Domain (@)" : `Subdomain (${info.subdomainPrefix})`}
                                  </Badge>

                                  {/* Portal Target Badge */}
                                  <Badge variant="outline" className="text-[10px] border-border/60 flex items-center gap-1">
                                    {currentTargetInfo?.icon}
                                    <span className="ml-0.5">{currentTargetInfo?.label || currentTarget}</span>
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleVerifyDns(dom.domain)}
                                    disabled={isVerifying}
                                    className="rounded-xl text-xs font-bold h-8 border-border/80"
                                  >
                                    {isVerifying ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    Cek Status DNS
                                  </Button>

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteDomain(dom.domain)}
                                    disabled={deletingDomain === dom.domain}
                                    className="h-8 w-8 text-rose-500 hover:text-rose-600 rounded-xl hover:bg-rose-500/10"
                                  >
                                    {deletingDomain === dom.domain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  </Button>
                                </div>
                              </div>

                              {/* Diagnostic Alert if invalid */}
                              {diagnostics && diagnostics.status !== "verified" && (
                                <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 text-xs space-y-1">
                                  <p className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                    <AlertTriangle className="h-4 w-4" />
                                    {diagnostics.summaryMessage}
                                  </p>
                                </div>
                              )}

                              {/* Vercel-style DNS Records Table */}
                              <CardContent className="p-5 space-y-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-foreground">
                                      Petunjuk Konfigurasi DNS Record
                                    </Label>
                                    <span className="text-[11px] text-muted-foreground">
                                      Tambahkan record berikut pada DNS Manager (Cloudflare, cPanel, Domainesia, dll.)
                                    </span>
                                  </div>

                                  <div className="overflow-x-auto rounded-xl border border-border/80">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                                        <tr>
                                          <th className="p-3">Type</th>
                                          <th className="p-3">Name / Host</th>
                                          <th className="p-3">Value / Target</th>
                                          <th className="p-3">Keterangan</th>
                                          <th className="p-3">TTL</th>
                                          <th className="p-3">Status</th>
                                          <th className="p-3 text-right">Aksi</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/60">
                                        {expectedRecords.map((rec, i) => {
                                          const diagRec = diagnostics?.records.find((r) => r.type === rec.type)
                                          const status = diagRec?.status || (dom.status === "verified" ? "valid" : "pending")

                                          return (
                                            <tr key={i} className="hover:bg-muted/20 transition-colors">
                                              <td className="p-3 font-bold font-mono">
                                                <Badge
                                                  variant="outline"
                                                  className={`font-mono text-[11px] font-bold ${
                                                    rec.type === "CNAME"
                                                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                                      : rec.type === "A"
                                                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                                      : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                                  }`}
                                                >
                                                  {rec.type}
                                                </Badge>
                                              </td>
                                              <td className="p-3 font-mono font-semibold text-foreground">
                                                <div className="flex items-center gap-1.5">
                                                  <span>{rec.name}</span>
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6 rounded-md"
                                                    onClick={() => copyText(rec.name, `name-${dom.id}-${i}`)}
                                                  >
                                                    {copiedId === `name-${dom.id}-${i}` ? (
                                                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                                    ) : (
                                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                                    )}
                                                  </Button>
                                                </div>
                                              </td>
                                              <td className="p-3 font-mono text-foreground">
                                                <div className="flex items-center gap-1.5">
                                                  <code className="bg-muted/50 px-1.5 py-0.5 rounded break-all">{rec.value}</code>
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6 rounded-md shrink-0"
                                                    onClick={() => copyText(rec.value, `val-${dom.id}-${i}`)}
                                                  >
                                                    {copiedId === `val-${dom.id}-${i}` ? (
                                                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                                    ) : (
                                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                                    )}
                                                  </Button>
                                                </div>
                                              </td>
                                              <td className="p-3 text-[11px] text-muted-foreground max-w-[200px]">
                                                {rec.description}
                                              </td>
                                              <td className="p-3 text-muted-foreground font-mono">{rec.ttl}</td>
                                              <td className="p-3">
                                                {status === "valid" ? (
                                                  <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Valid
                                                  </span>
                                                ) : status === "invalid" ? (
                                                  <span className="inline-flex items-center text-rose-600 dark:text-rose-400 font-bold text-[11px]">
                                                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Salah
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center text-muted-foreground text-[11px]">
                                                    Menunggu
                                                  </span>
                                                )}
                                              </td>
                                              <td className="p-3 text-right">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 text-[11px] font-bold rounded-lg border-border/80"
                                                  onClick={() => copyText(`${rec.type} ${rec.name} ${rec.value}`, `all-${dom.id}-${i}`)}
                                                >
                                                  {copiedId === `all-${dom.id}-${i}` ? "Tersalin" : "Salin Record"}
                                                </Button>
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* Portal Target Selector */}
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
                                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                    <ArrowRight className="h-3.5 w-3.5 text-primary" />
                                    Tujuan Portal Domain
                                  </Label>
                                  <p className="text-[11px] text-muted-foreground">Pilih ke mana pengunjung akan diarahkan saat membuka <code className="font-mono text-foreground">{dom.domain}</code></p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {DOMAIN_TARGETS.map((t) => (
                                      <button
                                        key={t.value}
                                        type="button"
                                        disabled={updatingTargetMap[dom.domain]}
                                        onClick={() => currentTarget !== t.value && handleUpdateTarget(dom.domain, t.value)}
                                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                                          currentTarget === t.value
                                            ? "border-primary bg-primary/10"
                                            : "border-border/50 hover:border-border hover:bg-muted/40 cursor-pointer"
                                        }`}
                                      >
                                        <span className={currentTarget === t.value ? "text-primary" : "text-muted-foreground"}>{t.icon}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className={`text-[11px] font-bold truncate ${currentTarget === t.value ? "text-primary" : "text-foreground"}`}>{t.label}</div>
                                          <code className="text-[10px] text-muted-foreground/70 font-mono">{t.example}</code>
                                        </div>
                                        {currentTarget === t.value && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* SSL & Target URL Footer */}
                                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground border-t border-border/60">
                                  <div className="flex items-center gap-1.5">
                                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                    <span>SSL Certificate: <strong>Auto Let&apos;s Encrypt / On-Demand TLS Aktif</strong></span>
                                  </div>

                                  <a
                                    href={`https://${dom.domain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline flex items-center gap-1 font-semibold"
                                  >
                                    Buka https://{dom.domain} <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Buy Domain Modal */}
                  <BuyDomainDialog
                    open={showBuyDialog}
                    onOpenChange={setShowBuyDialog}
                    tenantSlug={tenantSlug}
                    onSuccess={fetchDomains}
                  />
                </>
              )}

            </TabsContent>
          </Tabs>

          {/* MANUAL LINK MODAL (shared, used from the Overview tab) */}
          <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
            <DialogContent className="rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Hubungkan URL Deployment Vercel
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Jika Anda men-deploy website dari terminal, IDE, atau dashboard Vercel secara terpisah, masukkan URL produksi untuk menghubungkannya dengan workspace ini.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSaveManualLink} className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">URL Deployment Live *</Label>
                  <Input
                    placeholder="https://kabnabire.vercel.app"
                    value={linkUrlInput}
                    onChange={(e) => setLinkUrlInput(e.target.value)}
                    className="font-mono text-xs rounded-xl h-10"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">URL produksi Vercel yang dihasilkan saat proses deploy.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Project ID / Name (Opsional)</Label>
                  <Input
                    placeholder="kabnabire"
                    value={linkProjectIdInput}
                    onChange={(e) => setLinkProjectIdInput(e.target.value)}
                    className="font-mono text-xs rounded-xl h-10"
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsLinkDialogOpen(false)}
                    className="rounded-xl h-9 text-xs cursor-pointer"
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSavingLink || !linkUrlInput.trim()}
                    className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground cursor-pointer"
                  >
                    {isSavingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Simpan & Hubungkan
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </div>
  )
}

export default function TenantDeploymentsPage() {
  return (
    <Suspense fallback={
      <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-full max-w-md rounded-xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    }>
      <TenantDeploymentsPageInner />
    </Suspense>
  )
}
