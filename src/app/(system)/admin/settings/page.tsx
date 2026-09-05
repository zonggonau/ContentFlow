"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Loader2, Save, Server, RefreshCw, Copy, Database, Check,
  Shield, Sparkles, Image as ImageIcon,
  AlertTriangle, CreditCard, Mail, Send, Eye, EyeOff, Bot, HardDrive
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { AdminPageSkeleton } from "@/components/admin/admin-page-skeleton"
import { v4 as uuidv4 } from "uuid"

export default function AdminSettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [purgingCache, setPurgingCache] = useState(false)
  const [testAiLoading, setTestAiLoading] = useState(false)
  const [testEmailLoading, setTestEmailLoading] = useState(false)
  const [testEmailRecipient, setTestEmailRecipient] = useState("")
  const [copied, setCopied] = useState(false)
  const [showMasks, setShowMasks] = useState<Record<string, boolean>>({})

  const toggleMask = (field: string) => {
    setShowMasks(prev => ({ ...prev, [field]: !prev[field] }))
  }

  // Secret fields arrive from GET /api/admin/settings pre-masked ("••••••••").
  // Revealing one fetches the real value on demand (audited server-side) so
  // plaintext secrets never sit in the page's initial payload.
  const revealSecret = async (maskField: string, settingsKey: string) => {
    if (showMasks[maskField]) {
      setShowMasks(prev => ({ ...prev, [maskField]: false }))
      return
    }
    try {
      const res = await fetch(`/api/admin/settings/reveal?key=${encodeURIComponent(settingsKey)}`)
      if (!res.ok) throw new Error("reveal failed")
      const data = await res.json()
      setSettings(prev => ({ ...prev, [settingsKey]: data.value ?? "" }))
      setShowMasks(prev => ({ ...prev, [maskField]: true }))
    } catch {
      toast({ variant: "destructive", title: "Gagal", description: "Gagal mengambil nilai rahasia." })
    }
  }

  // Comprehensive Settings State with robust defaults
  const [settings, setSettings] = useState({
    // Tab 1: Workspace & Registration
    globalTenantId: "sacms-global",
    registrationMode: "open",
    defaultUserPlan: "free",
    maxWorkspacesPerUser: "1",
    autoProvisionSeedData: "true",
    customDomainPolicy: "paid_only",
    defaultStorageLimitMb: "500",

    // Tab 2: Security & Gateway
    maintenanceMode: "false",
    maintenanceMessage: "Platform SaCMS sedang dalam pemeliharaan terjadwal. Silakan coba kembali beberapa saat lagi.",
    maintenanceIpWhitelist: "127.0.0.1",
    apiRateLimitPerMinute: "120",
    globalCorsPolicy: "wildcard",
    ipBlacklist: "",
    webhookMaxRetries: "3",

    // Tab 3: AI Engine & Providers
    platformAiProvider: "deepseek",
    platformAiApiKey: "",
    deepseekApiKey: "",
    openaiApiKey: "",
    geminiApiKey: "",
    anthropicApiKey: "",
    v0ApiKey: "",
    vercelAccessToken: "",
    defaultAiModel: "deepseek-chat",
    freePlanAiMonthlyWords: "10000",

    // Tab 4: Email & SMTP Delivery
    resendApiKey: "",
    resendFrom: "SaCMS <noreply@mail.sacms.cloud>",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: "false",
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "SaCMS <noreply@mail.sacms.cloud>",

    // Tab 5: Billing & Midtrans
    midtransMode: "sandbox",
    midtransServerKey: "",
    midtransClientKey: "",

    // Tab 6: Storage & Dedicated Infrastructure
    maxUploadFileSizeMb: "25",
    allowedFileExtensions: ".jpg, .jpeg, .png, .webp, .svg, .pdf, .mp4",
    autoWebpConvert: "true",
    autoGenerateThumbnails: "true",
    r2AccountId: "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    r2BucketName: "",
    r2PublicUrl: "",
    contaboClientId: "",
    contaboClientSecret: "",
    contaboApiUser: "",
    contaboApiPassword: "",

    // Retention
    auditLogRetentionDays: "90",
    apiLogRetentionDays: "14",
  })

  const generateTenantId = () => {
    const newId = "wks_" + uuidv4().replace(/-/g, '').substring(0, 24)
    setSettings((prev) => ({ ...prev, globalTenantId: newId }))
    toast({ title: "ID Workspace Baru Dibuat", description: "Klik 'Simpan Perubahan' untuk menerapkan pengaturan." })
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings")
      if (res.ok) {
        const data = await res.json()
        if (data.settings && Object.keys(data.settings).length > 0) {
          setSettings((prev) => ({ ...prev, ...data.settings }))
        }
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.user?.role === "super_admin") {
      fetchSettings()
      if (session.user.email) {
        setTestEmailRecipient(session.user.email)
      }
    }
  }, [session?.user?.id, session?.user?.role, session?.user?.email])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      })
      if (res.ok) {
        toast({ title: "Pengaturan Berhasil Disimpan", description: "Seluruh parameter konfigurasi platform berhasil disinkronkan ke database & Redis cache." })
      } else {
        throw new Error("Failed to save")
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat menyimpan pengaturan platform." })
    } finally {
      setSaving(false)
    }
  }

  const handlePurgeCache = async () => {
    if (
      !(await confirm({
        title: "Bersihkan seluruh cache Edge/Redis platform?",
        confirmLabel: "Bersihkan cache",
        variant: "destructive",
      }))
    )
      return
    setPurgingCache(true)
    try {
      const res = await fetch("/api/admin/settings/purge-cache", { method: "POST" })
      if (res.ok) {
        toast({ title: "Cache Dibersihkan", description: "Cache Edge/Redis platform berhasil di-flush." })
      } else {
        toast({ variant: "destructive", title: "Gagal", description: "Gagal membersihkan cache." })
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: e.message })
    } finally {
      setPurgingCache(false)
    }
  }

  const handleTestAi = async (targetProvider?: string, keyToTest?: string) => {
    const provider = targetProvider || settings.platformAiProvider || "deepseek"
    const apiKey = keyToTest || (
      provider === "deepseek" ? (settings.deepseekApiKey || settings.platformAiApiKey) :
      provider === "openai" ? settings.openaiApiKey :
      provider === "gemini" ? settings.geminiApiKey :
      provider === "anthropic" ? settings.anthropicApiKey : settings.platformAiApiKey
    )

    if (!apiKey) {
      toast({ variant: "destructive", title: "API Key Kosong", description: `Silakan masukkan API Key untuk ${provider} sebelum melakukan tes koneksi.` })
      return
    }

    setTestAiLoading(true)
    try {
      const res = await fetch("/api/admin/settings/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          model: settings.defaultAiModel
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({ title: "Koneksi AI Berhasil!", description: data.message })
      } else {
        toast({ variant: "destructive", title: "Uji Koneksi AI Gagal", description: data.message || "Gagal menghubungi AI provider." })
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: e.message || "Kesalahan jaringan" })
    } finally {
      setTestAiLoading(false)
    }
  }

  const handleTestEmail = async () => {
    if (!testEmailRecipient) {
      toast({ variant: "destructive", title: "Email Tujuan Kosong", description: "Silakan masukkan alamat email penerima untuk pengujian." })
      return
    }

    setTestEmailLoading(true)
    try {
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: testEmailRecipient,
          resendApiKey: settings.resendApiKey,
          resendFrom: settings.resendFrom,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpSecure: settings.smtpSecure,
          smtpUser: settings.smtpUser,
          smtpPass: settings.smtpPass,
          smtpFrom: settings.smtpFrom,
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({ title: "Email Berhasil Dikirim!", description: data.message })
      } else {
        toast({ variant: "destructive", title: "Uji Email Gagal", description: data.message || "Gagal mengirim email tes." })
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: e.message || "Kesalahan jaringan" })
    } finally {
      setTestEmailLoading(false)
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 flex-col w-full">
        <AdminPageSkeleton layout="form" cardsCount={0} />
      </div>
    )
  }

  if (session?.user?.role !== "super_admin") {
    router.push("/dashboard")
    return null
  }

  return (
    <div className="flex flex-1 flex-col w-full">
      {confirmDialog}
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Pengaturan Platform</h1>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold rounded-full">
                  Master Controls
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pusat kendali operasional, API keys pihak ketiga, email delivery, payment gateway, dan perizinan sistem SaCMS.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Button 
                onClick={handleSave} 
                disabled={saving} 
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 rounded-xl shadow-xs"
              >
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          </div>

          {/* Maintenance Mode Warning if Active */}
          {settings.maintenanceMode === "true" && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-amber-700 dark:text-amber-300 shadow-xs">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-xs">
                <strong className="font-bold">Mode Pemeliharaan Sedang Aktif:</strong> Dashboard workspace tenant saat ini dikunci untuk pengguna biasa.
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <Tabs defaultValue="ai_engine" className="space-y-6">
            <TabsList className="bg-muted/40 border border-border/80 p-1 rounded-2xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto gap-1">
              <TabsTrigger 
                value="ai_engine" 
                className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
              >
                <Bot className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
                Mesin AI
              </TabsTrigger>
              <TabsTrigger 
                value="email_smtp" 
                className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
              >
                <Mail className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
                Email & SMTP
              </TabsTrigger>
              <TabsTrigger 
                value="billing_payments" 
                className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
              >
                <CreditCard className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
                Payment Midtrans
              </TabsTrigger>
              <TabsTrigger 
                value="storage_infra" 
                className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
              >
                <HardDrive className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
                Storage & Infra
              </TabsTrigger>
              <TabsTrigger 
                value="workspaces" 
                className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
              >
                <Database className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
                Workspace
              </TabsTrigger>
              <TabsTrigger 
                value="security" 
                className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all"
              >
                <Shield className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
                Keamanan
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: MESIN AI & PROVIDERS */}
            <TabsContent value="ai_engine" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* AI Configuration */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                        <Bot className="h-4 w-4 text-primary" />
                        Provider AI Utama & Kuota
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold">
                        Dynamic Engine
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Pilih provider AI utama untuk generator konten, AI site builder, dan asisten redaksi.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Provider AI Aktif</Label>
                      <Select 
                        value={settings.platformAiProvider}
                        onValueChange={v => setSettings(prev => ({ ...prev, platformAiProvider: v as any }))}
                      >
                        <SelectTrigger className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-card">
                          <SelectItem value="deepseek" className="text-xs rounded-lg">DeepSeek AI (Rekomendasi V3 / Reasoner)</SelectItem>
                          <SelectItem value="openai" className="text-xs rounded-lg">OpenAI (GPT-4o, GPT-4o-mini)</SelectItem>
                          <SelectItem value="gemini" className="text-xs rounded-lg">Google Gemini (Gemini 1.5 Pro/Flash)</SelectItem>
                          <SelectItem value="anthropic" className="text-xs rounded-lg">Anthropic Claude (Claude 3.5 Sonnet/Haiku)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Model Default</Label>
                      <Input 
                        value={settings.defaultAiModel}
                        onChange={e => setSettings(prev => ({ ...prev, defaultAiModel: e.target.value }))}
                        placeholder="deepseek-chat, gpt-4o-mini, dll."
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Batas Kata Bulanan Plan Free</Label>
                      <Input 
                        type="number"
                        value={settings.freePlanAiMonthlyWords}
                        onChange={e => setSettings(prev => ({ ...prev, freePlanAiMonthlyWords: e.target.value }))}
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>

                    <div className="pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleTestAi()}
                        disabled={testAiLoading}
                        className="w-full text-xs font-bold rounded-xl border-border/80 h-9"
                      >
                        {testAiLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" />}
                        Uji Koneksi Provider AI Aktif
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* API Keys Management */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Koleksi Kunci API AI (Real-Time Fallback)
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Kunci yang diisi di sini akan langsung digunakan sistem tanpa perlu merestart server. Jika kosong, sistem otomatis fallback ke file <code>.env</code>.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    
                    {/* DeepSeek */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">DeepSeek API Key</Label>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('deepseek', 'deepseekApiKey')}>
                          {showMasks.deepseek ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showMasks.deepseek ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input 
                          type={showMasks.deepseek ? "text" : "password"}
                          value={settings.deepseekApiKey || settings.platformAiApiKey}
                          onChange={e => setSettings(prev => ({ ...prev, deepseekApiKey: e.target.value, platformAiApiKey: e.target.value }))}
                          placeholder="sk-cf74••••••••••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono flex-1"
                        />
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-9 text-xs rounded-xl"
                          onClick={() => handleTestAi('deepseek', settings.deepseekApiKey || settings.platformAiApiKey)}
                          disabled={testAiLoading}
                        >
                          Tes
                        </Button>
                      </div>
                    </div>

                    {/* OpenAI */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">OpenAI API Key</Label>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('openai', 'openaiApiKey')}>
                          {showMasks.openai ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showMasks.openai ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input 
                          type={showMasks.openai ? "text" : "password"}
                          value={settings.openaiApiKey}
                          onChange={e => setSettings(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                          placeholder="sk-proj-••••••••••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono flex-1"
                        />
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-9 text-xs rounded-xl"
                          onClick={() => handleTestAi('openai', settings.openaiApiKey)}
                          disabled={testAiLoading}
                        >
                          Tes
                        </Button>
                      </div>
                    </div>

                    {/* Google Gemini */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Google Gemini API Key</Label>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('gemini', 'geminiApiKey')}>
                          {showMasks.gemini ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showMasks.gemini ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input 
                          type={showMasks.gemini ? "text" : "password"}
                          value={settings.geminiApiKey}
                          onChange={e => setSettings(prev => ({ ...prev, geminiApiKey: e.target.value }))}
                          placeholder="AIzaSy••••••••••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono flex-1"
                        />
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-9 text-xs rounded-xl"
                          onClick={() => handleTestAi('gemini', settings.geminiApiKey)}
                          disabled={testAiLoading}
                        >
                          Tes
                        </Button>
                      </div>
                    </div>

                    {/* Anthropic Claude */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Anthropic Claude API Key</Label>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('anthropic', 'anthropicApiKey')}>
                          {showMasks.anthropic ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showMasks.anthropic ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input 
                          type={showMasks.anthropic ? "text" : "password"}
                          value={settings.anthropicApiKey}
                          onChange={e => setSettings(prev => ({ ...prev, anthropicApiKey: e.target.value }))}
                          placeholder="sk-ant-api03-••••••••••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono flex-1"
                        />
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-9 text-xs rounded-xl"
                          onClick={() => handleTestAi('anthropic', settings.anthropicApiKey)}
                          disabled={testAiLoading}
                        >
                          Tes
                        </Button>
                      </div>
                    </div>

                    {/* V0 & Vercel */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">v0 by Vercel API Key</Label>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('v0', 'v0ApiKey')}>
                            {showMasks.v0 ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                            {showMasks.v0 ? "Sembunyikan" : "Tampilkan"}
                          </Button>
                        </div>
                        <Input
                          type={showMasks.v0 ? "text" : "password"}
                          value={settings.v0ApiKey}
                          onChange={e => setSettings(prev => ({ ...prev, v0ApiKey: e.target.value }))}
                          placeholder="v1:••••••••••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vercel Access Token</Label>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('vercel', 'vercelAccessToken')}>
                            {showMasks.vercel ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                            {showMasks.vercel ? "Sembunyikan" : "Tampilkan"}
                          </Button>
                        </div>
                        <Input
                          type={showMasks.vercel ? "text" : "password"}
                          value={settings.vercelAccessToken}
                          onChange={e => setSettings(prev => ({ ...prev, vercelAccessToken: e.target.value }))}
                          placeholder="vcp_••••••••••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                        />
                      </div>
                    </div>

                  </CardContent>
                </Card>

              </div>
            </TabsContent>

            {/* TAB 2: EMAIL & SMTP DELIVERY */}
            <TabsContent value="email_smtp" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Resend & SMTP Config */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <Mail className="h-4 w-4 text-primary" />
                      Konfigurasi Pengiriman Email
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Pilih menggunakan Resend API atau SMTP kustom (Gmail, SendGrid, Mailgun, dll).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    
                    {/* Resend Section */}
                    <div className="space-y-1.5 p-3.5 bg-muted/20 rounded-xl border border-border/60">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resend API Key (Prioritas Utama)</Label>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('resend', 'resendApiKey')}>
                          {showMasks.resend ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showMasks.resend ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <Input
                        type={showMasks.resend ? "text" : "password"}
                        value={settings.resendApiKey}
                        onChange={e => setSettings(prev => ({ ...prev, resendApiKey: e.target.value }))}
                        placeholder="re_••••••••••••••••"
                        className="h-9 rounded-xl text-xs bg-background border-border/80 font-mono"
                      />
                      <div className="space-y-1 pt-1.5">
                        <Label className="text-[10px] font-bold text-muted-foreground">Pengirim Resend (From Address)</Label>
                        <Input 
                          value={settings.resendFrom}
                          onChange={e => setSettings(prev => ({ ...prev, resendFrom: e.target.value }))}
                          placeholder="SaCMS <noreply@mail.sacms.cloud>"
                          className="h-9 rounded-xl text-xs bg-background border-border/80"
                        />
                      </div>
                    </div>

                    {/* SMTP Fallback Section */}
                    <div className="space-y-3 p-3.5 bg-muted/20 rounded-xl border border-border/60">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SMTP Fallback Server</Label>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">SMTP Host</Label>
                          <Input 
                            value={settings.smtpHost}
                            onChange={e => setSettings(prev => ({ ...prev, smtpHost: e.target.value }))}
                            placeholder="smtp.gmail.com"
                            className="h-9 rounded-xl text-xs bg-background border-border/80"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">SMTP Port</Label>
                          <Input 
                            value={settings.smtpPort}
                            onChange={e => setSettings(prev => ({ ...prev, smtpPort: e.target.value }))}
                            placeholder="587"
                            className="h-9 rounded-xl text-xs bg-background border-border/80"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">SMTP User</Label>
                          <Input 
                            value={settings.smtpUser}
                            onChange={e => setSettings(prev => ({ ...prev, smtpUser: e.target.value }))}
                            placeholder="apikey atau user@domain.com"
                            className="h-9 rounded-xl text-xs bg-background border-border/80"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px] text-muted-foreground">SMTP Password</Label>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('smtp', 'smtpPass')}>
                              {showMasks.smtp ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                              {showMasks.smtp ? "Sembunyikan" : "Tampilkan"}
                            </Button>
                          </div>
                          <Input
                            type={showMasks.smtp ? "text" : "password"}
                            value={settings.smtpPass}
                            onChange={e => setSettings(prev => ({ ...prev, smtpPass: e.target.value }))}
                            placeholder="••••••••••••••••"
                            className="h-9 rounded-xl text-xs bg-background border-border/80 font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <Label className="text-xs text-foreground font-bold">Gunakan SSL/TLS Aman (Port 465)</Label>
                        <Switch 
                          checked={settings.smtpSecure === "true"}
                          onCheckedChange={c => setSettings(prev => ({ ...prev, smtpSecure: c ? "true" : "false" }))}
                        />
                      </div>
                    </div>

                  </CardContent>
                </Card>

                {/* Test Email Delivery */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <Send className="h-4 w-4 text-primary" />
                      Uji Coba Pengiriman Email Live
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Kirim email tes langsung ke kotak masuk Anda untuk memverifikasi autentikasi SMTP / Resend.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email Penerima Uji Coba</Label>
                      <Input 
                        type="email"
                        value={testEmailRecipient}
                        onChange={e => setTestEmailRecipient(e.target.value)}
                        placeholder="admin@domain.com"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>

                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                      <h4 className="text-xs font-bold text-primary">Informasi Email Otomatis SaCMS</h4>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Pengaturan email ini digunakan untuk:
                      </p>
                      <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
                        <li>Verifikasi alamat email pengguna saat mendaftar</li>
                        <li>Tautan reset kata sandi lupa login</li>
                        <li>Notifikasi tiket customer support dan pembayaran invoice</li>
                      </ul>
                    </div>

                    <Button 
                      onClick={handleTestEmail}
                      disabled={testEmailLoading}
                      className="w-full text-xs font-bold rounded-xl h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {testEmailLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                      {testEmailLoading ? "Mengirim Email Tes..." : "Kirim Email Uji Coba Sekarang"}
                    </Button>
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

            {/* TAB 3: PAYMENT & MIDTRANS */}
            <TabsContent value="billing_payments" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Payment Gateway Midtrans Snap
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Pengaturan kredensial Midtrans untuk QRIS, Virtual Account (BCA, Mandiri, BRI, BNI), dan Kartu Kredit.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mode Transaksi</Label>
                      <Select 
                        value={settings.midtransMode}
                        onValueChange={v => setSettings(prev => ({ ...prev, midtransMode: v as any }))}
                      >
                        <SelectTrigger className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-card">
                          <SelectItem value="sandbox" className="text-xs rounded-lg">Sandbox (Simulasi Pengujian)</SelectItem>
                          <SelectItem value="production" className="text-xs rounded-lg">Production (Pembayaran Asli QRIS / Bank)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Midtrans Server Key</Label>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('midtransServer', 'midtransServerKey')}>
                          {showMasks.midtransServer ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showMasks.midtransServer ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <Input 
                        type={showMasks.midtransServer ? "text" : "password"}
                        value={settings.midtransServerKey}
                        onChange={e => setSettings(prev => ({ ...prev, midtransServerKey: e.target.value }))}
                        placeholder="SB-Mid-server-••••••••••••"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Midtrans Client Key</Label>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => toggleMask('midtransClient')}>
                          {showMasks.midtransClient ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showMasks.midtransClient ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <Input 
                        type={showMasks.midtransClient ? "text" : "password"}
                        value={settings.midtransClientKey}
                        onChange={e => setSettings(prev => ({ ...prev, midtransClientKey: e.target.value }))}
                        placeholder="SB-Mid-client-••••••••••••"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                      />
                    </div>

                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold text-foreground">Webhook URL Notifikasi</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Salin URL ini dan masukkan ke Dashboard Midtrans $\rightarrow$ Settings $\rightarrow$ Configuration $\rightarrow$ Notification URL.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment Webhook URL</Label>
                      <div className="flex gap-2">
                        <Input 
                          readOnly 
                          value="https://sacms.cloud/api/billing/midtrans/webhooks"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                        />
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 rounded-xl text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText("https://sacms.cloud/api/billing/midtrans/webhooks")
                            toast({ title: "Tersalin", description: "Webhook URL Midtrans berhasil disalin." })
                          }}
                        >
                          Salin
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

            {/* TAB 4: STORAGE & INFRASTRUCTURE */}
            <TabsContent value="storage_infra" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Cloudflare R2 */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      Penyimpanan Berkas (Cloudflare R2 / AWS S3)
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Kredensial S3 Object Storage untuk media upload pustaka konten.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-3.5">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cloudflare R2 Account ID</Label>
                      <Input 
                        value={settings.r2AccountId}
                        onChange={e => setSettings(prev => ({ ...prev, r2AccountId: e.target.value }))}
                        placeholder="contoh: c8b9e6f••••••••••••"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-muted-foreground">Access Key ID</Label>
                        <Input 
                          value={settings.r2AccessKeyId}
                          onChange={e => setSettings(prev => ({ ...prev, r2AccessKeyId: e.target.value }))}
                          placeholder="AKIA••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold text-muted-foreground">Secret Access Key</Label>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('r2Secret', 'r2SecretAccessKey')}>
                            {showMasks.r2Secret ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                            {showMasks.r2Secret ? "Sembunyikan" : "Tampilkan"}
                          </Button>
                        </div>
                        <Input
                          type={showMasks.r2Secret ? "text" : "password"}
                          value={settings.r2SecretAccessKey}
                          onChange={e => setSettings(prev => ({ ...prev, r2SecretAccessKey: e.target.value }))}
                          placeholder="••••••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-muted-foreground">Bucket Name</Label>
                        <Input 
                          value={settings.r2BucketName}
                          onChange={e => setSettings(prev => ({ ...prev, r2BucketName: e.target.value }))}
                          placeholder="sacms-media"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-muted-foreground">Public CDN URL</Label>
                        <Input 
                          value={settings.r2PublicUrl}
                          onChange={e => setSettings(prev => ({ ...prev, r2PublicUrl: e.target.value }))}
                          placeholder="https://media.sacms.cloud"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Contabo Provisioner */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <Server className="h-4 w-4 text-primary" />
                      Otomatisasi Contabo Cloud VPS / VDS API
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Kredensial OAuth2 API Contabo untuk auto-provision Dedicated PostgreSQL & MinIO Appliance.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-3.5">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contabo Client ID</Label>
                      <Input 
                        value={settings.contaboClientId}
                        onChange={e => setSettings(prev => ({ ...prev, contaboClientId: e.target.value }))}
                        placeholder="INT-14950307"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contabo Client Secret</Label>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('contaboSecret', 'contaboClientSecret')}>
                          {showMasks.contaboSecret ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showMasks.contaboSecret ? "Sembunyikan" : "Tampilkan"}
                        </Button>
                      </div>
                      <Input
                        type={showMasks.contaboSecret ? "text" : "password"}
                        value={settings.contaboClientSecret}
                        onChange={e => setSettings(prev => ({ ...prev, contaboClientSecret: e.target.value }))}
                        placeholder="DZtSUAEP••••••••"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-muted-foreground">API User (Email)</Label>
                        <Input 
                          value={settings.contaboApiUser}
                          onChange={e => setSettings(prev => ({ ...prev, contaboApiUser: e.target.value }))}
                          placeholder="user@domain.com"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold text-muted-foreground">API Password</Label>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => revealSecret('contaboPass', 'contaboApiPassword')}>
                            {showMasks.contaboPass ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                            {showMasks.contaboPass ? "Sembunyikan" : "Tampilkan"}
                          </Button>
                        </div>
                        <Input
                          type={showMasks.contaboPass ? "text" : "password"}
                          value={settings.contaboApiPassword}
                          onChange={e => setSettings(prev => ({ ...prev, contaboApiPassword: e.target.value }))}
                          placeholder="••••••••••••"
                          className="h-9 rounded-xl text-xs bg-muted/20 border-border/80 font-mono"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

            {/* TAB 5: WORKSPACE & REGISTRATION */}
            <TabsContent value="workspaces" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Global Master Tenant */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <Database className="h-4 w-4 text-primary" />
                      ID Workspace Induk (System Master)
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Tenant global yang menyajikan data publik seperti Landing Page, Paket Langganan, dan Addon.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="global-tenant-id" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">ID Tenant Aktif</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input 
                            id="global-tenant-id" 
                            value={settings.globalTenantId} 
                            readOnly 
                            className="pr-9 font-mono text-xs bg-muted/20 border-border/80 rounded-xl h-9 text-foreground" 
                          />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground rounded-xl"
                            onClick={() => {
                              navigator.clipboard.writeText(settings.globalTenantId)
                              setCopied(true)
                              setTimeout(() => setCopied(false), 1500)
                              toast({ title: "Tersalin", description: "ID Workspace berhasil disalin" })
                            }}
                          >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        <Button 
                          variant="outline" 
                          onClick={generateTenantId}
                          className="text-xs font-bold rounded-xl border-border/80 h-9 shrink-0"
                        >
                          <RefreshCw className="mr-1.5 h-3 w-3 text-muted-foreground" />
                          Acak Baru
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* User Registration & Plan */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold text-foreground">Registrasi & Kebijakan Domain</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Batasan hak akses saat pengguna baru mendaftar di SaCMS.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mode Registrasi Akun</Label>
                      <Select 
                        value={settings.registrationMode} 
                        onValueChange={v => setSettings(prev => ({ ...prev, registrationMode: v as any }))}
                      >
                        <SelectTrigger className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-card">
                          <SelectItem value="open" className="text-xs rounded-lg">Terbuka untuk Umum (Open Signup)</SelectItem>
                          <SelectItem value="invite_only" className="text-xs rounded-lg">Hanya Melalui Undangan (Invite Only)</SelectItem>
                          <SelectItem value="closed" className="text-xs rounded-lg">Pendaftaran Ditutup (Closed)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Kebijakan Custom Domain</Label>
                      <Select 
                        value={settings.customDomainPolicy} 
                        onValueChange={v => setSettings(prev => ({ ...prev, customDomainPolicy: v as any }))}
                      >
                        <SelectTrigger className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-card">
                          <SelectItem value="paid_only" className="text-xs rounded-lg">Hanya Tenant Berlangganan Berbayar (Pro/Enterprise)</SelectItem>
                          <SelectItem value="all_plans" className="text-xs rounded-lg">Semua Paket Termasuk Free Plan</SelectItem>
                          <SelectItem value="disabled" className="text-xs rounded-lg">Nonaktifkan Custom Domain</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

            {/* TAB 6: KEAMANAN & RUNTIME */}
            <TabsContent value="security" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Maintenance & Rate Limit */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                      <Shield className="h-4 w-4 text-primary" />
                      Mode Pemeliharaan & Rate Limit
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Kendali akses global saat update server dan pembatasan traffic API.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between p-3.5 bg-muted/20 border border-border/60 rounded-xl">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-bold text-foreground">Mode Pemeliharaan (Maintenance)</Label>
                        <p className="text-[11px] text-muted-foreground">Kunci akses tenant saat maintenance terjadwal</p>
                      </div>
                      <Switch 
                        checked={settings.maintenanceMode === "true"}
                        onCheckedChange={c => setSettings(prev => ({ ...prev, maintenanceMode: c ? "true" : "false" }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pesan Pemeliharaan</Label>
                      <Input 
                        value={settings.maintenanceMessage}
                        onChange={e => setSettings(prev => ({ ...prev, maintenanceMessage: e.target.value }))}
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rate Limit Global (Request / Menit)</Label>
                      <Input 
                        type="number"
                        value={settings.apiRateLimitPerMinute}
                        onChange={e => setSettings(prev => ({ ...prev, apiRateLimitPerMinute: e.target.value }))}
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Log Retention */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold text-foreground">Retensi Log</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Log audit dan API request lebih lama dari batas ini akan otomatis dihapus oleh cron harian.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retensi Audit Log (Hari)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.auditLogRetentionDays}
                        onChange={e => setSettings(prev => ({ ...prev, auditLogRetentionDays: e.target.value }))}
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retensi API Request Log (Hari)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.apiLogRetentionDays}
                        onChange={e => setSettings(prev => ({ ...prev, apiLogRetentionDays: e.target.value }))}
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Edge Cache Purge */}
                <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
                  <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-sm font-bold text-foreground">Edge & Redis Cache Flushing</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Bersihkan seluruh cache respon API publik dan setting platform.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Tombol ini akan menghapus semua cache Redis untuk rate-limit, domain mapping, dynamic pricing, dan platform settings secara instan.
                    </p>
                    <Button 
                      variant="destructive"
                      onClick={handlePurgeCache}
                      disabled={purgingCache}
                      className="w-full text-xs font-bold rounded-xl h-9"
                    >
                      {purgingCache ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                      {purgingCache ? "Membersihkan Cache..." : "Purge All Edge & Redis Cache"}
                    </Button>
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

          </Tabs>

        </div>
      </div>
    </div>
  )
}
