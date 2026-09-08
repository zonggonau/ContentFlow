"use client"

import { useEffect, useState, useMemo } from "react"
import { useSafeSession } from "@/hooks/use-safe-session"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Loader2, Zap, CreditCard, CheckCircle2, ShieldCheck, Crown, Receipt, Clock, RefreshCw, Database, Download, Cloud, Save, Sparkles,
  Eye, EyeOff, Search, XCircle, Calendar, ArrowUpRight, FileText, Check, Copy
} from "lucide-react"
import { getTransactionHistoryAction, checkTransactionStatusAction } from "@/actions/billing"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { EnterpriseLicenseBanner } from "@/components/dashboard/enterprise-license-banner"
import { generateInvoicePDF } from "@/lib/pdf-generator"
import { InvoiceDetailDialog, TransactionInvoiceItem } from "@/components/dashboard/invoice-detail-dialog"

export default function BillingClient({
  initialAccountPlans,
  initialAiCreditPacks,
  initialActiveWorkspacesCount,
  initialUsage,
  initialAiCreditUsage,
  initialTransactions,
  initialTransactionsTotalPages,
  isEnterpriseMode,
  initialMasterInfra
}: {
  initialAccountPlans: any[]
  initialAiCreditPacks?: any[]
  initialActiveWorkspacesCount: number
  initialUsage: any
  initialAiCreditUsage?: { used: number, total: number, remaining: number, isUnlimited: boolean }
  initialTransactions: any[]
  initialTransactionsTotalPages?: number
  isEnterpriseMode?: boolean
  initialMasterInfra?: { databaseUrl: string, storageConfig: any }
}) {
  const { data: session, status, update } = useSafeSession()
  const router = useRouter()
  
  const [accountPlans, setAccountPlans] = useState<any[]>(initialAccountPlans)
  const [aiCreditPacks, setAiCreditPacks] = useState<any[]>(initialAiCreditPacks || [])
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null)
  const [activeWorkspacesCount, setActiveWorkspacesCount] = useState(initialActiveWorkspacesCount)
  const [usage, setUsage] = useState<{current: number, max: number | null, allowed: boolean, plan: string} | null>(initialUsage)
  const [aiUsage, setAiUsage] = useState(initialAiCreditUsage || null)
  const [transactions, setTransactions] = useState<any[]>(initialTransactions)
  const [transactionsPage, setTransactionsPage] = useState(1)
  const [transactionsTotalPages, setTransactionsTotalPages] = useState(initialTransactionsTotalPages || 1)
  const [loadingMoreTx, setLoadingMoreTx] = useState(false)
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null)

  // Invoice Modal & Filter State
  const [selectedInvoice, setSelectedInvoice] = useState<TransactionInvoiceItem | null>(null)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState("")
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState("")
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"all" | "paid" | "pending" | "cancelled">("all")

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedHistorySearch(historySearchQuery), 300)
    return () => clearTimeout(handler)
  }, [historySearchQuery])

  const handleLoadMoreTransactions = async () => {
    setLoadingMoreTx(true)
    try {
      const nextPage = transactionsPage + 1
      const result = await getTransactionHistoryAction(nextPage, 50)
      setTransactions(prev => [...prev, ...result.transactions])
      setTransactionsPage(nextPage)
      setTransactionsTotalPages(result.totalPages)
    } catch {
      toast({ variant: "destructive", title: "Gagal", description: "Gagal memuat riwayat transaksi berikutnya." })
    } finally {
      setLoadingMoreTx(false)
    }
  }

  // Helper status checkers
  const isPaidStatus = (s: string) => {
    const st = (s || "").toLowerCase()
    return st === "success" || st === "settlement" || st === "paid"
  }
  const isPendingStatus = (s: string) => {
    const st = (s || "").toLowerCase()
    return st === "pending" || st === "draft" || st === "unpaid"
  }
  const isCancelledStatus = (s: string) => {
    const st = (s || "").toLowerCase()
    return st === "cancel" || st === "cancelled" || st === "expire" || st === "expired" || st === "deny" || st === "failed"
  }

  // Summary Metrics
  const historyMetrics = useMemo(() => {
    const total = transactions.length
    const paidList = transactions.filter(t => isPaidStatus(t.status))
    const pendingList = transactions.filter(t => isPendingStatus(t.status))
    const cancelledList = transactions.filter(t => isCancelledStatus(t.status))
    const totalPaidAmount = paidList.reduce((acc, t) => acc + (Number(t.amount) || 0), 0)

    return {
      total,
      paidCount: paidList.length,
      pendingCount: pendingList.length,
      cancelledCount: cancelledList.length,
      totalPaidAmount
    }
  }, [transactions])

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Status Filter
      if (historyStatusFilter === "paid" && !isPaidStatus(t.status)) return false
      if (historyStatusFilter === "pending" && !isPendingStatus(t.status)) return false
      if (historyStatusFilter === "cancelled" && !isCancelledStatus(t.status)) return false

      // Search Query
      if (debouncedHistorySearch.trim()) {
        const q = debouncedHistorySearch.toLowerCase()
        const orderId = (t.orderId || "").toLowerCase()
        const plan = (t.subscription?.plan || "").toLowerCase()
        const tenantName = (t.subscription?.tenant?.name || "").toLowerCase()
        return orderId.includes(q) || plan.includes(q) || tenantName.includes(q)
      }

      return true
    })
  }, [transactions, historyStatusFilter, debouncedHistorySearch])

  const handlePayNow = (tx: any) => {
    if (tx.orderId.startsWith("ACC-")) {
      const plan = tx.subscription?.plan || "starter"
      router.push(`/dashboard/billing/checkout?plan=${plan}&type=account&interval=year`)
    } else if (tx.orderId.startsWith("SUB-")) {
      const tenantSlug = tx.subscription?.tenant?.slug || "workspace"
      const plan = tx.subscription?.plan || "pro"
      router.push(`/dashboard/${tenantSlug}/subscriptions/checkout?plan=${plan}&interval=year`)
    } else if (tx.rawResponse?.type === "ai_credits") {
      const packId = tx.rawResponse?.addonId || "ai-starter-50"
      router.push(`/dashboard/billing/checkout?addon=${packId}&type=addon`)
    } else {
      toast({
        variant: "destructive",
        title: "Tidak Dapat Melanjutkan Pembayaran",
        description: "Jenis transaksi ini tidak dikenali. Silakan hubungi dukungan pelanggan.",
      })
    }
  }

  const [infra, setInfra] = useState({
    databaseUrl: initialMasterInfra?.databaseUrl || "",
    s3Bucket: initialMasterInfra?.storageConfig?.bucket || "",
    s3Region: initialMasterInfra?.storageConfig?.region || "",
    s3AccessKey: initialMasterInfra?.storageConfig?.accessKeyId || "",
    s3SecretKey: initialMasterInfra?.storageConfig?.secretAccessKey || "",
  })
  const [savingInfra, setSavingInfra] = useState(false)
  const [infraShowMasks, setInfraShowMasks] = useState<Record<string, boolean>>({})

  // infra.databaseUrl/s3AccessKey/s3SecretKey arrive masked ("••••••••") from
  // the server component. Revealing one fetches the real value on demand
  // (audited server-side) so plaintext secrets never sit in the page's
  // initial payload.
  const revealInfraSecret = async (maskField: string, infraKey: "databaseUrl" | "s3AccessKey" | "s3SecretKey", apiField: string) => {
    if (infraShowMasks[maskField]) {
      setInfraShowMasks(prev => ({ ...prev, [maskField]: false }))
      return
    }
    try {
      const res = await fetch(`/api/auth/user/infrastructure?reveal=${apiField}`)
      if (!res.ok) throw new Error("reveal failed")
      const data = await res.json()
      setInfra(prev => ({ ...prev, [infraKey]: data.value ?? "" }))
      setInfraShowMasks(prev => ({ ...prev, [maskField]: true }))
    } catch {
      toast({ variant: "destructive", title: "Gagal", description: "Gagal mengambil nilai rahasia" })
    }
  }

  const handleCheckStatus = async (orderId: string) => {
    setCheckingOrderId(orderId)
    try {
      const result = await checkTransactionStatusAction(orderId)
      if (result.success) {
        const statusLabel = result.status === "success" ? "Berhasil (Lunas)" : result.status === "pending" ? "Menunggu Pembayaran" : result.status
        toast({ title: "Status Transaksi", description: `Status pesanan: ${statusLabel}` })
        setTransactions(prev => prev.map(t => t.orderId === orderId ? { ...t, status: result.status } : t))
        if (result.status === "success") {
          await update?.()
          router.refresh()
        }
      } else {
        toast({ variant: "destructive", title: "Gagal", description: result.error })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Gagal memeriksa status pembayaran" })
    } finally {
      setCheckingOrderId(null)
    }
  }

  const handleUpdateUserPlan = async (planId: string) => {
    setUpdatingPlanId(planId)
    try {
      if (planId === "free") {
        const res = await fetch("/api/auth/user/plan", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "free" }),
        })
        if (res.ok) {
          toast({ title: "Paket Akun Diperbarui", description: "Akun Anda kini berada pada paket Gratis." })
          router.refresh()
        }
      } else {
        router.push(`/dashboard/billing/checkout?plan=${planId}&type=account&interval=year`)
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Gagal memulai proses pembayaran." })
    } finally {
      setUpdatingPlanId(null)
    }
  }

  const handleBuyAiCredits = (packId: string) => {
    router.push(`/dashboard/billing/checkout?plan=${packId}&type=ai_credits`)
  }

  const handleSaveInfra = async () => {
    setSavingInfra(true)
    try {
      const res = await fetch("/api/auth/user/infrastructure", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(infra)
      })
      if (res.ok) {
        toast({ title: "Infrastruktur Disimpan", description: "Konfigurasi Database & Storage berhasil diperbarui." })
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

  if (status === "loading") {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary/50" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Billing & Quota Akun</h2>
        <p className="text-xs text-muted-foreground mt-1">Kelola kapasitas workspace akun Anda dan isi ulang kuota AI Frontend builder.</p>
      </div>

      <Tabs defaultValue="plans" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px] p-1 bg-muted/40 border border-border/80 rounded-2xl h-auto gap-1">
          <TabsTrigger value="plans" className="rounded-xl font-bold text-xs py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs text-muted-foreground hover:text-foreground">
            Subscription Plans
          </TabsTrigger>
          {!isEnterpriseMode && (
            <TabsTrigger value="history" className="rounded-xl font-bold text-xs py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs text-muted-foreground hover:text-foreground">
              Transaction History
            </TabsTrigger>
          )}
          {isEnterpriseMode && (
            <TabsTrigger value="infrastructure" className="rounded-xl font-bold text-xs py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs text-muted-foreground hover:text-foreground">
              Infrastructure
            </TabsTrigger>
          )}
        </TabsList>
        
        <TabsContent value="plans" className="space-y-6 mt-6">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Workspace Quota Card */}
            <Card className="border border-border/80 bg-card rounded-2xl shadow-xs">
              <CardHeader className="p-5 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">Kapasitas Workspace</CardTitle>
                    <CardDescription className="text-xs">Jumlah workspace aktif yang dimiliki akun Anda</CardDescription>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Database className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-1">
                <div className="flex items-baseline gap-1.5 mt-1">
                  <h3 className="text-2xl lg:text-3xl font-black text-foreground">{usage ? usage.current : activeWorkspacesCount}</h3>
                  <span className="text-xs text-muted-foreground font-semibold">
                    / {usage ? (usage.max === null || usage.max > 9000 ? 'Unlimited' : `${usage.max} Workspace`) : (session?.user?.plan === 'free' ? '1 Workspace' : 'Unlimited')}
                  </span>
                </div>
                <div className="mt-3 w-full bg-muted h-2 rounded-full overflow-hidden">
                  {(!usage && session?.user?.plan === 'free') || (usage && usage.max !== null) ? (
                     <div 
                       className={cn("h-full transition-all rounded-full", (usage && !usage.allowed) ? "bg-destructive" : "bg-primary")} 
                       style={{ width: `${Math.min(((usage?.current || activeWorkspacesCount) / (usage?.max || 1)) * 100, 100)}%` }} 
                     />
                  ) : (
                     <div className="h-full w-full bg-primary rounded-full" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Account AI Credits Card */}
            <Card className="border border-border/80 bg-card rounded-2xl shadow-xs">
              <CardHeader className="p-5 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">Saldo AI Frontend Credits</CardTitle>
                    <CardDescription className="text-xs">Kuota pembuatan schema, UI builder & iterasi frontend</CardDescription>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Zap className="h-4 w-4 fill-amber-500" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-1">
                <div className="flex items-baseline gap-1.5 mt-1">
                  <h3 className="text-2xl lg:text-3xl font-black text-foreground">{aiUsage ? aiUsage.remaining.toLocaleString() : "50"}</h3>
                  <span className="text-xs text-muted-foreground font-semibold">
                    / {aiUsage?.isUnlimited ? 'Unlimited' : (aiUsage ? `${aiUsage.total.toLocaleString()} Credits` : '50 Credits')}
                  </span>
                </div>
                <div className="mt-3 w-full bg-muted h-2 rounded-full overflow-hidden">
                  {aiUsage && !aiUsage.isUnlimited ? (
                    <div 
                      className="h-full bg-amber-500 transition-all rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, (aiUsage.remaining / Math.max(1, aiUsage.total)) * 100))}%` }} 
                    />
                  ) : (
                    <div className="h-full w-full bg-amber-500 rounded-full" />
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── 1. ACCOUNT PLANS (YEARLY PRICING) ── */}
          {!isEnterpriseMode && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold tracking-tight text-foreground">Paket Akun (Langganan Tahunan)</h3>
                  <p className="text-xs text-muted-foreground">Tingkatkan kapasitas total workspace yang dapat dibuat oleh akun Anda.</p>
                </div>
                <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  Billing Tahunan (Hemat 2 Bulan)
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {accountPlans.map((plan) => {
                  const isActive = session?.user?.plan === plan.id
                  return (
                    <Card 
                      key={plan.id} 
                      className={cn(
                        "flex flex-col relative rounded-2xl transition-all duration-200 border bg-card shadow-xs hover:shadow-md", 
                        isActive 
                          ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" 
                          : plan.popular
                          ? "border-primary/50 hover:border-primary"
                          : "border-border hover:border-muted-foreground/40"
                      )}
                    >
                      {isActive ? (
                        <div className="absolute top-3.5 right-3.5 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                          <CheckCircle2 className="h-3 w-3 stroke-[3]" /> Aktif
                        </div>
                      ) : plan.popular ? (
                        <div className="absolute top-3.5 right-3.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Populer
                        </div>
                      ) : null}

                      <CardHeader className="p-4 pb-2 space-y-2">
                        <div>
                          <CardTitle className="text-base font-bold text-foreground">{plan.name}</CardTitle>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{plan.description}</p>
                          )}
                        </div>

                        <div className="pt-1">
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-foreground">{plan.price}</span>
                            <span className="text-xs font-semibold text-muted-foreground">/tahun</span>
                          </div>
                          {plan.monthlyPrice && plan.priceAmount > 0 && (
                            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                              Setara {plan.monthlyPrice}/bln
                            </p>
                          )}
                        </div>

                        <div className="p-2 rounded-xl bg-muted/40 border border-border/60 text-[11px] font-semibold text-foreground flex items-center justify-between">
                          <span className="text-muted-foreground">Kapasitas:</span>
                          <span className="font-bold">{plan.workspaces === "Unlimited" ? "Unlimited Workspaces" : `Maks ${plan.workspaces} Workspace`}</span>
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 pt-1 flex flex-col justify-between flex-1 space-y-4">
                        <div className="space-y-1.5">
                          {plan.features.map((f: string, i: number) => (
                            <div key={i} className="flex items-start text-xs text-foreground/80 leading-snug">
                              <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /> 
                              <span>{f}</span>
                            </div>
                          ))}
                        </div>

                        <Button 
                          variant={isActive ? "outline" : "default"} 
                          disabled={isActive || updatingPlanId === plan.id}
                          onClick={() => handleUpdateUserPlan(plan.id)}
                          className={cn(
                            "w-full h-9 font-bold rounded-xl text-xs transition-all shadow-xs",
                            isActive 
                              ? "bg-primary/10 text-primary cursor-default border border-primary/30 hover:bg-primary/10" 
                              : "bg-primary hover:bg-primary/90 text-primary-foreground"
                          )}
                        >
                          {updatingPlanId === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
                          {isActive ? "Paket Aktif" : (plan.id === "free" ? "Gunakan Paket Gratis" : `Pilih ${plan.name}`)}
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── 2. AI PLAN CREDIT PACKS (DIBAWAH AKUN PLAN) ── */}
          <section className="space-y-3 pt-2 border-t border-border/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <h3 className="text-base font-bold tracking-tight text-foreground">AI Plan (Frontend Builder Credits)</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Paket credit AI sekali pakai (never expire) untuk generate Next.js frontend, schema, dan iterasi di semua workspace.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full text-amber-600 dark:text-amber-400 shrink-0 font-medium">
                <Zap className="h-3.5 w-3.5 fill-amber-500" />
                <span>Saldo Anda: <strong>{aiUsage ? aiUsage.remaining.toLocaleString() : "50"} Credits</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {aiCreditPacks.map((pack) => {
                return (
                  <Card 
                    key={pack.id} 
                    className={cn(
                      "flex flex-col relative rounded-2xl transition-all duration-200 border bg-card shadow-xs hover:shadow-md", 
                      pack.badge 
                        ? "border-amber-500/40 ring-1 ring-amber-500/20" 
                        : "border-border hover:border-amber-500/40"
                    )}
                  >
                    {pack.badge && (
                      <div className="absolute top-3.5 right-3.5 bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                        {pack.badge}
                      </div>
                    )}
                    <CardHeader className="p-4 pb-2 space-y-2">
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <Zap className="h-3.5 w-3.5 fill-amber-500" />
                        <span className="text-xs font-bold uppercase tracking-wider">{pack.name}</span>
                      </div>
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-foreground">Rp {pack.price_idr.toLocaleString('id-ID')}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                          ${pack.price_usd} USD • Sekali Beli
                        </p>
                      </div>
                      <div className="pt-1">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px] font-bold rounded-lg px-2 py-0.5">
                          +{pack.credits.toLocaleString()} AI Credits
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 flex flex-col justify-between flex-1 space-y-4">
                      <div className="space-y-1.5 pt-2 border-t border-border/60">
                        {pack.features?.map((f: string, i: number) => (
                          <div key={i} className="flex items-start text-xs text-foreground/80 leading-snug">
                            <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" /> 
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                      <Button 
                        onClick={() => handleBuyAiCredits(pack.id)}
                        className="w-full h-9 font-bold rounded-xl text-xs bg-amber-500 hover:bg-amber-600 text-black shadow-xs transition-all"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Top Up {pack.name.split(" ")[0]}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <div className="p-3.5 bg-muted/40 border border-border/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
              <div>
                <strong className="text-foreground">Biaya AI:</strong> 25 Cr / Full Next.js Frontend Gen • 5 Cr / Chat Iterasi • 5 Cr / Schema Auto-Gen
              </div>
              <div className="text-muted-foreground text-[11px]">
                *Credit tidak memiliki masa kedaluwarsa dan dapat digunakan kapan saja.
              </div>
            </div>
          </section>

          {/* ── 3. ENTERPRISE LICENSE ── */}
          <div className="mt-6">
            <h3 className="text-xl font-bold mb-4">Enterprise License</h3>
            {session?.user?.id && (
              <EnterpriseLicenseBanner tenantId={session.user.id} hideActivation={false} />
            )}
          </div>
        </TabsContent>

        {!isEnterpriseMode && (
          <TabsContent value="history" className="mt-6 space-y-6">
            
            {/* Header & Metrics Summary */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  Riwayat Transaksi & Invoice
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Daftar seluruh pembayaran akun, invoice langganan, dan riwayat add-on AI booster.
                </p>
              </div>
            </div>

            {/* Metrics Overview Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Paid Summary */}
              <Card className="border border-border/80 shadow-xs rounded-2xl bg-card overflow-hidden">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Transaksi Lunas</p>
                    <p className="text-xl font-black text-foreground tracking-tight">
                      Rp {historyMetrics.totalPaidAmount.toLocaleString("id-ID")}
                    </p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {historyMetrics.paidCount} Pembayaran Berhasil
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* Pending Summary */}
              <Card className="border border-border/80 shadow-xs rounded-2xl bg-card overflow-hidden">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Menunggu Pembayaran</p>
                    <p className="text-xl font-black text-foreground tracking-tight">
                      {historyMetrics.pendingCount} <span className="text-xs font-normal text-muted-foreground">Tagihan</span>
                    </p>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {historyMetrics.pendingCount > 0 ? "Menunggu proses transfer" : "Tidak ada tagihan tertunda"}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Clock className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* Cancelled Summary */}
              <Card className="border border-border/80 shadow-xs rounded-2xl bg-card overflow-hidden">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Dibatalkan / Expired</p>
                    <p className="text-xl font-black text-foreground tracking-tight">
                      {historyMetrics.cancelledCount} <span className="text-xs font-normal text-muted-foreground">Transaksi</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-rose-500" />
                      Kadaluarsa atau Dibatalkan
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <XCircle className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              
              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-border/60 overflow-x-auto text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setHistoryStatusFilter("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg transition-all text-xs font-bold whitespace-nowrap",
                    historyStatusFilter === "all" 
                      ? "bg-background text-foreground shadow-xs" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Semua ({historyMetrics.total})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryStatusFilter("paid")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg transition-all text-xs font-bold whitespace-nowrap flex items-center gap-1.5",
                    historyStatusFilter === "paid" 
                      ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Lunas ({historyMetrics.paidCount})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryStatusFilter("pending")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg transition-all text-xs font-bold whitespace-nowrap flex items-center gap-1.5",
                    historyStatusFilter === "pending" 
                      ? "bg-background text-amber-600 dark:text-amber-400 shadow-xs" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Menunggu ({historyMetrics.pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryStatusFilter("cancelled")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg transition-all text-xs font-bold whitespace-nowrap flex items-center gap-1.5",
                    historyStatusFilter === "cancelled" 
                      ? "bg-background text-rose-600 dark:text-rose-400 shadow-xs" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Dibatalkan ({historyMetrics.cancelledCount})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  placeholder="Cari Order ID / Paket..." 
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs rounded-xl border-border/80 bg-background shadow-xs"
                />
              </div>

            </div>

            {/* Invoices List / Table */}
            <Card className="border border-border/80 shadow-xs rounded-2xl bg-card overflow-hidden">
              <CardContent className="p-0">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-16 px-4 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
                      <Receipt className="h-6 w-6 opacity-60" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-sm">Tidak ada transaksi ditemukan</p>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto">
                        {historySearchQuery ? "Tidak ada riwayat transaksi yang cocok dengan pencarian Anda." : "Belum ada transaksi pada akun ini."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {filteredTransactions.map((tx) => {
                      const isPaid = isPaidStatus(tx.status)
                      const isPending = isPendingStatus(tx.status)
                      const isCancelled = isCancelledStatus(tx.status)

                      // Determine title
                      let itemTitle = "Langganan Paket SaCMS Cloud"
                      if (tx.orderId.startsWith("ACC-")) {
                        const rawPlan = tx.subscription?.plan || "Starter"
                        itemTitle = `Paket Akun SaaS (${rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1)})`
                      } else if (tx.orderId.startsWith("SUB-")) {
                        const wsName = tx.subscription?.tenant?.name || "Workspace"
                        const rawPlan = tx.subscription?.plan || "Pro"
                        itemTitle = `Workspace ${wsName} (${rawPlan.toUpperCase()})`
                      } else if (tx.orderId.startsWith("AI-")) {
                        itemTitle = "Booster AI Frontend Credits"
                      } else if (tx.rawResponse?.type === "ai_credits") {
                        itemTitle = `${tx.rawResponse.credits || "Booster"} AI Credits Pack`
                      }

                      return (
                        <div 
                          key={tx.id} 
                          className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                        >
                          {/* Order Info & Service */}
                          <div className="flex items-start gap-3.5">
                            <div className={cn(
                              "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border shadow-xs mt-0.5",
                              isPaid 
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                                : isPending 
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" 
                                : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                            )}>
                              {isPaid ? <CheckCircle2 className="h-5 w-5" /> : isPending ? <Clock className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-foreground">
                                  #{tx.orderId}
                                </span>
                                <Badge 
                                  variant="outline" 
                                  className="text-[10px] font-mono py-0 px-2 rounded-md bg-muted/60 border-border/80 text-muted-foreground font-medium"
                                >
                                  {tx.paymentType || tx.paymentMethod || "Midtrans Snap"}
                                </Badge>
                              </div>

                              <p className="text-xs font-semibold text-foreground">
                                {itemTitle}
                              </p>

                              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                {new Date(tx.createdAt).toLocaleDateString("id-ID", {
                                  day: "numeric", 
                                  month: "short", 
                                  year: "numeric", 
                                  hour: "2-digit", 
                                  minute: "2-digit"
                                })}
                              </p>
                            </div>
                          </div>

                          {/* Amount, Status Badge & Actions */}
                          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between md:justify-end gap-3.5 pt-2 md:pt-0 border-t md:border-t-0 border-border/60">
                            
                            {/* Price & Status */}
                            <div className="text-left md:text-right">
                              <p className="font-black text-sm text-foreground">
                                Rp {Number(tx.amount).toLocaleString("id-ID")}
                              </p>
                              <div className="mt-1">
                                {isPaid ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-none gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Lunas
                                  </Badge>
                                ) : isPending ? (
                                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-none gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    Menunggu Pembayaran
                                  </Badge>
                                ) : (
                                  <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-none gap-1">
                                    <XCircle className="h-3 w-3" />
                                    Dibatalkan
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1.5">
                              
                              {/* Open Detail Modal */}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedInvoice(tx)
                                  setIsInvoiceModalOpen(true)
                                }}
                                className="h-8 px-2.5 text-xs font-bold rounded-xl border-border/80 gap-1"
                                title="Lihat Detail Invoice"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Lihat</span>
                              </Button>

                              {/* Download PDF directly */}
                              <Button 
                                variant="outline" 
                                size="icon"
                                className="h-8 w-8 rounded-xl border-border/80 hover:bg-muted text-foreground shadow-2xs"
                                title="Unduh PDF Invoice"
                                onClick={() => generateInvoicePDF({
                                  orderId: tx.orderId,
                                  amount: Number(tx.amount),
                                  status: tx.status,
                                  date: new Date(tx.createdAt).toLocaleDateString("id-ID", {
                                    day: "numeric", month: "short", year: "numeric"
                                  }),
                                  customerName: session?.user?.name || "Customer",
                                  customerEmail: session?.user?.email || "",
                                  description: itemTitle,
                                  paymentMethod: tx.paymentType || tx.paymentMethod || "Midtrans Gateway"
                                })}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>

                              {/* Action if Pending */}
                              {isPending && (
                                <>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    disabled={checkingOrderId === tx.orderId}
                                    onClick={() => handleCheckStatus(tx.orderId)}
                                    className="h-8 px-2.5 text-xs font-bold rounded-xl border-border/80 gap-1"
                                    title="Periksa Status Pembayaran ke Gateway"
                                  >
                                    <RefreshCw className={cn("h-3 w-3", checkingOrderId === tx.orderId && "animate-spin")} />
                                    <span className="hidden lg:inline">Cek Status</span>
                                  </Button>

                                  <Button 
                                    size="sm"
                                    onClick={() => handlePayNow(tx)}
                                    className="h-8 px-3 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs gap-1"
                                  >
                                    <CreditCard className="h-3 w-3" />
                                    Bayar
                                  </Button>
                                </>
                              )}

                            </div>

                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {transactionsPage < transactionsTotalPages && !debouncedHistorySearch.trim() && historyStatusFilter === "all" && (
                  <div className="p-4 border-t border-border/60 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMoreTransactions}
                      disabled={loadingMoreTx}
                      className="h-9 rounded-xl text-xs font-bold gap-1.5"
                    >
                      {loadingMoreTx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Muat Riwayat Lainnya
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

          </TabsContent>
        )}

        {isEnterpriseMode && (
          <TabsContent value="infrastructure" className="mt-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold">Master Infrastructure Override</h3>
                <p className="text-sm text-muted-foreground">
                  Configure default database and S3 credentials for all new workspaces created under this account.
                </p>
              </div>
              <Button onClick={handleSaveInfra} disabled={savingInfra}>
                {savingInfra ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Settings
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-4 border-b bg-muted/20">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    Master Database Override
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="masterDatabaseUrl">PostgreSQL Connection URL</Label>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealInfraSecret('databaseUrl', 'databaseUrl', 'databaseUrl')}>
                        {infraShowMasks.databaseUrl ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                        {infraShowMasks.databaseUrl ? "Sembunyikan" : "Tampilkan"}
                      </Button>
                    </div>
                    <Input
                      id="masterDatabaseUrl"
                      value={infra.databaseUrl}
                      onChange={(e) => setInfra({ ...infra, databaseUrl: e.target.value })}
                      placeholder="postgresql://user:password@host:port/database"
                      type={infraShowMasks.databaseUrl ? "text" : "password"}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader className="pb-4 border-b bg-muted/20">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-primary" />
                    Master S3 Storage Override
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="masterS3Bucket">Bucket Name</Label>
                      <Input 
                        id="masterS3Bucket" 
                        value={infra.s3Bucket} 
                        onChange={(e) => setInfra({ ...infra, s3Bucket: e.target.value })}
                        placeholder="my-enterprise-bucket"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="masterS3Region">Region</Label>
                      <Input 
                        id="masterS3Region" 
                        value={infra.s3Region} 
                        onChange={(e) => setInfra({ ...infra, s3Region: e.target.value })}
                        placeholder="ap-southeast-1 (or auto for R2)"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="masterS3AccessKey">Access Key ID</Label>
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealInfraSecret('s3AccessKey', 's3AccessKey', 's3AccessKey')}>
                          {infraShowMasks.s3AccessKey ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {infraShowMasks.s3AccessKey ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <Input
                        id="masterS3AccessKey"
                        value={infra.s3AccessKey}
                        onChange={(e) => setInfra({ ...infra, s3AccessKey: e.target.value })}
                        type={infraShowMasks.s3AccessKey ? "text" : "password"}
                        placeholder="Enter access key"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="masterS3SecretKey">Secret Access Key</Label>
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealInfraSecret('s3SecretKey', 's3SecretKey', 's3SecretKey')}>
                          {infraShowMasks.s3SecretKey ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {infraShowMasks.s3SecretKey ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <Input
                        id="masterS3SecretKey"
                        value={infra.s3SecretKey}
                        onChange={(e) => setInfra({ ...infra, s3SecretKey: e.target.value })}
                        type={infraShowMasks.s3SecretKey ? "text" : "password"}
                        placeholder="Enter secret key"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Interactive Invoice Detail Modal */}
      <InvoiceDetailDialog 
        open={isInvoiceModalOpen}
        onOpenChange={setIsInvoiceModalOpen}
        invoice={selectedInvoice}
        customerName={session?.user?.name || "Pelanggan SaCMS"}
        customerEmail={session?.user?.email || "-"}
        onCheckStatus={handleCheckStatus}
        onPayNow={handlePayNow}
      />
    </div>
  )
}
