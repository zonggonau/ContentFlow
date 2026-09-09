"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Loader2,
  Save,
  Building2,
  Shield,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Mail,
  Upload,
  Layers,
  UserCheck,
  Zap,
  ExternalLink,
  Sparkles,
  Eye,
  Globe,
  Send,
  Plus,
  Image as ImageIcon,
  KeyRound,
  Lock,
} from "lucide-react"
import { toast } from "sonner"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { UsageTab } from "@/components/dashboard/usage-tab"
import { getContentTypesAction } from "@/actions/content-types"

export default function TenantSettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const tenantSlug = params?.tenant as string
  const { confirm, dialog: confirmDialog } = useConfirm()

  const defaultTabParam = searchParams?.get("tab") || "general"
  const [activeTab, setActiveTab] = useState(
    defaultTabParam === "domains" || defaultTabParam === "infrastructure" ? "general" : defaultTabParam
  )

  useEffect(() => {
    const tab = searchParams?.get("tab")
    if (tab === "domains") {
      router.replace(`/dashboard/${tenantSlug}/deployments?tab=domains`)
    } else if (tab === "infrastructure") {
      router.replace(`/dashboard/${tenantSlug}/infrastructure`)
    } else if (tab) {
      setActiveTab(tab)
    }
  }, [searchParams, tenantSlug, router])

  const [contentTypes, setContentTypes] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Modals state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [showPurgeDialog, setShowPurgeDialog] = useState(false)
  const [purgeConfirm, setPurgeConfirm] = useState("")
  const [purging, setPurging] = useState(false)

  // Test Email state
  const [showTestEmailDialog, setShowTestEmailDialog] = useState(false)
  const [testEmailRecipient, setTestEmailRecipient] = useState("")
  const [sendingTestEmail, setSendingTestEmail] = useState(false)

  // Tenant settings state
  const [tenantId, setTenantId] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [plan, setPlan] = useState("free")
  const [tenantStatus, setTenantStatus] = useState("active")
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")

  // Security settings
  const [twoFactorRequired, setTwoFactorRequired] = useState(false)
  const [ipWhitelist, setIpWhitelist] = useState(false)
  const [allowedIps, setAllowedIps] = useState("")
  const [auditLogging, setAuditLogging] = useState(true)
  const [detectedIp, setDetectedIp] = useState<string | null>(null)

  // Email settings
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("")
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPassword, setSmtpPassword] = useState("")
  const [fromEmail, setFromEmail] = useState("")
  const [fromName, setFromName] = useState("")

  // White-Label Branding state
  const [brandName, setBrandName] = useState("")
  const [brandLogo, setBrandLogo] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#3B82F6")
  const [customEmailSender, setCustomEmailSender] = useState("")
  const [faviconUrl, setFaviconUrl] = useState("")
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)

  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const faviconFileInputRef = useRef<HTMLInputElement>(null)

  const tenants = useMemo(() => {
    return session?.user?.tenants || []
  }, [session])

  const currentTenant = useMemo(() => {
    return tenants.find((t) => t.slug === tenantSlug || t.id === tenantSlug)
  }, [tenants, tenantSlug])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  // Try to detect user client IP for IP whitelist helper
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => {
        if (data?.ip) setDetectedIp(data.ip)
      })
      .catch(() => {
        // Silently ignore if offline / ad-blocked
      })
  }, [])

  useEffect(() => {
    async function fetchData() {
      if (!tenantSlug || !session?.user) return

      try {
        const [ctData, settingsRes, wlRes] = await Promise.all([
          getContentTypesAction(tenantSlug).catch(() => ({ contentTypes: [] })),
          fetch(`/api/tenant/${tenantSlug}/settings`),
          fetch(`/api/tenant/${tenantSlug}/white-label`).catch(() => null),
        ])

        if (ctData && !("error" in ctData)) {
          setContentTypes(ctData.contentTypes || [])
        }

        if (settingsRes.ok) {
          const data = await settingsRes.json()
          const settings = data.settings || {}
          setTenantId(settings.id || "")
          setName(settings.name || "")
          setDescription(settings.description || "")
          setPlan(settings.plan || "free")
          setTenantStatus(settings.status || "active")
          setSubscriptionStatus(settings.subscriptionStatus || null)
          setDaysRemaining(settings.daysRemaining ?? null)
          setPreviewUrl(settings.previewUrl || "")
          setTwoFactorRequired(settings.twoFactorRequired || false)
          setIpWhitelist(settings.ipWhitelist || false)
          setAllowedIps(settings.allowedIps || "")
          setAuditLogging(settings.auditLogging ?? true)

          setSmtpHost(settings.smtpHost || "")
          setSmtpPort(settings.smtpPort || "")
          setSmtpUser(settings.smtpUser || "")
          setSmtpPassword(settings.smtpPassword || "")
          setFromEmail(settings.fromEmail || "")
          setFromName(settings.fromName || "")
        }

        if (wlRes && wlRes.ok) {
          const wlData = await wlRes.json()
          setBrandName(wlData.brandName || "")
          setBrandLogo(wlData.brandLogo || "")
          setPrimaryColor(wlData.primaryColor || "#3B82F6")
          setCustomEmailSender(wlData.customEmailSender || "")
          setFaviconUrl(wlData.faviconUrl || "")
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error)
        toast.error("Gagal memuat pengaturan workspace")
      } finally {
        setLoading(false)
      }
    }

    if (tenantSlug && session?.user) {
      fetchData()
    }
  }, [tenantSlug, session])

  // Unified Save: Saves both general settings and branding simultaneously
  const handleSave = async () => {
    setSaving(true)
    try {
      const [settingsRes, brandRes] = await Promise.all([
        fetch(`/api/tenant/${tenantSlug}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            previewUrl,
            twoFactorRequired,
            ipWhitelist,
            allowedIps,
            auditLogging,
            smtpHost,
            smtpPort,
            smtpUser,
            smtpPassword,
            fromEmail,
            fromName,
          }),
        }),
        fetch(`/api/tenant/${tenantSlug}/white-label`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandName,
            brandLogo,
            primaryColor,
            customEmailSender,
            faviconUrl,
          }),
        }),
      ])

      if (settingsRes.ok && brandRes.ok) {
        toast.success("Seluruh pengaturan workspace dan branding berhasil disimpan!")
      } else {
        const sData = await settingsRes.json().catch(() => ({}))
        const bData = await brandRes.json().catch(() => ({}))
        toast.error(sData.error || bData.error || "Gagal menyimpan sebagian pengaturan")
      }
    } catch (error) {
      console.error("Failed to save:", error)
      toast.error("Terjadi kesalahan saat menghubungi server")
    } finally {
      setSaving(false)
    }
  }

  // Handle direct file upload for Logo or Favicon
  const handleFileUpload = async (file: File, type: "logo" | "favicon") => {
    if (!file) return

    const isLogo = type === "logo"
    if (isLogo) setUploadingLogo(true)
    else setUploadingFavicon(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/tenant/${tenantSlug}/media`, {
        method: "POST",
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        const uploadedFile = data.media?.[0] || data.file
        if (uploadedFile?.url) {
          if (isLogo) {
            setBrandLogo(uploadedFile.url)
            toast.success("Logo berhasil diunggah ke storage!")
          } else {
            setFaviconUrl(uploadedFile.url)
            toast.success("Favicon berhasil diunggah ke storage!")
          }
        } else {
          toast.error("Gagal mendapatkan URL berkas yang diunggah")
        }
      } else {
        const data = await res.json()
        toast.error(data.error || "Gagal mengunggah berkas gambar")
      }
    } catch (err) {
      console.error("Upload error:", err)
      toast.error("Terjadi kesalahan koneksi saat mengunggah berkas")
    } finally {
      if (isLogo) setUploadingLogo(false)
      else setUploadingFavicon(false)
    }
  }

  // Handle Test Email
  const handleSendTestEmail = async () => {
    if (!testEmailRecipient.trim()) {
      toast.error("Silakan masukkan alamat email penerima uji coba")
      return
    }

    if (!smtpHost.trim() || !smtpUser.trim() || !smtpPassword.trim()) {
      toast.error("Lengkapi terlebih dahulu SMTP Host, Username, dan Password pada form")
      return
    }

    setSendingTestEmail(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/email/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: testEmailRecipient.trim(),
          smtpHost,
          smtpPort: smtpPort || "587",
          smtpUser,
          smtpPassword,
          fromEmail,
          fromName,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || `Email uji coba berhasil dikirim ke ${testEmailRecipient}`)
        setShowTestEmailDialog(false)
      } else {
        toast.error(data.error || "Gagal mengirim email uji coba")
      }
    } catch {
      toast.error("Terjadi kesalahan saat mencoba mengirim email")
    } finally {
      setSendingTestEmail(false)
    }
  }

  // Handle Add Detected IP to Whitelist
  const handleAddCurrentIp = () => {
    if (!detectedIp) return
    const lines = allowedIps.split("\n").map((l) => l.trim()).filter(Boolean)
    if (!lines.includes(detectedIp)) {
      lines.push(detectedIp)
      setAllowedIps(lines.join("\n"))
      toast.success(`Alamat IP ${detectedIp} ditambahkan ke daftar whitelist.`)
    } else {
      toast.info(`IP ${detectedIp} sudah ada dalam daftar.`)
    }
  }

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/export`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${tenantSlug}-export-${new Date().toISOString().split("T")[0]}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success("Data workspace berhasil diekspor!")
      } else {
        toast.error("Gagal mengekspor data workspace")
      }
    } catch (error) {
      console.error("Export failed:", error)
      toast.error("Terjadi kesalahan saat ekspor data")
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (
      !(await confirm({
        title: "Impor berkas konfigurasi ini?",
        description: "Pengaturan workspace saat ini akan ditimpa oleh isi berkas.",
        confirmLabel: "Impor konfigurasi",
      }))
    )
      return

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/tenant/${tenantSlug}/import`, {
        method: "POST",
        body: formData,
      })

      if (res.ok) {
        toast.success("Data berhasil diimpor! Halaman akan dimuat ulang.")
        setTimeout(() => window.location.reload(), 1000)
      } else {
        const data = await res.json()
        toast.error(data.error || "Gagal mengimpor data")
      }
    } catch (error) {
      console.error("Import failed:", error)
      toast.error("Terjadi kesalahan saat impor data")
    } finally {
      setSaving(false)
      e.target.value = ""
    }
  }

  const handlePurgeAllContent = async () => {
    if (purgeConfirm !== "KOSONGKAN") {
      toast.error("Silakan ketik KOSONGKAN untuk mengonfirmasi")
      return
    }

    setPurging(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/content`, {
        method: "DELETE",
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || "Seluruh entri konten berhasil dikosongkan.")
        setShowPurgeDialog(false)
        setPurgeConfirm("")
      } else {
        toast.error(data.error || "Gagal mengosongkan entri konten")
      }
    } catch (error) {
      console.error("Purge failed:", error)
      toast.error("Gagal menghubungi server")
    } finally {
      setPurging(false)
    }
  }

  const handleDeleteWorkspace = async () => {
    if (deleteConfirm !== tenantSlug) {
      toast.error("Silakan ketik slug workspace untuk konfirmasi penghapusan")
      return
    }

    if (!currentTenant?.id) {
      toast.error("ID workspace tidak ditemukan")
      return
    }

    try {
      const res = await fetch(`/api/tenants/${currentTenant.id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        toast.success("Workspace berhasil dihapus")
        window.location.href = "/dashboard"
      } else {
        const data = await res.json()
        toast.error(data.error || "Gagal menghapus workspace")
      }
    } catch (error) {
      console.error("Delete failed:", error)
      toast.error("Terjadi kesalahan saat menghapus workspace")
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 flex-col w-full">
        <div className="flex-1 bg-background text-foreground flex flex-col w-full">
          <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
            <div className="space-y-1.5 pb-2 border-b border-border/60">
              <Skeleton className="h-8 w-56 rounded-xl" />
              <Skeleton className="h-3.5 w-80 max-w-full rounded-md" />
            </div>

            <div className="flex gap-2 border-b border-border/60 pb-2 overflow-x-auto">
              <Skeleton className="h-9 w-28 rounded-xl shrink-0" />
              <Skeleton className="h-9 w-28 rounded-xl shrink-0" />
              <Skeleton className="h-9 w-32 rounded-xl shrink-0" />
              <Skeleton className="h-9 w-32 rounded-xl shrink-0" />
            </div>

            <Card className="border border-border/80 shadow-xs bg-card rounded-2xl p-6 space-y-6">
              <div className="space-y-1.5 border-b border-border/60 pb-4">
                <Skeleton className="h-5 w-40 rounded-md" />
                <Skeleton className="h-3.5 w-64 rounded-md" />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28 rounded-md" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              </div>

              <div className="pt-4 border-t border-border/60 flex justify-end">
                <Skeleton className="h-10 w-32 rounded-xl" />
              </div>
            </Card>
          </div>
        </div>
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
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Building2 className="h-4 w-4" />
                </div>
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">
                  Pengaturan Workspace
                </h1>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold rounded-full uppercase">
                  {plan}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Kelola informasi umum workspace, branding kustom, kredensial SMTP, kebijakan keamanan, dan kuota pemakaian.
              </p>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 rounded-xl shadow-xs shrink-0"
            >
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Simpan Perubahan
            </Button>
          </div>

          {/* Quick Overview Stats */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card className="rounded-2xl border-border/80 shadow-xs bg-card">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Paket Layanan</p>
                <div className="text-xl font-black text-foreground capitalize flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-primary" />
                  {plan}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 shadow-xs bg-card">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Status Workspace</p>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {subscriptionStatus === "trialing" ? (
                    <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-bold rounded-full">
                      Trial {daysRemaining !== null ? `(${daysRemaining} Hari)` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold rounded-full">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> {tenantStatus}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 shadow-xs bg-card">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Content Types</p>
                <div className="text-xl font-black text-foreground flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-primary" />
                  {contentTypes.length} Model
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 shadow-xs bg-card">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Peran Anda</p>
                <div className="text-xl font-black text-foreground capitalize flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-primary" />
                  {currentTenant?.role || "Owner"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Settings Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-muted/40 border border-border/80 p-1.5 rounded-2xl flex flex-wrap max-w-full h-auto gap-1.5">
              <TabsTrigger 
                value="general" 
                className="rounded-xl font-bold text-xs py-2 px-3.5 transition-all text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <Building2 className="h-3.5 w-3.5 mr-1.5" />
                General
              </TabsTrigger>

              <TabsTrigger 
                value="white-label" 
                className="rounded-xl font-bold text-xs py-2 px-3.5 transition-all text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                White-Label & Branding
              </TabsTrigger>

              <TabsTrigger 
                value="email" 
                className="rounded-xl font-bold text-xs py-2 px-3.5 transition-all text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Email SMTP
              </TabsTrigger>

              <TabsTrigger 
                value="security" 
                className="rounded-xl font-bold text-xs py-2 px-3.5 transition-all text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                Keamanan
              </TabsTrigger>

              <TabsTrigger 
                value="usage" 
                className="rounded-xl font-bold text-xs py-2 px-3.5 transition-all text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs"
              >
                <Activity className="h-3.5 w-3.5 mr-1.5" />
                Penggunaan (Usage)
              </TabsTrigger>

              <TabsTrigger 
                value="danger" 
                className="rounded-xl font-bold text-xs py-2 px-3.5 transition-all text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 data-[state=active]:bg-rose-600 data-[state=active]:text-white data-[state=active]:shadow-xs"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Danger Zone
              </TabsTrigger>
            </TabsList>

            {/* TAB: GENERAL */}
            <TabsContent value="general" className="space-y-6">
              <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Informasi Profil Workspace
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Nama dan deskripsi yang mengidentifikasi workspace ini.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="workspace-name" className="text-xs font-semibold text-foreground">Nama Workspace</Label>
                      <Input
                        id="workspace-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="workspace-slug" className="text-xs font-semibold text-foreground">Slug URL Workspace</Label>
                      <Input
                        id="workspace-slug"
                        value={tenantSlug}
                        disabled
                        className="rounded-xl h-9 text-xs bg-muted/40 font-mono"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Slug URL bersifat permanen untuk isolasi tenant.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="workspace-description" className="text-xs font-semibold text-foreground">Deskripsi Workspace</Label>
                    <Textarea
                      id="workspace-description"
                      placeholder="Jelaskan tujuan atau proyek dari workspace ini..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="rounded-xl text-xs bg-background border-border/80"
                    />
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Paket Langganan</Label>
                      <Select value={plan} onValueChange={setPlan} disabled>
                        <SelectTrigger className="rounded-xl h-9 text-xs bg-muted/40 border-border/80 capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-card">
                          <SelectItem value="free" className="text-xs">Free</SelectItem>
                          <SelectItem value="starter" className="text-xs">Starter</SelectItem>
                          <SelectItem value="pro" className="text-xs">Pro</SelectItem>
                          <SelectItem value="enterprise" className="text-xs">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        Kelola atau upgrade paket Anda di menu Billing.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Status Workspace</Label>
                      <div className="h-9 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-bold capitalize rounded-lg bg-primary/10 text-primary border-primary/20">
                          {tenantStatus}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card: Live Preview URL */}
              <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-primary" />
                    Frontend Preview & Live Draft URL
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Tentukan URL website frontend untuk tombol &quot;Live Preview&quot; saat tim editorial mengedit draf konten.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="preview-url" className="text-xs font-semibold text-foreground">Preview Base URL</Label>
                    <Input
                      id="preview-url"
                      placeholder="http://localhost:3001/api/preview atau https://mywebsite.com/api/preview"
                      value={previewUrl}
                      onChange={(e) => setPreviewUrl(e.target.value)}
                      className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      CMS akan memicu URL ini saat tombol Live Preview diklik di editor konten.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: WHITE-LABEL & BRANDING */}
            <TabsContent value="white-label" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Brand Configuration Form */}
                <div className="lg:col-span-2 space-y-6">
                  <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                    <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          Kustomisasi Branding & Identitas Perusahaan
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px] font-bold border-primary/20 bg-primary/10 text-primary">
                          White-Label
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-muted-foreground mt-0.5">
                        Ganti logo, warna tema, dan identitas SaCMS dengan brand perusahaan Anda.
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="p-5 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="brandName" className="text-xs font-semibold text-foreground">Nama Brand / Perusahaan</Label>
                          <Input
                            id="brandName"
                            placeholder="Contoh: DELVIA / Acme Corp"
                            value={brandName}
                            onChange={(e) => setBrandName(e.target.value)}
                            className="rounded-xl h-9 text-xs bg-background border-border/80"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="primaryColor" className="text-xs font-semibold text-foreground">Warna Primer Tema</Label>
                          <div className="flex gap-2">
                            <Input
                              id="primaryColor"
                              placeholder="#3B82F6"
                              value={primaryColor}
                              onChange={(e) => setPrimaryColor(e.target.value)}
                              className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                            />
                            <input
                              type="color"
                              value={primaryColor || "#3B82F6"}
                              onChange={(e) => setPrimaryColor(e.target.value)}
                              className="h-9 w-9 cursor-pointer rounded-xl border border-border/80 p-0.5 bg-background shrink-0"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Logo URL + Direct Upload */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="brandLogo" className="text-xs font-semibold text-foreground">Logo Perusahaan</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => logoFileInputRef.current?.click()}
                            disabled={uploadingLogo}
                            className="h-6 px-2 text-[11px] font-bold text-primary hover:text-primary/90"
                          >
                            {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                            Unggah Gambar Logo
                          </Button>
                          <input
                            ref={logoFileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleFileUpload(f, "logo")
                            }}
                            className="hidden"
                          />
                        </div>
                        <Input
                          id="brandLogo"
                          type="url"
                          placeholder="https://acme.com/logo.png atau unggah langsung"
                          value={brandLogo}
                          onChange={(e) => setBrandLogo(e.target.value)}
                          className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                        />
                      </div>

                      {/* Favicon URL + Direct Upload */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="faviconUrl" className="text-xs font-semibold text-foreground">Favicon Browser</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => faviconFileInputRef.current?.click()}
                            disabled={uploadingFavicon}
                            className="h-6 px-2 text-[11px] font-bold text-primary hover:text-primary/90"
                          >
                            {uploadingFavicon ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                            Unggah Favicon (.ico / .png)
                          </Button>
                          <input
                            ref={faviconFileInputRef}
                            type="file"
                            accept="image/*,.ico"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleFileUpload(f, "favicon")
                            }}
                            className="hidden"
                          />
                        </div>
                        <Input
                          id="faviconUrl"
                          type="url"
                          placeholder="https://acme.com/favicon.ico atau unggah langsung"
                          value={faviconUrl}
                          onChange={(e) => setFaviconUrl(e.target.value)}
                          className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="customEmailSender" className="text-xs font-semibold text-foreground">
                          Alamat Email Pengirim Kustom <span className="text-muted-foreground font-normal text-[11px]">(opsional)</span>
                        </Label>
                        <Input
                          id="customEmailSender"
                          type="email"
                          placeholder="noreply@acme.com"
                          value={customEmailSender}
                          onChange={(e) => setCustomEmailSender(e.target.value)}
                          className="rounded-xl h-9 text-xs bg-background border-border/80"
                        />
                      </div>

                      <div className="flex justify-end pt-3 border-t border-border/60">
                        <Button 
                          onClick={handleSave} 
                          disabled={saving} 
                          className="rounded-xl h-9 text-xs font-bold bg-primary text-primary-foreground shadow-xs px-4"
                        >
                          {saving ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Simpan Branding
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Live Brand Preview Card */}
                <div className="space-y-6">
                  <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                    <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                      <CardTitle className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-primary" />
                        Live Preview Tampilan Brand
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                      <div className="p-4 rounded-xl border border-border/80 bg-background/80 space-y-3">
                        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/50">
                          <div className="flex items-center gap-2">
                            {brandLogo ? (
                              <img src={brandLogo} alt="Logo" className="h-7 w-auto max-w-[100px] object-contain rounded" />
                            ) : (
                              <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                                {(brandName || name || "B")[0].toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs font-bold text-foreground truncate max-w-[120px]">
                              {brandName || name || "Brand Anda"}
                            </span>
                          </div>

                          <div 
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white shadow-xs"
                            style={{ backgroundColor: primaryColor || "#3B82F6" }}
                          >
                            Aksen Tombol
                          </div>
                        </div>

                        <div className="space-y-1.5 text-[11px] text-muted-foreground">
                          <div className="flex justify-between">
                            <span>Favicon Tab:</span>
                            <span className="font-mono text-foreground font-semibold truncate max-w-[130px]">
                              {faviconUrl ? "Kustom Aktif" : "Default"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Email Sender:</span>
                            <span className="font-mono text-foreground font-semibold truncate max-w-[130px]">
                              {customEmailSender || "noreply@sacms.cloud"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5 text-[11px] text-muted-foreground">
                        <p className="font-bold text-foreground flex items-center gap-1">
                          <Globe className="h-3 w-3 text-primary" /> Public Brand API Endpoint
                        </p>
                        <code className="block bg-background px-2 py-1 rounded font-mono text-[10px] border border-border/80 break-all">
                          GET /api/public/{tenantSlug}/brand
                        </code>
                      </div>
                    </CardContent>
                  </Card>
                </div>

              </div>
            </TabsContent>

            {/* TAB: EMAIL (SMTP) */}
            <TabsContent value="email" className="space-y-6">
              <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      Konfigurasi Pengiriman Email (SMTP)
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Gunakan server SMTP khusus untuk mengirimkan undangan anggota dan notifikasi workspace.
                    </CardDescription>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTestEmailRecipient(session?.user?.email || "")
                      setShowTestEmailDialog(true)
                    }}
                    className="rounded-xl text-xs font-bold h-9 border-border/80 flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="h-3.5 w-3.5 text-primary" />
                    Kirim Email Uji Coba
                  </Button>
                </CardHeader>
                <CardContent className="p-5 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="smtpHost" className="text-xs font-semibold text-foreground">SMTP Host</Label>
                      <Input
                        id="smtpHost"
                        placeholder="smtp.resend.com / smtp.mailgun.org"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtpPort" className="text-xs font-semibold text-foreground">SMTP Port</Label>
                      <Input
                        id="smtpPort"
                        placeholder="587 / 465"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="smtpUser" className="text-xs font-semibold text-foreground">SMTP Username</Label>
                      <Input
                        id="smtpUser"
                        placeholder="apikey / user@domain.com"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtpPassword" className="text-xs font-semibold text-foreground">SMTP Password / API Key</Label>
                      <Input
                        id="smtpPassword"
                        type="password"
                        placeholder="••••••••••••"
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80 font-mono"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="fromEmail" className="text-xs font-semibold text-foreground">Default From Email</Label>
                      <Input
                        id="fromEmail"
                        placeholder="notifications@yourbrand.com"
                        value={fromEmail}
                        onChange={(e) => setFromEmail(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fromName" className="text-xs font-semibold text-foreground">Default Sender Name</Label>
                      <Input
                        id="fromName"
                        placeholder="My Project Team"
                        value={fromName}
                        onChange={(e) => setFromName(e.target.value)}
                        className="rounded-xl h-9 text-xs bg-background border-border/80"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: SECURITY */}
            <TabsContent value="security" className="space-y-6">
              <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Kebijakan Keamanan & Audit Log
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Atur autentikasi 2FA, pembatasan IP Whitelist, dan pencatatan audit perubahan konten.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-semibold text-foreground">Wajibkan Two-Factor Authentication (2FA)</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Mengharuskan seluruh anggota tim mengaktifkan 2FA saat login ke workspace ini.
                      </p>
                    </div>
                    <Switch checked={twoFactorRequired} onCheckedChange={setTwoFactorRequired} />
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-semibold text-foreground">Pembatasan IP (IP Whitelist)</Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Batasi akses dashboard dan API hanya dari rentang alamat IP tepercaya.
                        </p>
                      </div>
                      <Switch checked={ipWhitelist} onCheckedChange={setIpWhitelist} />
                    </div>

                    {ipWhitelist && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-foreground">Daftar IP yang Diizinkan</Label>
                          {detectedIp && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleAddCurrentIp}
                              className="h-6 px-2 text-[11px] font-bold text-primary hover:text-primary/90"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Tambahkan IP Saya ({detectedIp})
                            </Button>
                          )}
                        </div>
                        <Textarea
                          placeholder="Masukkan IP atau subnet CIDR per baris:&#10;103.120.10.1&#10;192.168.1.0/24"
                          rows={4}
                          value={allowedIps}
                          onChange={(e) => setAllowedIps(e.target.value)}
                          className="rounded-xl text-xs font-mono bg-background border-border/80"
                        />
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-semibold text-foreground">Pencatatan Audit Log Lengkap</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Catat riwayat modifikasi skema, entri konten, dan aktivitas autentikasi anggota.
                      </p>
                    </div>
                    <Switch checked={auditLogging} onCheckedChange={setAuditLogging} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: USAGE */}
            <TabsContent value="usage" className="space-y-6">
              <UsageTab tenantSlug={tenantSlug} />
            </TabsContent>

            {/* TAB: DANGER ZONE */}
            <TabsContent value="danger" className="space-y-6">
              <Card className="rounded-2xl border border-rose-500/30 shadow-xs bg-rose-500/5 overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-rose-500/20 bg-rose-500/10">
                  <CardTitle className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Ekspor & Impor Data Cadangan Workspace
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Unduh data skema dan entri konten atau pulihkan dari berkas JSON cadangan.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={handleExport}
                      variant="outline"
                      className="rounded-xl h-9 text-xs font-bold border-border/80"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Ekspor Skema & Konten (.JSON)
                    </Button>

                    <label className="cursor-pointer">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl h-9 text-xs font-bold border-border/80 pointer-events-none"
                      >
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        Impor Data Cadangan (.JSON)
                      </Button>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImport}
                        className="hidden"
                      />
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* Danger: Purge All Content */}
              <Card className="rounded-2xl border border-rose-500/30 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                  <CardTitle className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Kosongkan Semua Entri Konten
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Menghapus seluruh rekaman entri konten di semua model, tetapi tetap mempertahankan struktur skema tipe konten.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Tindakan ini permanen dan tidak dapat dibatalkan.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPurgeConfirm("")
                      setShowPurgeDialog(true)
                    }}
                    className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 rounded-xl text-xs font-bold h-9"
                  >
                    Kosongkan Konten
                  </Button>
                </CardContent>
              </Card>

              {/* Instant Snapshot Backup */}
              <Card className="rounded-2xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Download className="h-4 w-4 text-primary" />
                      Cadangkan Data Workspace (Instant Snapshot Backup)
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Ekspor seluruh skema model konten, entri data JSONB, komponen, dan metadata media ke dalam satu berkas JSON terstruktur.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      window.location.href = `/api/tenant/${tenantSlug}/export`
                      toast.success("Mengunduh Snapshot Backup", {
                        description: "Berkas cadangan JSON sedang diunduh ke perangkat Anda.",
                      })
                    }}
                    className="rounded-xl text-xs font-bold h-9 border-border/80 flex items-center gap-1.5 shrink-0"
                  >
                    <Download className="h-3.5 w-3.5 text-primary" />
                    Unduh Snapshot Backup
                  </Button>
                </CardHeader>
              </Card>

              {/* Danger: Delete Workspace */}
              <Card className="rounded-2xl border border-rose-500 shadow-xs bg-rose-500/10 overflow-hidden">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Hapus Workspace Secara Permanen
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Menghapus seluruh database workspace, media storage, token API, dan langganan secara permanen.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Tindakan ini tidak dapat diurungkan kembali.</p>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleteConfirm("")
                      setShowDeleteDialog(true)
                    }}
                    className="rounded-xl text-xs font-bold h-9 bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    Hapus Workspace Ini
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>

          {/* Test Email SMTP Dialog */}
          <Dialog open={showTestEmailDialog} onOpenChange={setShowTestEmailDialog}>
            <DialogContent className="rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  Kirim Email Uji Coba (Test SMTP)
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Kirim email percobaan untuk memverifikasi bahwa konfigurasi server SMTP Anda berfungsi normal.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <Label className="text-xs font-semibold">Alamat Email Penerima Uji Coba:</Label>
                <Input
                  type="email"
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  placeholder="admin@perusahaan.com"
                  className="rounded-xl text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Email ini akan dikirim menggunakan kredensial host <strong>{smtpHost || "Belum diisi"}</strong>:{smtpPort || "587"}.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setShowTestEmailDialog(false)}
                  className="rounded-xl text-xs font-bold h-9"
                >
                  Batal
                </Button>
                <Button
                  onClick={handleSendTestEmail}
                  disabled={sendingTestEmail || !testEmailRecipient.trim()}
                  className="rounded-xl text-xs font-bold h-9 bg-primary text-primary-foreground"
                >
                  {sendingTestEmail ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Kirim Email Sekarang
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Safe Purge Content Dialog */}
          <Dialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
            <DialogContent className="rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Konfirmasi Kosongkan Konten
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Tindakan ini akan menghapus <strong>seluruh entri konten</strong> pada semua model di workspace ini secara permanen.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <Label className="text-xs font-semibold">
                  Ketik <span className="font-mono font-bold text-rose-600 dark:text-rose-400">KOSONGKAN</span> untuk mengonfirmasi:
                </Label>
                <Input
                  value={purgeConfirm}
                  onChange={(e) => setPurgeConfirm(e.target.value)}
                  placeholder="KOSONGKAN"
                  className="rounded-xl text-xs font-mono border-rose-500/40"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setShowPurgeDialog(false)}
                  className="rounded-xl text-xs font-bold h-9"
                >
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  onClick={handlePurgeAllContent}
                  disabled={purgeConfirm !== "KOSONGKAN" || purging}
                  className="rounded-xl text-xs font-bold h-9 bg-rose-600 hover:bg-rose-700"
                >
                  {purging ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Ya, Kosongkan Semua Konten
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Workspace Dialog */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent className="rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-rose-600 dark:text-rose-400">
                  Konfirmasi Hapus Workspace
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Tindakan ini akan menghapus workspace <strong>{name}</strong> beserta seluruh data di dalamnya secara permanen.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <Label className="text-xs font-semibold">
                  Ketik slug <span className="font-mono font-bold text-foreground">{tenantSlug}</span> untuk mengonfirmasi:
                </Label>
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={tenantSlug}
                  className="rounded-xl text-xs font-mono"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                  className="rounded-xl text-xs font-bold h-9"
                >
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteWorkspace}
                  disabled={deleteConfirm !== tenantSlug}
                  className="rounded-xl text-xs font-bold h-9 bg-rose-600 hover:bg-rose-700"
                >
                  Ya, Hapus Permanen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </div>
  )
}
