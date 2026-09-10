"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  Check, Loader2, CreditCard, Clock, Calendar, 
  ArrowUpRight, AlertCircle, Zap, ShieldCheck,
  History, ExternalLink, FileText, BarChart3,
  HardDrive, Users, Database, Package, Shield, Bot, Save, Cloud, Sparkles,
  Server, Layers, Download
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { checkEnterpriseModeAction } from "@/actions/billing"
import { getGlobalWorkspaceIdAction } from "@/actions/tenant"
import { generateInvoicePDF } from "@/lib/pdf-generator"

interface Subscription {
  id: string
  plan: string
  status: string
  currentPeriodEnd: string | null
}

interface Invoice {
  id: string
  amount: number
  status: string
  createdAt: string
  midtransInvoiceId: string | null
  isTransaction?: boolean
  plan?: string
}

export default function TenantSubscriptionsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const tenantSlug = params?.tenant as string
  const { toast } = useToast()

  const [subscription, setSubscription] = useState<Subscription>({ id: '', plan: 'free', status: 'active', currentPeriodEnd: null })
  const [activeAddons, setActiveAddons] = useState<string[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [usage, setUsage] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('year')
  const [planCategory, setPlanCategory] = useState<'all' | 'cloud' | 'vps' | 'vds' | 'storage'>('all')
  const [cancellingSubscription, setCancellingSubscription] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isEnterpriseMode, setIsEnterpriseMode] = useState(false)
  const [globalTenantId, setGlobalTenantId] = useState<string | null>(null)
  
  const [infra, setInfra] = useState({
    databaseUrl: "",
    s3Bucket: "",
    s3Region: "",
    s3AccessKey: "",
    s3SecretKey: "",
  })
  const [savingInfra, setSavingInfra] = useState(false)

  const tenants = useMemo(() => session?.user?.tenants || [], [session?.user?.id])
  const [liveTenants, setLiveTenants] = useState<any[]>([])

  useEffect(() => {
    async function fetchLiveTenants() {
      try {
        setLoadingTenants(true)
        const res = await fetch("/api/tenants")
        if (res.ok) {
          const data = await res.json()
          setLiveTenants(data.tenants || [])
        }
      } catch (error) {
        console.error("Failed to fetch live tenants in subscriptions:", error)
      } finally {
        setLoadingTenants(false)
      }
    }
    if (status === "authenticated" && session?.user) {
      fetchLiveTenants()
    } else if (status === "unauthenticated") {
      setLoadingTenants(false)
    }
  }, [session, status])

  const combinedTenants = useMemo(() => {
    const staticTenants = session?.user?.tenants || []
    const combined = [...staticTenants]
    for (const t of liveTenants) {
      if (!combined.some(x => x.id === t.id)) {
        combined.push(t)
      }
    }
    return combined
  }, [session, liveTenants])

  const currentTenant = useMemo(() => 
    combinedTenants.find(t => t.slug === tenantSlug || t.id === tenantSlug), 
    [combinedTenants, tenantSlug]
  )

  const fetchBillingData = async () => {
    if (!tenantSlug) return
    try {
      const [subRes, invRes, plansRes, usageRes, settingsRes] = await Promise.all([
        fetch(`/api/tenant/${tenantSlug}/subscription/prorate`),
        fetch(`/api/tenant/${tenantSlug}/invoices`),
        fetch(`/api/tenant/${tenantSlug}/subscriptions/plans`),
        fetch(`/api/tenant/${tenantSlug}/billing/usage`),
        fetch(`/api/tenant/${tenantSlug}/settings`)
      ])
      
      if (subRes.ok) {
        const data = await subRes.json()
        // If null, treat as free
        setSubscription(data.subscription || { plan: 'free', status: 'active', currentPeriodEnd: null })
        if (data.activeAddons) {
          setActiveAddons(data.activeAddons)
        }
      }
      if (invRes.ok) {
        const data = await invRes.json()
        setInvoices(data.invoices || [])
      }
      if (plansRes.ok) {
        const data = await plansRes.json()
        setPlans(data.plans || [])
      }
      if (usageRes.ok) {
        const data = await usageRes.json()
        setUsage(data.usage || [])
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json()
        const s = data.settings
        if (s) {
          setInfra({
            databaseUrl: s.databaseUrl || "",
            s3Bucket: s.storageConfig?.bucket || "",
            s3Region: s.storageConfig?.region || "",
            s3AccessKey: s.storageConfig?.accessKeyId || "",
            s3SecretKey: s.storageConfig?.secretAccessKey || "",
          })
        }
      }

      const enterprise = await checkEnterpriseModeAction()
      setIsEnterpriseMode(enterprise)
      
      const globalId = await getGlobalWorkspaceIdAction()
      setGlobalTenantId(globalId)
    } catch (err) {
      console.error("Billing fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!tenantSlug) return
    setCancellingSubscription(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/subscription/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelAtPeriodEnd: true })
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: "Langganan Dibatalkan", description: data.message || "Langganan akan berakhir pada akhir periode penagihan." })
        setShowCancelConfirm(false)
        fetchBillingData()
      } else {
        toast({ variant: 'destructive', title: "Gagal Membatalkan", description: data.error })
      }
    } catch {
      toast({ variant: 'destructive', title: "Terjadi Kesalahan", description: "Gagal membatalkan langganan" })
    } finally {
      setCancellingSubscription(false)
    }
  }

  const handleSaveInfra = async () => {
    if (!tenantSlug) return
    setSavingInfra(true)
    try {
      const storageConfig = {
        bucket: infra.s3Bucket,
        region: infra.s3Region,
        accessKeyId: infra.s3AccessKey,
        secretAccessKey: infra.s3SecretKey
      }
      const res = await fetch(`/api/tenant/${tenantSlug}/infrastructure`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseUrl: infra.databaseUrl,
          storageConfig: storageConfig
        })
      })
      if (res.ok) {
        toast({ title: "Infrastruktur Tersimpan", description: "Pengaturan infrastruktur workspace berhasil diperbarui." })
        router.refresh()
      } else {
        const error = await res.json()
        toast({ variant: "destructive", title: "Gagal Menyimpan", description: error.error || "Gagal menyimpan pengaturan" })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Gagal menyimpan pengaturan infrastruktur." })
    } finally {
      setSavingInfra(false)
    }
  }

  useEffect(() => {
    if (session?.user?.id) fetchBillingData()
  }, [tenantSlug, session?.user?.id])

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  if (status === "loading" || loading || loadingTenants) {
    return (
      <div className="flex flex-1 flex-col w-full">
        <div className="flex-1 bg-background text-foreground flex flex-col w-full">
          <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-8 w-56 rounded-xl" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-72 max-w-full rounded-md" />
              </div>
              <Skeleton className="h-9 w-32 rounded-xl" />
            </div>

            <Card className="border border-border/80 shadow-xs bg-card rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-border/60 pb-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-36 rounded-md" />
                  <Skeleton className="h-3.5 w-60 rounded-md" />
                </div>
                <Skeleton className="h-8 w-28 rounded-lg" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 border border-border/60 rounded-xl space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-20 rounded-md" />
                      <Skeleton className="h-3 w-12 rounded-md" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border border-border/80 shadow-xs bg-card rounded-2xl p-6 space-y-5">
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-28 rounded-md" />
                    <Skeleton className="h-8 w-36 rounded-lg" />
                    <Skeleton className="h-3.5 w-full rounded-md" />
                  </div>
                  <Skeleton className="h-10 w-full rounded-xl" />
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Workspace with no subscription is on 'free' plan
  const currentPlanSlug = subscription?.plan || 'free'
  const currentPlan = plans.find(p => p.id === currentPlanSlug) || plans.find(p => p.id === 'free')

  const mainPlans = plans.filter(p => p.type === "workspace")
  const addonPlans = plans.filter(p => p.type === "addons")

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Langganan & Tagihan</h1>
              <p className="text-xs text-muted-foreground mt-1">Kelola paket langganan workspace dan pantau riwayat pembayaran.</p>
            </div>
            <div className="flex items-center gap-3 bg-card p-2 px-4 rounded-xl border border-border/80 shadow-xs">
              <Package className="h-5 w-5 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-muted-foreground leading-none mb-1">Paket Aktif</span>
                <span className="text-sm font-bold uppercase tracking-tight text-foreground">{subscription?.plan || "Free"}</span>
              </div>
            </div>
          </div>

          {tenantSlug === globalTenantId ? (
            <Card className="border border-border/80 shadow-xs bg-card text-card-foreground overflow-hidden rounded-2xl relative">
              <CardContent className="p-16 relative flex flex-col items-center justify-center text-center">
                <ShieldCheck className="h-16 w-16 text-primary mb-4 opacity-40" />
                <h2 className="text-2xl font-black tracking-tight text-foreground">Akun Sistem Global</h2>
                <p className="text-muted-foreground mt-2 max-w-lg mx-auto text-xs leading-relaxed">Tagihan, paket, dan batas sumber daya tidak berlaku untuk workspace sistem global. Workspace ini memiliki akses platform tak terbatas.</p>
              </CardContent>
            </Card>
          ) : (
            <>
          {/* Current Status Card */}
          <Card className="border border-border/80 shadow-xs bg-card/60 backdrop-blur-xs text-card-foreground overflow-hidden rounded-2xl relative">
            <CardContent className="p-6 relative">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/10 text-primary border border-primary/20 font-bold px-2.5 py-0.5 uppercase tracking-wider text-[10px] rounded-full">
                      Langganan Saat Ini
                    </Badge>
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-black tracking-tight">
                    {currentPlan?.name || (currentPlanSlug === 'free' ? 'Workspace Gratis' : currentPlanSlug)}
                  </h2>
                  <div className="flex flex-wrap gap-5 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      Status: <span className="font-bold uppercase tracking-wider text-primary">{subscription?.status || 'Active'}</span>
                    </div>
                    {subscription?.currentPeriodEnd && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Periode Tagihan: <span className="font-bold text-foreground">{new Date(subscription.currentPeriodEnd).toLocaleDateString('id-ID')}</span>
                      </div>
                    )}
                    {(subscription as any)?.cancelAtPeriodEnd && (
                      <div className="flex items-center gap-1.5 text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="font-bold text-xs">Dibatalkan – aktif hingga akhir periode</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden md:block">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Biaya Tahunan</p>
                    <p className="text-xl font-black text-foreground">{formatPrice((currentPlan?.yearlyPrice !== undefined ? currentPlan?.yearlyPrice : (currentPlan?.price || 0) * 12) * (subscription?.plan === 'free' ? 0 : 1))}</p>
                  </div>
                  {subscription?.status === 'trialing' ? (
                    <Button 
                      variant="default" 
                      className="h-10 px-6 font-bold text-xs rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                      onClick={() => router.push(`/dashboard/${tenantSlug}/subscriptions/checkout?plan=${subscription?.plan || 'starter'}&interval=year`)}
                    >
                      Bayar Sekarang
                    </Button>
                  ) : currentPlanSlug !== 'free' && subscription?.status === 'active' && !(subscription as any)?.cancelAtPeriodEnd ? (
                    <div className="flex gap-2.5">
                      <Button 
                        variant="outline" 
                        className="h-10 px-5 font-bold rounded-xl text-xs border-border shadow-xs"
                        onClick={() => {
                          const el = document.getElementById('billing-history')
                          if (el) el.scrollIntoView({ behavior: 'smooth' })
                        }}
                      >
                        Riwayat Tagihan
                      </Button>
                      {!showCancelConfirm ? (
                        <Button
                          variant="outline"
                          className="h-10 px-5 font-bold rounded-xl text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive shadow-xs"
                          onClick={() => setShowCancelConfirm(true)}
                        >
                          Batalkan
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 border border-destructive/30 rounded-xl px-3 py-1.5 bg-destructive/10">
                          <span className="text-xs font-bold text-destructive">Batalkan paket?</span>
                          <Button
                            size="sm"
                            className="rounded-lg bg-destructive hover:bg-destructive/90 text-white h-7 px-3 font-bold text-xs shadow-none border-none"
                            disabled={cancellingSubscription}
                            onClick={handleCancelSubscription}
                          >
                            {cancellingSubscription ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ya'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg h-7 px-2.5 font-bold text-xs"
                            onClick={() => setShowCancelConfirm(false)}
                          >
                            Batal
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="h-10 px-6 font-bold rounded-xl text-xs border-border shadow-xs"
                      onClick={() => {
                        const el = document.getElementById('billing-history')
                        if (el) el.scrollIntoView({ behavior: 'smooth' })
                      }}
                    >
                      Riwayat Tagihan
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage Limits Section */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Penggunaan Sumber Daya Workspace
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {usage.map((item) => {
                const percentage = Math.min(100, (item.current / item.limit) * 100)
                const isNearingLimit = percentage > 80
                
                const formatValue = (val: number, unit: string) => {
                  if (unit === "bytes") {
                    const gb = val / (1024 * 1024 * 1024)
                    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(val / (1024 * 1024)).toFixed(0)} MB`
                  }
                  return val.toLocaleString()
                }

                return (
                  <Card key={item.label} className="border border-border/70 shadow-xs bg-card rounded-2xl overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          {item.unit === "entries" ? <Database className="h-4 w-4 text-primary" /> : 
                           item.unit === "bytes" ? <HardDrive className="h-4 w-4 text-primary" /> : 
                           item.unit === "tokens" ? <Bot className="h-4 w-4 text-primary" /> :
                           <Users className="h-4 w-4 text-primary" />}
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{item.label}</span>
                        </div>
                        {isNearingLimit && <AlertCircle className="h-3.5 w-3.5 text-amber-500 animate-pulse" />}
                      </div>
                      
                      <div className="space-y-1.5">
                        <div className="flex items-baseline justify-between">
                          <p className="text-xl font-black text-foreground">{formatValue(item.current, item.unit)}</p>
                          <p className="text-[10px] font-semibold text-muted-foreground">Limit: {formatValue(item.limit, item.unit)}</p>
                        </div>
                        <Progress value={percentage} className="h-1.5 bg-muted rounded-full" />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Main Plans Grid */}
          {!isEnterpriseMode && (
            <div className="space-y-6">
              {/* Header Title & Description on Top */}
              <div className="space-y-1">
                <h2 className="text-xl lg:text-2xl font-black tracking-tight text-foreground">Paket Langganan Workspace</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">Pilih paket SaCMS Cloud Ekonomis, SaCMS Dedicated Business VPS, atau SaCMS Gov Enterprise VDS terisolasi penuh.</p>
              </div>
              
              {/* Category Switcher Tabs Below */}
              {(() => {
                const cloudCount = mainPlans.filter((p) => {
                  const slug = (p.id || p.name || '').toLowerCase()
                  return !slug.includes('vps') && !slug.includes('vds') && !slug.includes('storage')
                }).length
                const vpsCount = mainPlans.filter((p) => {
                  const slug = (p.id || p.name || '').toLowerCase()
                  return slug.includes('vps') && !slug.includes('storage') && !slug.includes('vds')
                }).length
                const storageCount = mainPlans.filter((p) => {
                  const slug = (p.id || p.name || '').toLowerCase()
                  return slug.includes('storage')
                }).length
                const vdsCount = mainPlans.filter((p) => {
                  const slug = (p.id || p.name || '').toLowerCase()
                  return slug.includes('vds')
                }).length

                return (
                  <div className="flex flex-wrap items-center p-1.5 bg-muted/40 rounded-2xl border border-border/80 w-fit max-w-full gap-1 shadow-xs">
                    <Button 
                      variant="ghost"
                      size="sm" 
                      className={cn(
                        "rounded-xl px-3.5 font-bold h-8 text-xs border-none transition-all gap-1.5", 
                        planCategory === 'all' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setPlanCategory('all')}
                    >
                      <Layers className="h-3.5 w-3.5" /> Semua ({mainPlans.length})
                    </Button>
                    <Button 
                      variant="ghost"
                      size="sm" 
                      className={cn(
                        "rounded-xl px-3.5 font-bold h-8 text-xs border-none transition-all gap-1.5", 
                        planCategory === 'cloud' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setPlanCategory('cloud')}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-blue-400" /> Cloud SaaS ({cloudCount})
                    </Button>
                    <Button 
                      variant="ghost"
                      size="sm" 
                      className={cn(
                        "rounded-xl px-3.5 font-bold h-8 text-xs border-none transition-all gap-1.5", 
                        planCategory === 'vps' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setPlanCategory('vps')}
                    >
                      <Server className="h-3.5 w-3.5 text-purple-400" /> Cloud VPS ({vpsCount})
                    </Button>
                    <Button 
                      variant="ghost"
                      size="sm" 
                      className={cn(
                        "rounded-xl px-3.5 font-bold h-8 text-xs border-none transition-all gap-1.5", 
                        planCategory === 'storage' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setPlanCategory('storage')}
                    >
                      <Database className="h-3.5 w-3.5 text-emerald-500" /> VPS Storage ({storageCount})
                    </Button>
                    <Button 
                      variant="ghost"
                      size="sm" 
                      className={cn(
                        "rounded-xl px-3.5 font-bold h-8 text-xs border-none transition-all gap-1.5", 
                        planCategory === 'vds' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setPlanCategory('vds')}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-amber-500" /> Cloud VDS ({vdsCount})
                    </Button>
                  </div>
                )
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {mainPlans
                  .filter((plan) => {
                    const slug = (plan.id || plan.name || '').toLowerCase()
                    const isVds = slug.includes('vds')
                    const isStorage = slug.includes('storage')
                    const isVps = slug.includes('vps') && !isVds && !isStorage
                    const isCloud = !isVps && !isVds && !isStorage

                    if (planCategory === 'cloud') return isCloud
                    if (planCategory === 'vps') return isVps
                    if (planCategory === 'storage') return isStorage
                    if (planCategory === 'vds') return isVds
                    return true
                  })
                  .map((plan) => {
                  const isCurrent = plan.id === currentPlanSlug
                  const displayPrice = plan.yearlyPrice !== undefined ? plan.yearlyPrice : plan.price * 10
                  const isStoragePlan = plan.id.toLowerCase().includes('storage')
                  const isVdsPlan = plan.id.toLowerCase().includes('vds')
                  const isVpsPlan = plan.id.toLowerCase().includes('vps') && !isStoragePlan

                  return (
                    <Card key={plan.id} className={cn(
                      "border rounded-2xl bg-card shadow-xs relative flex flex-col transition-all duration-200 hover:shadow-md",
                      isCurrent
                        ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]"
                        : isVdsPlan
                        ? "border-amber-500/40 hover:border-amber-500 bg-gradient-to-b from-card to-amber-500/[0.02]"
                        : isVpsPlan
                        ? "border-primary/40 hover:border-primary bg-gradient-to-b from-card to-primary/[0.02]"
                        : plan.popular
                        ? "border-primary/50 hover:border-primary"
                        : "border-border hover:border-muted-foreground/40"
                    )}>
                      {/* Status / Popular Badge */}
                      {isCurrent ? (
                        <div className="absolute top-3.5 right-3.5 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                          <Check className="h-3 w-3 stroke-[3]" /> Aktif
                        </div>
                      ) : isVdsPlan ? (
                        <div className="absolute top-3.5 right-3.5 bg-amber-500/10 text-amber-600 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="h-3 w-3" /> 100% Dedicated CPU
                        </div>
                      ) : isStoragePlan ? (
                        <div className="absolute top-3.5 right-3.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Database className="h-3 w-3" /> Dedicated MinIO Storage
                        </div>
                      ) : isVpsPlan ? (
                        <div className="absolute top-3.5 right-3.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Server className="h-3 w-3" /> Dedicated Business VPS
                        </div>
                      ) : plan.popular ? (
                        <div className="absolute top-3.5 right-3.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Populer
                        </div>
                      ) : null}

                      <CardHeader className="p-4 pb-2 space-y-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold tracking-tight text-foreground">{plan.name}</h3>
                          </div>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{plan.description}</p>
                          )}
                        </div>

                        <div className="pt-1">
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-foreground">{formatPrice(displayPrice)}</span>
                            <span className="text-xs font-semibold text-muted-foreground">/tahun</span>
                          </div>
                          {plan.price > 0 && (
                            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                              Setara {formatPrice(plan.price)}/bln (Tagihan Tahunan)
                            </p>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 pt-0 space-y-3.5 flex-1 flex flex-col justify-between">
                        {/* Features List */}
                        <ul className="space-y-2 flex-1 pt-2">
                          {plan.features && plan.features.map((feature: string) => (
                            <li key={feature} className="flex items-start gap-2 text-xs text-foreground/80 leading-snug">
                              <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" strokeWidth={2.5} />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="pt-2">
                          <Button 
                            className={cn(
                              "w-full h-9 font-bold rounded-xl text-xs transition-all shadow-xs",
                              isCurrent 
                                ? "bg-primary/10 text-primary cursor-default border border-primary/30 hover:bg-primary/10" 
                                : "bg-primary hover:bg-primary/90 text-primary-foreground"
                            )}
                            onClick={() => !isCurrent && router.push(`/dashboard/${tenantSlug}/subscriptions/checkout?plan=${plan.id}&interval=year`)}
                            disabled={isCurrent}
                          >
                            {isCurrent
                              ? <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" strokeWidth={3} /> Paket Aktif</span>
                              : `Langganan Tahunan`
                            }
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Add-ons Section */}
          {!isEnterpriseMode && addonPlans.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Add-on & Ekstra Kuota
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addonPlans.map((addon) => (
                  <Card key={addon.id} className="border border-border/80 bg-card/60 shadow-xs rounded-2xl overflow-hidden hover:border-primary/50 transition-all duration-200">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row justify-between gap-4">
                        <div className="space-y-3 flex-1">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl border border-primary/20 bg-primary/10 flex items-center justify-center text-primary shrink-0">
                              {addon.icon === 'Shield' && <Shield className="h-4 w-4" />}
                              {addon.icon === 'ShieldCheck' && <ShieldCheck className="h-4 w-4" />}
                              {addon.icon === 'Sparkles' && <Sparkles className="h-4 w-4" />}
                              {addon.icon === 'Zap' && <Zap className="h-4 w-4" />}
                              {addon.icon === 'Database' && <Database className="h-4 w-4" />}
                              {addon.icon === 'Bot' && <Bot className="h-4 w-4" />}
                              {addon.icon === 'HardDrive' && <HardDrive className="h-4 w-4" />}
                              {addon.icon === 'FileText' && <FileText className="h-4 w-4" />}
                              {!['Shield', 'ShieldCheck', 'Sparkles', 'Zap', 'Database', 'Bot', 'HardDrive', 'FileText'].includes(addon.icon) && (
                                addon.name.toLowerCase().includes('backup') ? <History className="h-4 w-4" /> : <Package className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold tracking-tight text-foreground">{addon.name}</p>
                              <p className="text-xs font-black text-primary">
                                {addon.priceLabel ? (
                                  <span>{addon.priceLabel}</span>
                                ) : (
                                  <>
                                    {formatPrice(addon.price)}
                                    <span className="text-[10px] text-muted-foreground font-normal ml-1">
                                      {addon.isTopup ? "(Sekali Bayar)" : "/bulan"}
                                    </span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {addon.features.map((feature: string) => (
                              <li key={feature} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Check className="h-3 w-3 text-primary shrink-0" strokeWidth={2.5} /> {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex sm:flex-col justify-end gap-2 shrink-0">
                          {addon.priceLabel && addon.price === 0 ? (
                            <Button 
                              variant="outline"
                              disabled
                              className="font-bold rounded-xl px-4 h-9 shadow-none text-xs border-border bg-muted/30 text-muted-foreground"
                            >
                              {addon.buttonText || "Termasuk"}
                            </Button>
                          ) : (
                            <Button 
                              className={cn(
                                "font-bold rounded-xl px-4 h-9 shadow-xs text-xs",
                                !addon.isTopup && activeAddons.includes(addon.id) 
                                  ? "bg-muted text-muted-foreground cursor-default hover:bg-muted" 
                                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
                              )}
                              onClick={() => (addon.isTopup || !activeAddons.includes(addon.id)) && router.push(`/dashboard/${tenantSlug}/subscriptions/checkout?plan=${addon.id}`)}
                              disabled={!addon.isTopup && activeAddons.includes(addon.id)}
                            >
                              {!addon.isTopup && activeAddons.includes(addon.id) ? (
                                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" strokeWidth={3} /> Aktif</span>
                              ) : (
                                addon.buttonText || "Beli Add-on"
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Invoices */}
          {!isEnterpriseMode && (
            <Card id="billing-history" className="border border-border/80 shadow-xs bg-card rounded-2xl overflow-hidden scroll-mt-24">
              <CardHeader className="bg-muted/20 p-5 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <History className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-bold tracking-tight text-foreground">Riwayat Tagihan & Transaksi</CardTitle>
                  </div>
                  <Badge variant="secondary" className="font-bold text-[10px] rounded-full">Faktur Terakhir</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {invoices.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="font-bold text-xs text-foreground">Belum ada riwayat tagihan</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Semua faktur pembayaran Anda di masa mendatang akan tercatat di sini.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="p-4 px-6 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl border border-border/80 bg-muted/40 flex items-center justify-center text-primary">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">{inv.isTransaction ? 'Transaksi' : 'Faktur'} #{inv.id.substring(0, 8).toUpperCase()}</p>
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {new Date(inv.createdAt).toLocaleDateString('id-ID')} &middot; IDR {inv.amount.toLocaleString('id-ID')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={cn(
                            "text-[10px] font-bold px-2.5 py-0.5 rounded-full border shadow-none",
                            inv.status === 'paid' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                          )}>
                            {inv.status === 'paid' ? 'Lunas' : inv.status}
                          </Badge>
                          {inv.isTransaction && inv.status === 'pending' ? (
                            <Button 
                              variant="default" 
                              size="sm" 
                              className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-3 text-xs font-bold shadow-xs"
                              onClick={() => router.push(`/dashboard/${tenantSlug}/subscriptions/checkout?plan=${inv.plan}&interval=year`)}
                            >
                              Bayar Sekarang
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground"
                              title="Unduh PDF Faktur"
                              onClick={() => generateInvoicePDF({
                                orderId: inv.midtransInvoiceId || inv.id,
                                amount: inv.amount,
                                status: inv.status,
                                date: new Date(inv.createdAt).toLocaleDateString('id-ID'),
                                customerName: currentTenant?.name || "Workspace",
                                description: `Langganan Workspace ${currentTenant?.name || ""} (${inv.plan || "Pro"})`
                              })}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Infrastructure Overrides */}
          {isEnterpriseMode && (
            <div className="space-y-4 mt-8">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold tracking-tight text-foreground">Infrastruktur Khusus Workspace</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Kustomisasi koneksi database PostgreSQL dan bucket S3 khusus untuk workspace ini.
                  </p>
                </div>
                <Button onClick={handleSaveInfra} disabled={savingInfra} className="rounded-xl font-bold text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs">
                  {savingInfra ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Simpan Pengaturan
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border border-border/80 shadow-xs rounded-2xl bg-card overflow-hidden">
                  <CardHeader className="p-4 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-xs font-bold flex items-center gap-2 text-foreground">
                      <Database className="h-4 w-4 text-primary" />
                      Override Database PostgreSQL
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">PostgreSQL Connection URL</label>
                      <input 
                        className="flex h-9 w-full rounded-xl border border-border/80 bg-background px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
                        value={infra.databaseUrl} 
                        onChange={(e) => setInfra({ ...infra, databaseUrl: e.target.value })}
                        placeholder="postgresql://user:password@host:port/database"
                        type="password"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-border/80 shadow-xs rounded-2xl bg-card overflow-hidden">
                  <CardHeader className="p-4 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-xs font-bold flex items-center gap-2 text-foreground">
                      <Cloud className="h-4 w-4 text-primary" />
                      Override S3 Storage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Nama Bucket</label>
                        <input 
                          className="flex h-9 w-full rounded-xl border border-border/80 bg-background px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
                          value={infra.s3Bucket} 
                          onChange={(e) => setInfra({ ...infra, s3Bucket: e.target.value })}
                          placeholder="tenant-bucket"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Region</label>
                        <input 
                          className="flex h-9 w-full rounded-xl border border-border/80 bg-background px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
                          value={infra.s3Region} 
                          onChange={(e) => setInfra({ ...infra, s3Region: e.target.value })}
                          placeholder="auto"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Access Key</label>
                        <input 
                          className="flex h-9 w-full rounded-xl border border-border/80 bg-background px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
                          value={infra.s3AccessKey} 
                          onChange={(e) => setInfra({ ...infra, s3AccessKey: e.target.value })}
                          type="password"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Secret Key</label>
                        <input 
                          className="flex h-9 w-full rounded-xl border border-border/80 bg-background px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
                          value={infra.s3SecretKey} 
                          onChange={(e) => setInfra({ ...infra, s3SecretKey: e.target.value })}
                          type="password"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
