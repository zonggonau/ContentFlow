"use client"

import { useState, useMemo, useEffect } from "react"
import { 
  Loader2, 
  Building2, 
  Sparkles, 
  Layers, 
  Users, 
  HardDrive, 
  Plus, 
  Globe, 
  Check, 
  Zap, 
  Database,
  Server,
  ShieldCheck
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { createTenantAction } from "@/actions/tenant"
import { useRouter } from "next/navigation"

export interface WorkspacePlan {
  id: string
  plan_slug?: string
  name: string
  desc: string
  priceAmount: number
  yearlyPrice: number
  max_content_types?: number
  max_content_entries?: number
  max_storage?: number
  max_team_members?: number
  max_locales?: number
  max_api_calls?: number
  features?: string[]
}

export interface AddonPlan {
  id: string
  name: string
  desc?: string
  priceLabel?: string
  priceAmount: number
  icon?: string
}

interface WorkspaceCreationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspacePlans?: WorkspacePlan[]
  addonPlans?: AddonPlan[]
  dbTemplates?: any[]
  initialTemplateId?: string
}

export function WorkspaceCreationDialog({
  open,
  onOpenChange,
  workspacePlans = [],
  addonPlans = [],
}: WorkspaceCreationDialogProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [domainHost, setDomainHost] = useState(".sacms.cloud")
  const [activeCategory, setActiveCategory] = useState<"cloud" | "vps" | "vds" | "storage">("cloud")

  const defaultPlanSlug = workspacePlans[0]?.plan_slug || workspacePlans[0]?.id || "free"

  const [newWorkspace, setNewWorkspace] = useState({
    name: "",
    description: "",
    plan: defaultPlanSlug,
    selectedAddons: [] as string[]
  })

  // Detect dynamic host on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.host
      if (host.includes("localhost")) {
        setDomainHost(`.${host}`)
      } else {
        const parts = host.split(".")
        if (parts.length >= 2) {
          setDomainHost(`.${parts.slice(-2).join(".")}`)
        } else {
          setDomainHost(`.${host}`)
        }
      }
    }
  }, [])

  // Categorize workspace plans into 4 clean categories.
  const planKind = (p: WorkspacePlan): "storage" | "vds" | "vps" | "cloud" => {
    const s = `${p.plan_slug || ""} ${p.id || ""} ${p.name || ""}`.toLowerCase()
    if (s.includes("storage")) return "storage"
    if (s.includes("vds")) return "vds"
    if (s.includes("vps")) return "vps"
    return "cloud"
  }

  const categorizedPlans = useMemo(() => {
    const storage = workspacePlans.filter(p => planKind(p) === "storage")
    const vds = workspacePlans.filter(p => planKind(p) === "vds")
    const vps = workspacePlans.filter(p => planKind(p) === "vps")
    const cloud = workspacePlans.filter(p => planKind(p) === "cloud")

    return {
      cloud: cloud.length > 0 ? cloud : (vps.length === 0 && vds.length === 0 && storage.length === 0 ? workspacePlans : cloud),
      vps,
      vds,
      storage,
    }
  }, [workspacePlans])

  const displayedPlans = useMemo(() => {
    const plans = categorizedPlans[activeCategory] || []
    if (plans.length === 0 && workspacePlans.length > 0) {
      return workspacePlans
    }
    return plans
  }, [categorizedPlans, activeCategory, workspacePlans])

  // Sync default plan when workspacePlans arrive
  useEffect(() => {
    if (workspacePlans.length > 0 && !workspacePlans.some(p => (p.plan_slug || p.id) === newWorkspace.plan)) {
      setNewWorkspace(prev => ({
        ...prev,
        plan: workspacePlans[0].plan_slug || workspacePlans[0].id
      }))
    }
  }, [workspacePlans, newWorkspace.plan])

  // Automatically switch tab when plan belongs to that category
  useEffect(() => {
    const currentPlan = (newWorkspace.plan || "").toLowerCase()
    if (currentPlan.includes("storage")) {
      setActiveCategory("storage")
    } else if (currentPlan.includes("vds")) {
      setActiveCategory("vds")
    } else if (currentPlan.includes("vps")) {
      setActiveCategory("vps")
    } else {
      setActiveCategory("cloud")
    }
  }, [newWorkspace.plan])

  // Live slug preview generator
  const slugPreview = useMemo(() => {
    const raw = newWorkspace.name.trim().toLowerCase()
    if (!raw) return "workspace-anda"
    return raw
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 30) || "workspace"
  }, [newWorkspace.name])

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspace.name.trim()) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Nama workspace wajib diisi." })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await createTenantAction({
        name: newWorkspace.name.trim(),
        description: newWorkspace.description.trim(),
        plan: newWorkspace.plan,
        addons: newWorkspace.selectedAddons
      })

      if (res.success) {
        toast({ title: "Workspace Berhasil Dibuat!", description: "Mengalihkan ke dashboard workspace baru Anda..." })
        onOpenChange(false)
        router.push(`/dashboard/${res.tenantId}`)
      } else {
        toast({ variant: "destructive", title: "Pembuatan Gagal", description: res.error || "Gagal membuat workspace" })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: err.message || "Terjadi kesalahan jaringan." })
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleAddon = (addonId: string) => {
    setNewWorkspace(prev => {
      const exists = prev.selectedAddons.includes(addonId)
      return {
        ...prev,
        selectedAddons: exists 
          ? prev.selectedAddons.filter(id => id !== addonId)
          : [...prev.selectedAddons, addonId]
      }
    })
  }

  const selectedPlanObj = useMemo(() => {
    return workspacePlans.find(p => (p.plan_slug || p.id) === newWorkspace.plan) || workspacePlans[0]
  }, [workspacePlans, newWorkspace.plan])

  const calculateTotalPrice = () => {
    if (!selectedPlanObj) return 0
    
    let basePrice = Number(selectedPlanObj.priceAmount) || 0
    let yearlyPrice = selectedPlanObj.yearlyPrice !== undefined && selectedPlanObj.yearlyPrice > 0 
      ? Number(selectedPlanObj.yearlyPrice) 
      : basePrice * 10
    
    let addonPrice = newWorkspace.selectedAddons.reduce((sum, addonId) => {
      const addon = addonPlans.find(a => a.id === addonId)
      const aPrice = Number(addon?.priceAmount) || 0
      return sum + (aPrice * 12)
    }, 0)

    return yearlyPrice + addonPrice
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden max-h-[92vh] flex flex-col rounded-3xl border-border/80 bg-card shadow-2xl">
        <form onSubmit={handleCreateTenant} className="flex flex-col h-full max-h-[92vh] overflow-hidden">
          
          {/* Header */}
          <DialogHeader className="p-6 pb-5 border-b border-border/60 bg-muted/20 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                      Inisialisasi Workspace Baru
                    </DialogTitle>
                    <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 rounded-full border-primary/20 bg-primary/5 text-primary">
                      Multi-Tenant CMS
                    </Badge>
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Buat ruang kerja headless CMS terisolasi lengkap dengan REST API, GraphQL, dan media storage.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>
          
          {/* Form Body (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Bagian 1: Identitas Workspace */}
            <div className="space-y-4 rounded-2xl border border-border/70 bg-background/50 p-4 sm:p-5">
              <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">1</div>
                <h3 className="text-xs font-bold text-foreground">Identitas & Akses Workspace</h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ws-name" className="text-xs font-semibold text-foreground flex items-center gap-1">
                    Nama Workspace <span className="text-destructive">*</span>
                  </Label>
                  <Input 
                    id="ws-name"
                    placeholder="Contoh: Portal Informasi Papua, Toko Online, dll." 
                    value={newWorkspace.name}
                    onChange={e => setNewWorkspace(prev => ({ ...prev, name: e.target.value }))}
                    className="text-xs h-9.5 rounded-xl border-border/80 bg-background"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Live Preview Subdomain URL
                  </Label>
                  <div className="h-9.5 rounded-xl border border-border/80 bg-muted/40 px-3 flex items-center gap-2 text-xs font-mono text-muted-foreground overflow-hidden">
                    <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate text-foreground font-semibold">{slugPreview}</span>
                    <span className="text-muted-foreground">{domainHost}</span>
                    <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4 shrink-0 font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      HTTPS
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ws-desc" className="text-xs font-semibold text-foreground">
                  Deskripsi Workspace <span className="text-muted-foreground font-normal text-[11px]">(Opsional)</span>
                </Label>
                <Textarea 
                  id="ws-desc"
                  placeholder="Deskripsikan tujuan atau ruang lingkup proyek konten workspace ini..." 
                  value={newWorkspace.description}
                  onChange={e => setNewWorkspace(prev => ({ ...prev, description: e.target.value }))}
                  className="text-xs resize-none rounded-xl border-border/80 bg-background"
                  rows={2}
                />
              </div>
            </div>

            {/* Bagian 2: Pilihan Paket Kapasitas (Tahunan) */}
            <div className="space-y-4 rounded-2xl border border-border/70 bg-background/50 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">2</div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Pilih Paket Kapasitas Workspace</h3>
                    <p className="text-[11px] text-muted-foreground">Pilih paket Cloud Ekonomis, Cloud VPS Standar, Gov &amp; Enterprise VDS, atau VPS Storage sesuai skala proyek Anda.</p>
                  </div>
                </div>

                <Badge variant="secondary" className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 self-start sm:self-auto">
                  Langganan Tahunan
                </Badge>
              </div>

              {/* 3 Categories Tabs */}
              <div className="flex flex-wrap items-center p-1 bg-muted/60 rounded-xl border border-border/70 w-fit max-w-full gap-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => setActiveCategory("cloud")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 font-bold text-xs transition-all flex items-center gap-1.5",
                    activeCategory === "cloud"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Cloud Ekonomis ({categorizedPlans.cloud.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("vps")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 font-bold text-xs transition-all flex items-center gap-1.5",
                    activeCategory === "vps"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Server className="h-3.5 w-3.5" />
                  <span>Cloud VPS Standar ({categorizedPlans.vps.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("vds")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 font-bold text-xs transition-all flex items-center gap-1.5",
                    activeCategory === "vds"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Gov & Enterprise VDS ({categorizedPlans.vds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("storage")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 font-bold text-xs transition-all flex items-center gap-1.5",
                    activeCategory === "storage"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>VPS Storage ({categorizedPlans.storage.length})</span>
                </button>
              </div>
              
              {/* Plans Grid (3 Columns) */}
              {displayedPlans.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-xl bg-muted/10">
                  Tidak ada paket pada kategori ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                  {displayedPlans.map((plan) => {
                    const planSlug = plan.plan_slug || plan.id
                    const isSelected = newWorkspace.plan === planSlug
                    const price = Number(plan.priceAmount) || 0
                    const displayPrice = plan.yearlyPrice !== undefined && plan.yearlyPrice > 0 
                      ? Number(plan.yearlyPrice) 
                      : price * 10

                    return (
                      <div 
                        key={plan.id}
                        onClick={() => setNewWorkspace(prev => ({ ...prev, plan: planSlug }))}
                        className={cn(
                          "cursor-pointer p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between relative bg-card hover:shadow-xs",
                          isSelected 
                            ? "border-primary bg-primary/[0.04] ring-2 ring-primary shadow-sm" 
                            : "border-border/80 hover:border-primary/50 hover:bg-muted/20"
                        )}
                      >
                        {/* Selected Checkmark */}
                        {isSelected && (
                          <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                            <Check className="h-3 w-3" />
                          </div>
                        )}

                        <div>
                          <div className="pr-6">
                            <h4 className="font-bold text-xs text-foreground uppercase tracking-tight">{plan.name}</h4>
                            {plan.desc && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                                {plan.desc}
                              </p>
                            )}
                          </div>

                          {/* Price */}
                          <div className="my-3 py-1.5 border-y border-border/50">
                            <div className="flex items-baseline gap-1">
                              <span className="text-base font-black text-foreground">
                                {displayPrice === 0 ? "Gratis" : `Rp ${displayPrice.toLocaleString('id-ID')}`}
                              </span>
                              {displayPrice > 0 && (
                                <span className="text-[10px] text-muted-foreground font-semibold">
                                  /thn
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Dynamic Limits Checklist */}
                          <div className="space-y-1.5 text-[11px]">
                            {plan.max_content_types !== undefined && (
                              <div className="flex items-center gap-1.5 text-foreground/90 font-medium">
                                <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{plan.max_content_types < 9999 ? `${plan.max_content_types} Tipe Konten` : "Skema Unlimited"}</span>
                              </div>
                            )}

                            {plan.max_content_entries !== undefined && (
                              <div className="flex items-center gap-1.5 text-foreground/90 font-medium">
                                <Database className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{plan.max_content_entries.toLocaleString('id-ID')} Entri Konten</span>
                              </div>
                            )}

                            {plan.max_storage !== undefined && (
                              <div className="flex items-center gap-1.5 text-foreground/90 font-medium">
                                <HardDrive className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{plan.max_storage >= 1024 ? `${plan.max_storage / 1024} GB` : `${plan.max_storage} MB`} Media</span>
                              </div>
                            )}

                            {plan.max_team_members !== undefined && (
                              <div className="flex items-center gap-1.5 text-foreground/90 font-medium">
                                <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{plan.max_team_members > 50 ? "Tim Unlimited" : `${plan.max_team_members} Anggota`}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Features List */}
                        {plan.features && plan.features.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-border/40 flex flex-wrap gap-1">
                            {plan.features.slice(0, 3).map((feat, idx) => (
                              <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground font-medium border border-border/50 truncate max-w-full">
                                {feat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Bagian 3: Add-on Ekstra (Opsional) */}
            {addonPlans.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-4 sm:p-5">
                <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">3</div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Add-on & Fitur Ekstra (Opsional)</h3>
                    <p className="text-[11px] text-muted-foreground">Tingkatkan performa workspace dengan fitur tambahan (tahunan).</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                  {addonPlans.map(addon => {
                    const isChecked = newWorkspace.selectedAddons.includes(addon.id)
                    const price = Number(addon.priceAmount) || 0
                    const displayPrice = price * 12

                    return (
                      <div
                        key={addon.id}
                        onClick={() => toggleAddon(addon.id)}
                        className={cn(
                          "cursor-pointer p-3 rounded-xl border transition-all flex items-start justify-between gap-2 bg-card",
                          isChecked 
                            ? "border-primary bg-primary/5 ring-1.5 ring-primary" 
                            : "border-border/80 hover:border-primary/50"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                            <h5 className="font-bold text-xs text-foreground truncate">{addon.name}</h5>
                          </div>
                          {addon.desc && (
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{addon.desc}</p>
                          )}
                          <p className="text-[11px] font-bold text-primary mt-1">
                            {displayPrice === 0 ? "Gratis" : `+Rp ${displayPrice.toLocaleString('id-ID')}/thn`}
                          </p>
                        </div>
                        <div className={cn(
                          "w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5",
                          isChecked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                        )}>
                          {isChecked && <Check className="h-2.5 w-2.5" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          
          {/* Total & Summary Sticky Bottom Bar */}
          <div className="p-4 sm:px-6 bg-muted/30 border-t border-border/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-xs">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Estimasi Tagihan</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-base sm:text-lg font-black text-foreground">
                    {calculateTotalPrice() === 0 ? "Rp 0 (Gratis Selamanya)" : `Rp ${calculateTotalPrice().toLocaleString('id-ID')}`}
                  </h3>
                  {selectedPlanObj && (
                    <Badge variant="outline" className="text-[10px] font-bold uppercase rounded-md border-border/80">
                      Paket {selectedPlanObj.name} &bull; Tahunan
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => onOpenChange(false)} 
                className="text-xs font-bold h-9 rounded-xl border-border/80"
              >
                Batal
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !newWorkspace.name.trim()}
                size="sm"
                className="text-xs font-bold gap-1.5 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer px-4"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Menginisialisasi Workspace...
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Buat & Buka Workspace
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
