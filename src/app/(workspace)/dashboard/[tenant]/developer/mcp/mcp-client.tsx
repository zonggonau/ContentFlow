"use client"

import { useState, useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Link from "next/link"
import { 
  Copy, Check, Plug, Bot, Globe, ExternalLink,
  Code2, Key, Server, Sparkles, Database, Layers, Webhook,
  Plus, Trash2, ShieldCheck, Loader2, Info, CheckCircle2,
  Cpu, Search, Image, GitBranch, FileCode2, Wand2, Lightbulb,
  Lock, AlertTriangle, ArrowUpRight, HardDrive, Download, FileCode, BookOpen
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import { createMcpTokenAction, deleteMcpTokenAction } from "@/actions/mcp-tokens"

interface MCPTokenItem {
  id: string
  name: string
  type?: string
  token?: string
  description: string | null
  createdAt: string
  lastUsedAt?: string | null
}

interface ApiKeyItem {
  id: string
  name: string
  key: string
  /** true when `key` above is a masked preview, not the real usable value. */
  keyIsMasked?: boolean
  createdAt: string
  lastUsed?: string | null
}

interface MCPDashboardClientProps {
  tenantSlug: string
  tenantId: string
  plan?: string
  isPaid?: boolean
  hostingType?: "shared_vercel" | "dedicated_vps"
  subscriptionStatus?: string
  vpsDetails?: {
    hostname: string | null
    ipv4: string | null
    status: string
    plan: string
    cpuCount: number
    ramMb: number
  } | null
  existingTokens: MCPTokenItem[]
  existingApiKeys?: ApiKeyItem[]
}

// ─── Config generators per platform ──────────────────────────────────────────

function generateConfig(platform: string, mcpUrl: string, token: string = "YOUR_MCP_TOKEN", tenantSlug: string = "workspace"): string {
  switch (platform) {
    case "antigravity":
      return JSON.stringify({
        mcpServers: {
          sacms: {
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      }, null, 2)

    case "vscode":
      return JSON.stringify({
        servers: {
          sacms: {
            type: "http",
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      }, null, 2)

    default:
      return mcpUrl
  }
}

// ─── Platform definitions (hanya Antigravity & VS Code yang didukung) ───────

interface PlatformInfo {
  id: string
  name: string
  icon: string
  badge: string
  badgeColor: string
  configPath: string
  steps: string[]
  notes?: string[]
}

const PLATFORMS: PlatformInfo[] = [
  {
    id: "antigravity",
    name: "Antigravity (AGY)",
    icon: "⚡",
    badge: "DeepMind Agent",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    configPath: ".agents/mcp_config.json",
    steps: [
      "Buka atau buat file .agents/mcp_config.json di root workspace project Anda.",
      "Salin atau klik tombol 'Unduh File (.json)' di atas.",
      "Token otorisasi aktif otomatis disematkan pada konfigurasi.",
      "Antigravity akan otomatis mendeteksi server MCP 'sacms' saat proses tasking dimulai.",
      "Prompt contoh: 'Gunakan MCP sacms untuk query schema CMS dan buatkan Server Action untuk mutasi artikel.'"
    ]
  },
  {
    id: "vscode",
    name: "VS Code (Copilot)",
    icon: "🐙",
    badge: "GitHub Copilot",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    configPath: ".vscode/mcp.json",
    steps: [
      "Buat file .vscode/mcp.json di root project Anda.",
      "Salin dan tempelkan konfigurasi JSON di bawah.",
      "Buka GitHub Copilot Chat dan beralih ke mode Agent.",
      "Tool MCP SaCMS akan otomatis terdaftar dan siap dipanggil."
    ]
  }
]

// ─── Live Catalog Tools List ─────────────────────────────────────────────────

interface McpToolDoc {
  name: string
  category: "schema" | "content" | "single" | "webhook" | "hosting" | "member"
  description: string
  inputs: string[]
}

// Kept in sync by hand with the real server.registerTool(...) calls in
// src/app/api/mcp/[[...transport]]/route.ts — names, descriptions, and
// top-level input keys below are transcribed from that file, not invented.
// A previous version of this catalog listed tool names (list_entries,
// get_entry, create_entry, bulk_create_entries, get_api_docs, etc.) that
// never existed on the server — anyone following those names or the "IDE
// Recipes" examples referencing them got a hard MCP error.
const MCP_TOOLS_CATALOG: McpToolDoc[] = [
  { name: "get_full_schema", category: "schema", description: "Mengambil seluruh skema database workspace — semua Content Types, Single Types, dan Components beserta field-nya. Panggil ini PERTAMA saat membangun/scaffolding aplikasi frontend.", inputs: [] },
  { name: "list_field_types", category: "schema", description: "Mendaftar seluruh 33 tipe field resmi SaCMS (text, richText, currency, relation, repeater, mediaMultiple, dll.) beserta aturan validasi dan opsi konfigurasi.", inputs: ["category?"] },
  { name: "list_content_types", category: "schema", description: "Mendaftar seluruh Content Type (koleksi seperti artikel, produk, kategori) beserta skema field dan jumlah entri.", inputs: [] },
  { name: "get_content_type", category: "schema", description: "Mengambil skema detail dan metadata dari satu Content Type berdasarkan slug atau ID.", inputs: ["slug"] },
  { name: "create_content_type", category: "schema", description: "Membuat Content Type (koleksi) baru lengkap dengan daftar field skema.", inputs: ["name", "slug", "description", "fields"] },
  { name: "update_content_type", category: "schema", description: "Memperbarui nama/deskripsi Content Type, atau menambah/mengganti field skemanya.", inputs: ["slug", "name", "description", "fields"] },
  { name: "delete_content_type", category: "schema", description: "Menghapus permanen Content Type, skema field-nya, dan seluruh entri konten tersimpan di dalamnya.", inputs: ["slug"] },

  { name: "query_content", category: "content", description: "Mengambil entri konten (published atau draft) dari satu Content Type dengan pagination, pencarian, dan sorting.", inputs: ["contentTypeSlug", "page", "limit", "status", "search", "locale", "sortOrder"] },
  { name: "get_content_entry", category: "content", description: "Mengambil data lengkap satu entri konten spesifik berdasarkan ID uniknya.", inputs: ["id"] },
  { name: "create_content_entry", category: "content", description: "Menambahkan entri konten baru ke sebuah Content Type dengan payload data JSON.", inputs: ["contentTypeSlug", "data", "status", "locale"] },
  { name: "update_content_entry", category: "content", description: "Memperbarui entri konten yang sudah ada berdasarkan ID-nya.", inputs: ["id", "data", "status"] },
  { name: "delete_content_entry", category: "content", description: "Menghapus satu entri konten spesifik berdasarkan ID.", inputs: ["id"] },

  { name: "list_single_types", category: "single", description: "Mendaftar seluruh Single Type (skema halaman tunggal seperti Homepage, Pengaturan Situs).", inputs: [] },
  { name: "get_single_type", category: "single", description: "Mengambil skema field dan data konten tersimpan dari satu Single Type.", inputs: ["singleTypeSlug", "locale?"] },
  { name: "create_single_type", category: "single", description: "Membuat Single Type baru (skema halaman tunggal, mis. 'Homepage', 'Halaman Kontak') dengan field dan data awal opsional.", inputs: ["name", "slug", "description", "fields", "initialData", "locale?"] },
  { name: "update_single_type", category: "single", description: "Memperbarui nama, deskripsi, atau menambah/mengganti skema field pada sebuah Single Type.", inputs: ["singleTypeSlug", "name", "description", "fields"] },
  { name: "update_single_type_content", category: "single", description: "Menyimpan/memperbarui nilai data singleton pada sebuah Single Type (mis. judul hero banner, link footer).", inputs: ["singleTypeSlug", "data", "locale?"] },
  { name: "delete_single_type", category: "single", description: "Menghapus permanen sebuah Single Type, skema field, dan data kontennya.", inputs: ["singleTypeSlug"] },

  { name: "list_components", category: "single", description: "Mendaftar seluruh Component reusable (mis. Hero Section, Feature Card, FAQ Item) beserta skema field-nya.", inputs: [] },
  { name: "get_component", category: "single", description: "Mengambil skema field dan metadata dari satu Component berdasarkan slug atau ID.", inputs: ["componentSlug"] },
  { name: "create_component", category: "single", description: "Membuat skema Component baru yang bisa dipakai berulang di dalam Content Type dan Single Type.", inputs: ["name", "slug", "category", "description", "fields"] },
  { name: "update_component", category: "single", description: "Memperbarui nama, kategori, deskripsi, atau menambah/mengganti skema field pada sebuah Component.", inputs: ["componentSlug", "name", "category", "description", "fields"] },
  { name: "delete_component", category: "single", description: "Menghapus permanen sebuah Component dan skema field-nya.", inputs: ["componentSlug"] },

  { name: "list_webhooks", category: "webhook", description: "Mendaftar seluruh webhook yang dikonfigurasi, event yang di-subscribe, URL, dan statusnya.", inputs: [] },
  { name: "get_webhook", category: "webhook", description: "Mengambil detail konfigurasi satu webhook spesifik berdasarkan ID-nya.", inputs: ["id"] },
  { name: "create_webhook", category: "webhook", description: "Mendaftarkan endpoint webhook baru untuk menerima notifikasi event CMS (mis. 'content.created', 'content.published').", inputs: ["name", "url", "events", "secret", "enabled"] },
  { name: "update_webhook", category: "webhook", description: "Memperbarui konfigurasi webhook yang ada (nama, URL, event yang di-subscribe, status aktif).", inputs: ["id", "name", "url", "events", "enabled"] },
  { name: "delete_webhook", category: "webhook", description: "Menghapus permanen sebuah konfigurasi webhook beserta riwayat log-nya.", inputs: ["id"] },
  { name: "test_webhook", category: "webhook", description: "Mengirimkan event test tiruan ke sebuah endpoint webhook untuk verifikasi konektivitas dan status respons.", inputs: ["id"] },

  { name: "inspect_api_capabilities", category: "webhook", description: "Memeriksa izin API key aktif (read, write, delete, schema, webhooks) untuk menentukan apakah membangun komponen read-only atau interaktif.", inputs: [] },
  { name: "get_api_info", category: "webhook", description: "Mengambil dokumentasi REST API lengkap, daftar endpoint, sintaks filtering, dan contoh kode integrasi untuk workspace ini.", inputs: ["baseUrl?"] },

  // Multi-Tenant End-User & Member Auth MCP Tools
  { name: "list_members", category: "member", description: "Mendaftar akun end-user/member website dengan filter pencarian, role, dan status.", inputs: ["page", "pageSize", "search", "role", "status"] },
  { name: "get_member", category: "member", description: "Mengambil data detail profil dan metadata member spesifik berdasarkan ID atau email.", inputs: ["idOrEmail"] },
  { name: "create_member", category: "member", description: "Mendaftarkan member baru secara programatik dengan password ter-hash bcrypt.", inputs: ["email", "password", "name", "role", "metadata"] },
  { name: "update_member", category: "member", description: "Mengubah profil member yang ada — role, status ('active'/'suspended'), password baru, atau metadata kustom.", inputs: ["idOrEmail", "name", "role", "status", "password", "metadata"] },
  { name: "delete_member", category: "member", description: "Menghapus permanen akun member dan me-revoke seluruh sesi login aktifnya.", inputs: ["idOrEmail"] },

  // Hosting & Cloud Deployment MCP Tools
  { name: "deploy_to_vercel", category: "hosting", description: "Deploy file source code website/frontend langsung ke Vercel Serverless hosting. Mengembalikan URL deployment produksi.", inputs: ["projectName", "files", "envVars"] },
  { name: "deploy_to_vps", category: "hosting", description: "Deploy project Next.js/Node langsung ke dedicated Contabo VPS workspace ini lewat SSH — build & restart otomatis, env dari tab Environment ikut disuntikkan. Untuk workspace paket VPS/VDS/Storage.", inputs: ["files", "domain?"] },
  { name: "get_vercel_deployment_status", category: "hosting", description: "Mengecek progres build, status ready, dan URL live dari sebuah deployment Vercel.", inputs: ["deploymentId"] },
  { name: "configure_vercel_domain", category: "hosting", description: "Menghubungkan dan memverifikasi domain kustom pada sebuah project Vercel, dengan diagnostik DNS.", inputs: ["projectId", "domain"] },
  { name: "add_vercel_env", category: "hosting", description: "Membuat / memperbarui environment variable pada project Vercel workspace ini (upsert). Nilai dienkripsi kecuali diawali NEXT_PUBLIC_. Ikut tampil di tab Environment dashboard.", inputs: ["key", "value", "projectId?", "targets?"] },
  { name: "make_vercel_deployment_public", category: "hosting", description: "Nonaktifkan proteksi 'Vercel Authentication' pada project Vercel workspace ini, agar URL deployment (termasuk URL per-deployment berakhiran acak) bisa dibuka siapa saja tanpa login Vercel.", inputs: ["projectId?"] },
  { name: "get_contabo_infrastructure_status", category: "hosting", description: "Memeriksa status kesehatan appliance VPS Contabo dedicated — alamat IP, spek CPU/RAM, dan status PostgreSQL/MinIO.", inputs: [] },
  { name: "provision_contabo_vps", category: "hosting", description: "Menjalankan provisioning otomatis VPS Contabo dedicated (PostgreSQL 17, Redis, MinIO S3) untuk workspace tier VPS berbayar.", inputs: ["plan", "region"] },
]

export function MCPDashboardClient({
  tenantSlug,
  tenantId,
  plan = "free",
  isPaid = false,
  hostingType = "shared_vercel",
  subscriptionStatus = "inactive",
  vpsDetails = null,
  existingTokens,
  existingApiKeys = [],
}: MCPDashboardClientProps) {
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [isPending, startTransition] = useTransition()

  // Protocol MCP Base URL
  const [mcpUrl, setMcpUrl] = useState("")
  useEffect(() => {
    if (hostingType === "dedicated_vps" && vpsDetails?.hostname) {
      setMcpUrl(`https://${vpsDetails.hostname}/api/mcp`)
    } else if (hostingType === "dedicated_vps" && vpsDetails?.ipv4) {
      setMcpUrl(`http://${vpsDetails.ipv4}:3000/api/mcp`)
    } else {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
      setMcpUrl(`${origin}/api/mcp`)
    }
  }, [hostingType, vpsDetails])

  // Token management state
  const [tokens, setTokens] = useState<MCPTokenItem[]>(existingTokens)
  const [apiKeys] = useState<ApiKeyItem[]>(existingApiKeys)
  const [newTokenName, setNewTokenName] = useState("")
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [generatedPlainToken, setGeneratedPlainToken] = useState<string | null>(null)
  const [selectedTokenValue, setSelectedTokenValue] = useState<string>("")
  const [copiedToken, setCopiedToken] = useState(false)
  const [activePlatform, setActivePlatform] = useState("antigravity")

  // Auto-select a default credential — but only one whose value is real and
  // reusable. ApiToken.token is never sent to the client at all (it's a
  // SHA-256 hash server-side; see page.tsx), so `tokens[].token` is always
  // absent here and can never be auto-selected. A masked ApiKey preview
  // isn't usable either — skip it the same way.
  useEffect(() => {
    if (!selectedTokenValue) {
      const usableKey = apiKeys.find((k) => !k.keyIsMasked)
      if (usableKey) {
        setSelectedTokenValue(usableKey.key)
      }
    }
  }, [tokens, apiKeys, selectedTokenValue])

  const handleCopy = async (text: string, label: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Disalin!",
        description: `${label} berhasil disalin ke clipboard`,
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Gagal Menyalin",
        description: `Gagal menyalin ${label.toLowerCase()}`,
      })
    }
  }

  const handleDownloadConfigFile = (platformId: string) => {
    const snippet = generateConfig(platformId, mcpUrl, effectiveToken, tenantSlug)
    const filename = platformId === "vscode" ? "mcp.json" : "mcp_config.json"

    const blob = new Blob([snippet], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: "File Konfigurasi Diunduh!",
      description: `File ${filename} berhasil diunduh. Letakkan di folder project sesuai petunjuk.`,
    })
  }

  const handleCreateToken = () => {
    if (!newTokenName.trim()) {
      toast({
        variant: "destructive",
        title: "Nama Token Wajib",
        description: "Masukkan nama deskriptif untuk token MCP Anda (misal: VS Code Dev)",
      })
      return
    }

    startTransition(async () => {
      const res = await createMcpTokenAction(tenantSlug, {
        name: newTokenName.trim(),
        description: `MCP Server Access for ${tenantSlug}`,
      })

      if (res.error) {
        toast({
          variant: "destructive",
          title: "Gagal Membuat Token",
          description: res.error,
        })
      } else {
        setGeneratedPlainToken(res.plainToken || null)
        if (res.plainToken) {
          setSelectedTokenValue(res.plainToken)
        }
        if (res.token) {
          // res.token (the persisted record) never carries a `.token` field —
          // the server only returns the real value once, as res.plainToken,
          // right here at creation time. Not stored in `tokens[]` at all:
          // once this session forgets it, it's gone, same as the DB (which
          // only ever has the hash).
          setTokens(prev => [{
            id: res.token.id,
            name: res.token.name,
            type: "mcp",
            description: res.token.description,
            createdAt: new Date().toISOString(),
          }, ...prev])
        }
        setNewTokenName("")
        setShowGenerateModal(false)
        toast({
          title: "Token MCP Berhasil Dibuat!",
          description: "Salin token Anda sekarang untuk dipasang di AI Client Anda.",
        })
      }
    })
  }

  const handleDeleteToken = async (tokenId: string) => {
    if (
      !(await confirm({
        title: "Hapus token MCP ini?",
        description: "AI Editor yang menggunakan token ini tidak akan bisa mengakses workspace lagi.",
        confirmLabel: "Hapus token",
        variant: "destructive",
      }))
    )
      return

    startTransition(async () => {
      const res = await deleteMcpTokenAction(tenantSlug, tokenId)
      if (res.error) {
        toast({
          variant: "destructive",
          title: "Gagal Menghapus",
          description: res.error,
        })
      } else {
        setTokens(prev => prev.filter(t => t.id !== tokenId))
        toast({
          title: "Token Dihapus",
          description: "Token MCP telah dicabut.",
        })
      }
    })
  }

  const currentPlatformInfo = PLATFORMS.find(p => p.id === activePlatform) || PLATFORMS[0]
  const effectiveToken = selectedTokenValue || generatedPlainToken || "YOUR_MCP_TOKEN"

  return (
    <div className="flex flex-1 flex-col w-full">
      {confirmDialog}
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Model Context Protocol (MCP)</h1>
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                    v2.0 SSE Live
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Hubungkan AI Editor (Antigravity, VS Code) ke SaCMS untuk manipulasi skema dan data real-time.
                </p>
              </div>
            </div>

            <Button
              onClick={() => setShowGenerateModal(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-9 px-4 text-xs shadow-xs shrink-0"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Generate Token MCP Baru
            </Button>
          </div>

          {/* Payment & Hosting Plan Status Card */}
          {!isPaid ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Akses MCP & AI Tools Terkunci (Langganan Belum Aktif)</h3>
                    <Badge variant="outline" className="text-[10px] bg-amber-500/20 border-amber-500/30 text-amber-800 dark:text-amber-300 font-bold uppercase">
                      Status: {subscriptionStatus}
                    </Badge>
                  </div>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1 max-w-2xl">
                    Endpoint MCP hanya dapat diakses saat workspace memiliki status pembayaran <strong>PAID</strong>. Silakan aktifkan langganan Anda untuk mulai menghubungkan Antigravity atau VS Code.
                  </p>
                </div>
              </div>
              <Link href={`/dashboard/${tenantSlug}/subscriptions`}>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs h-9 px-4 shrink-0 shadow-sm">
                  Aktifkan / Bayar Langganan <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                  hostingType === "dedicated_vps" 
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                )}>
                  {hostingType === "dedicated_vps" ? <Cpu className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      {hostingType === "dedicated_vps" ? "Dedicated Contabo VPS Appliance" : "Vercel Serverless (Shared Cloud)"}
                    </span>
                    <Badge className={cn(
                      "text-[9px] font-bold uppercase px-2 py-0.5",
                      hostingType === "dedicated_vps"
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    )}>
                      Plan: {plan.toUpperCase()} • PAID
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {hostingType === "dedicated_vps" && vpsDetails ? (
                      <>Instance VPS aktif: <strong>{vpsDetails.hostname || vpsDetails.ipv4}</strong> ({vpsDetails.cpuCount} vCPU, {Math.round(vpsDetails.ramMb / 1024)}GB RAM) • Unbuffered Native SSE Stream</>
                    ) : (
                      <>Berjalan di Vercel Serverless Edge Pool dengan auto-scaling dan shared multi-tenant database pool.</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5 font-mono">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> MCP Online
                </Badge>
              </div>
            </div>
          )}

          {/* Pure IDE MCP Endpoints Bar */}
          <div className="grid grid-cols-1 gap-4">

            {/* Server URL Card (MCP HTTP / SSE) */}
            <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    <p className="text-xs font-bold text-foreground">MCP Server (HTTP / SSE)</p>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase rounded-md bg-primary/10 text-primary border-primary/20">
                    Antigravity / VS Code
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Endpoint stream JSON-RPC 2.0 untuk Antigravity dan VS Code.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={mcpUrl || "http://localhost:3000/api/mcp"}
                  readOnly
                  className="font-mono text-xs bg-muted/30 border-border/80 rounded-xl h-9 text-foreground"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopy(mcpUrl, "MCP Server URL")}
                  className="h-9 px-3 rounded-xl text-xs font-bold shrink-0"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Salin URL
                </Button>
              </div>
            </Card>

          </div>

          {/* Active Token & Key Selector Bar */}
          <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-foreground">Kunci Otorisasi Aktif (Active Token / API Key)</p>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase rounded-md bg-muted/30">
                    Bearer Auth
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Token terpilih akan otomatis diinjeksikan pada seluruh contoh konfigurasi dan instruksi di bawah.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-48 sm:w-64">
                <Input
                  value={effectiveToken}
                  onChange={(e) => setSelectedTokenValue(e.target.value)}
                  placeholder="Masukkan token mcp_... atau cf_..."
                  className="font-mono text-xs bg-muted/30 border-border/80 rounded-xl h-9 text-foreground"
                />
              </div>

              {(tokens.length > 0 || apiKeys.length > 0) && (
                <Select value={selectedTokenValue} onValueChange={setSelectedTokenValue}>
                  <SelectTrigger className="h-9 w-36 rounded-xl text-xs bg-background border-border/80 shrink-0 font-medium">
                    <SelectValue placeholder="Pilih Kunci" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-card">
                    {/* Existing MCP tokens have no usable value here — the real
                        token is only ever known once, right after creation
                        (generatedPlainToken). Listed as disabled so the admin
                        can see the token exists without being able to select
                        a value that would silently copy nothing usable. */}
                    {tokens.map((t) => (
                      <SelectItem key={t.id} value={t.id} disabled className="text-xs font-mono opacity-60">
                        Token: {t.name} (buat ulang untuk menyalin)
                      </SelectItem>
                    ))}
                    {apiKeys.map((k) => (
                      <SelectItem key={k.id} value={k.key} disabled={k.keyIsMasked} className="text-xs font-mono">
                        API Key: {k.name}{k.keyIsMasked ? " (disamarkan)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  handleCopy(effectiveToken, "Token Otorisasi")
                  setCopiedToken(true)
                  setTimeout(() => setCopiedToken(false), 2000)
                }}
                className="h-9 px-3 rounded-xl text-xs font-bold shrink-0"
              >
                {copiedToken ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                {copiedToken ? "Disalin!" : "Salin"}
              </Button>
            </div>
          </Card>

          {/* Generated Token Success Callout */}
          {generatedPlainToken && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <p className="font-bold text-foreground">Token Baru Dibuat & Diaktifkan</p>
                  <p className="text-muted-foreground font-mono text-[11px] mt-0.5">{generatedPlainToken}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-xl text-xs font-bold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 shrink-0"
                onClick={() => handleCopy(generatedPlainToken, "Token MCP Baru")}
              >
                Salin Token
              </Button>
            </div>
          )}

          {/* Platform Setup Guides */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">Pilih Ekosistem AI & Platform Editor</h2>
                <p className="text-xs text-muted-foreground">Pilih platform AI Anda untuk melihat panduan setup step-by-step dan file konfigurasi instan.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {PLATFORMS.map((p) => {
                const isActive = activePlatform === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePlatform(p.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3.5 rounded-2xl border text-center transition-all duration-150",
                      isActive
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30"
                        : "border-border/80 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="text-2xl">{p.icon}</span>
                    <span className="text-xs font-bold text-foreground leading-tight">{p.name}</span>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 rounded-md font-bold uppercase", p.badgeColor)}>
                      {p.badge.split(" ")[0]}
                    </Badge>
                  </button>
                )
              })}
            </div>

            {/* Platform Detail & JSON Configuration Card */}
            <Card className="rounded-2xl border-border/80 shadow-xs bg-card overflow-hidden">
              <CardHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{currentPlatformInfo.icon}</span>
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      Setup {currentPlatformInfo.name}
                      <Badge className={cn("text-[10px] font-bold", currentPlatformInfo.badgeColor)}>
                        {currentPlatformInfo.badge}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Lokasi Konfigurasi: <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px] text-foreground font-bold">{currentPlatformInfo.configPath}</code>
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadConfigFile(currentPlatformInfo.id)}
                    className="border-border/80 text-foreground font-bold text-xs h-8 rounded-xl shadow-xs"
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Unduh File (.json)
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleCopy(generateConfig(currentPlatformInfo.id, mcpUrl, effectiveToken, tenantSlug), `Konfigurasi ${currentPlatformInfo.name}`)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-8 rounded-xl shadow-xs"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Salin Konfigurasi
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-5">
                {/* Steps List */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Langkah-Langkah Integrasi:</p>
                  <ol className="space-y-1.5 text-xs text-foreground list-decimal list-inside leading-relaxed">
                    {currentPlatformInfo.steps.map((step, idx) => (
                      <li key={idx} className="text-muted-foreground">
                        <span className="text-foreground font-medium">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* JSON Code Snippet */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-foreground">File Konfigurasi ({currentPlatformInfo.configPath})</Label>
                    <span className="text-[10px] text-muted-foreground font-mono">Token otomatis terinjeksi</span>
                  </div>
                  <pre className="p-4 bg-muted/40 rounded-xl border border-border/80 font-mono text-xs text-foreground overflow-x-auto">
                    {generateConfig(currentPlatformInfo.id, mcpUrl, effectiveToken, tenantSlug)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Catalog Tools, IDE Prompt Recipes & Recommendations Tabs */}
          <Tabs defaultValue="catalog" className="space-y-4">
            <TabsList className="bg-muted/40 border border-border/80 p-1 rounded-2xl grid grid-cols-3 max-w-lg h-auto gap-1">
              <TabsTrigger value="catalog" className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs">
                <Layers className="h-3.5 w-3.5 mr-1.5" />
                {MCP_TOOLS_CATALOG.length} Tools Live
              </TabsTrigger>
              <TabsTrigger value="recipes" className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                IDE Recipes 🚀
              </TabsTrigger>
              <TabsTrigger value="recommendations" className="rounded-xl font-bold text-xs py-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs">
                <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
                Roadmap (Belum Tersedia)
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Live tools catalog — count shown dynamically via MCP_TOOLS_CATALOG.length above, not hardcoded */}
            <TabsContent value="catalog" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {MCP_TOOLS_CATALOG.map((tool) => (
                  <Card key={tool.name} className="rounded-2xl border-border/80 shadow-xs bg-card p-4 space-y-2 hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-bold text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20">
                        {tool.name}
                      </code>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[9px] font-bold uppercase rounded-md",
                          tool.category === "hosting" && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
                          tool.category === "schema" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
                          tool.category === "content" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                          tool.category === "single" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                          tool.category === "webhook" && "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
                          tool.category === "member" && "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
                        )}
                      >
                        {tool.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {tool.description}
                    </p>
                    {tool.inputs.length > 0 && (
                      <div className="pt-1 flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-semibold">Params:</span>
                        {tool.inputs.map((param) => (
                          <span key={param} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
                            {param}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* TAB 2: IDE PROMPT RECIPES & SCAFFOLDER */}
            <TabsContent value="recipes" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Recipe 1: Typegen */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] font-bold">
                        TypeScript
                      </Badge>
                      <h3 className="text-sm font-bold text-foreground">1. Auto-Generate TypeScript Types</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy("Gunakan MCP sacms tool get_full_schema. Tolong generate file types/sacms.d.ts yang mendefinisikan TypeScript interface 100% type-safe untuk seluruh Content Types, Single Types, dan Components di workspace ini lengkap dengan JSDoc documentation.", "Prompt Typegen")}
                      className="h-7 px-2 text-xs font-bold text-primary"
                    >
                      <Copy className="h-3 w-3 mr-1" /> Salin Prompt
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Menghasilkan file deklarasi TypeScript (`.d.ts`) otomatis dari skema database live SaCMS untuk autocompletion di IDE.
                  </p>
                  <pre className="p-3 bg-muted/40 rounded-xl border border-border/60 font-mono text-[11px] text-foreground overflow-x-auto whitespace-pre-wrap">
                    Gunakan MCP sacms tool get_full_schema. Tolong generate file types/sacms.d.ts yang mendefinisikan TypeScript interface 100% type-safe untuk seluruh Content Types, Single Types, dan Components di workspace ini lengkap dengan JSDoc documentation.
                  </pre>
                </Card>

                {/* Recipe 2: Next.js 16 Scaffolder */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold">
                        Next.js 16
                      </Badge>
                      <h3 className="text-sm font-bold text-foreground">2. Scaffold Halaman Listing & Detail</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy("Gunakan MCP sacms tool get_content_type untuk koleksi 'articles'. Buatkan halaman listing app/blog/page.tsx dengan filter search dan pagination, serta detail app/blog/[slug]/page.tsx menggunakan React Server Components dan Tailwind CSS.", "Prompt Next.js Scaffolder")}
                      className="h-7 px-2 text-xs font-bold text-primary"
                    >
                      <Copy className="h-3 w-3 mr-1" /> Salin Prompt
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Membuat halaman frontend Next.js App Router lengkap dengan fetch data real-time, SEO meta tags, dan Tailwind CSS.
                  </p>
                  <pre className="p-3 bg-muted/40 rounded-xl border border-border/60 font-mono text-[11px] text-foreground overflow-x-auto whitespace-pre-wrap">
                    Gunakan MCP sacms tool get_content_type untuk koleksi 'articles'. Buatkan halaman listing app/blog/page.tsx dengan filter search dan pagination, serta detail app/blog/[slug]/page.tsx menggunakan React Server Components dan Tailwind CSS.
                  </pre>
                </Card>

                {/* Recipe 3: Schema Designer (33 Field Types) */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[10px] font-bold">
                        Schema Builder
                      </Badge>
                      <h3 className="text-sm font-bold text-foreground">3. Desain Content Type (33 Field Types)</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy("Panggil tool list_field_types untuk memeriksa tipe field yang didukung. Kemudian buatkan Content Type baru bernama 'Products' (slug: 'products') dengan field: title (text), slug (slug), description (richText), price (currency: IDR), gallery (mediaMultiple), status (select), dan category (relation ke 'categories').", "Prompt Schema Designer")}
                      className="h-7 px-2 text-xs font-bold text-primary"
                    >
                      <Copy className="h-3 w-3 mr-1" /> Salin Prompt
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Membuat model koleksi data baru langsung dari instruksi bahasa alami di IDE menggunakan 33 tipe field presisi.
                  </p>
                  <pre className="p-3 bg-muted/40 rounded-xl border border-border/60 font-mono text-[11px] text-foreground overflow-x-auto whitespace-pre-wrap">
                    Panggil tool list_field_types untuk memeriksa tipe field yang didukung. Kemudian buatkan Content Type baru bernama 'Products' (slug: 'products') dengan field: title (text), slug (slug), description (richText), price (currency: IDR), gallery (mediaMultiple), status (select), dan category (relation ke 'categories').
                  </pre>
                </Card>

                {/* Recipe 4: Batch Data Seeding */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-bold">
                        Mock Data
                      </Badge>
                      <h3 className="text-sm font-bold text-foreground">4. Batch Dummy Data Seeder</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy("Gunakan tool create_content_entry secara berulang untuk memasukkan 10 data dummy realistis ke koleksi 'products' lengkap dengan status PUBLISHED, harga, dan deskripsi berbahasa Indonesia.", "Prompt Batch Seeder")}
                      className="h-7 px-2 text-xs font-bold text-primary"
                    >
                      <Copy className="h-3 w-3 mr-1" /> Salin Prompt
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mengisi database CMS dengan banyak data contoh realistis untuk mempercepat pengujian UI frontend. Belum ada tool bulk-insert khusus — AI Editor akan memanggil create_content_entry berulang kali.
                  </p>
                  <pre className="p-3 bg-muted/40 rounded-xl border border-border/60 font-mono text-[11px] text-foreground overflow-x-auto whitespace-pre-wrap">
                    Gunakan tool create_content_entry secara berulang untuk memasukkan 10 data dummy realistis ke koleksi 'products' lengkap dengan status PUBLISHED, harga, dan deskripsi berbahasa Indonesia.
                  </pre>
                </Card>

                {/* Recipe 5: 1-Click Vercel Deploy */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[10px] font-bold">
                        Cloud Deploy
                      </Badge>
                      <h3 className="text-sm font-bold text-foreground">5. Deploy Frontend Langsung ke Vercel</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy("Deploy seluruh source code project frontend ini ke Vercel hosting menggunakan MCP tool deploy_to_vercel dengan project name 'my-sacms-app'.", "Prompt Vercel Deploy")}
                      className="h-7 px-2 text-xs font-bold text-primary"
                    >
                      <Copy className="h-3 w-3 mr-1" /> Salin Prompt
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Menerbitkan website ke internet dan mengembalikan live URL produksi dalam hitungan detik.
                  </p>
                  <pre className="p-3 bg-muted/40 rounded-xl border border-border/60 font-mono text-[11px] text-foreground overflow-x-auto whitespace-pre-wrap">
                    Deploy seluruh source code project frontend ini ke Vercel hosting menggunakan MCP tool deploy_to_vercel dengan project name 'my-sacms-app'.
                  </pre>
                </Card>

                {/* Recipe 6: Headless Member Auth & Login */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 text-[10px] font-bold">
                        Headless Auth
                      </Badge>
                      <h3 className="text-sm font-bold text-foreground">6. Scaffold Auth Register & Login Client</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(`Buatkan form autentikasi Next.js (app/login/page.tsx & app/register/page.tsx) yang memanggil endpoint Headless Auth SaCMS (/api/public/${tenantSlug}/auth/login dan /register), menyimpan Access Token JWT di cookie/localStorage, dan mengambil profil member dari /api/public/${tenantSlug}/auth/me.`, "Prompt Auth Scaffolder")}
                      className="h-7 px-2 text-xs font-bold text-primary"
                    >
                      <Copy className="h-3 w-3 mr-1" /> Salin Prompt
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Menghasilkan form login & register end-user lengkap dengan JWT access token, refresh token rotation, dan proteksi route.
                  </p>
                  <pre className="p-3 bg-muted/40 rounded-xl border border-border/60 font-mono text-[11px] text-foreground overflow-x-auto whitespace-pre-wrap">
                    Buatkan form autentikasi Next.js (app/login/page.tsx & app/register/page.tsx) yang memanggil endpoint Headless Auth SaCMS (/api/public/{tenantSlug}/auth/login dan /register), menyimpan Access Token JWT di cookie, dan mengambil profil member dari /api/public/{tenantSlug}/auth/me.
                  </pre>
                </Card>

              </div>
            </TabsContent>

            {/* TAB 3: RECOMMENDED MCP TOOLS — none of these exist yet on the
                server (see server.registerTool(...) calls in
                api/mcp/[[...transport]]/route.ts for the real, callable set
                shown on the catalog tab via MCP_TOOLS_CATALOG above). This
                tab is a roadmap of ideas, not documentation of live
                capability — an AI editor calling any tool name shown below
                will get a hard MCP error. */}
            <TabsContent value="recommendations" className="space-y-4">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Tool di tab ini <strong>belum diimplementasikan</strong> — ini adalah ide roadmap, bukan dokumentasi tool yang bisa dipanggil sekarang. Memanggil nama tool di bawah dari AI Editor akan menghasilkan error MCP.
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* 1. Media Assets */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                      <Image className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Media & Cloudflare R2 Management MCP Tool</h3>
                      <p className="text-[11px] text-muted-foreground">Upload gambar via URL langsung dari prompt AI agent.</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Memungkinkan AI agent mengunduh gambar dari internet, mengunggahnya ke Cloudflare R2 bucket SaCMS, menghasilkan thumbnail, dan mengaitkan media tersebut ke field entri artikel atau produk.
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">upload_media_by_url</code>
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">list_media_assets</code>
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">delete_media_asset</code>
                  </div>
                </Card>

                {/* 2. Vector & Semantic Search */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Search className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Semantic Vector Search MCP Tool (Pgvector)</h3>
                      <p className="text-[11px] text-muted-foreground">Pencarian konten berbasis makna dan konteks semantik.</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    AI agent dapat mencari entri artikel yang relevan secara konseptual menggunakan embedding vector tanpa harus bergantung pada pencarian kata kunci eksak (keyword matching).
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">semantic_search_entries</code>
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">get_similar_articles</code>
                  </div>
                </Card>

                {/* 3. Workflow State Machine */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <GitBranch className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Content Workflow & Review Approval Tool</h3>
                      <p className="text-[11px] text-muted-foreground">Kontrol siklus status draft, review, dan scheduled publish.</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Memfasilitasi AI workflow automation untuk mengajukan review konten (<code className="font-mono text-[10px]">IN_REVIEW</code>), menyetujui artikel (<code className="font-mono text-[10px]">APPROVED</code>), atau menjadwalkan publish otomatis.
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">publish_entry</code>
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">schedule_publish</code>
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">request_content_review</code>
                  </div>
                </Card>

                {/* 4. Automated TypeScript SDK Generator */}
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <FileCode2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Export TypeScript Interfaces & SDK Generator</h3>
                      <p className="text-[11px] text-muted-foreground">Otomatisasi pembuatan tipe data frontend Next.js.</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    AI Editor dapat meminta MCP untuk langsung meng-generate file <code className="font-mono text-[10px]">types/sacms.ts</code> dan klien fetch yang 100% type-safe sesuai skema Content Type yang baru dibuat.
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">export_typescript_types</code>
                    <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">generate_sdk_client</code>
                  </div>
                </Card>

              </div>
            </TabsContent>

          </Tabs>

          {/* Generate Token Modal */}
          <Dialog open={showGenerateModal} onOpenChange={setShowGenerateModal}>
            <DialogContent className="sm:max-w-md rounded-2xl border-border/80 bg-card">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-foreground">Generate Token MCP Baru</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Buat token otorisasi khusus untuk menghubungkan Antigravity atau VS Code.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-name" className="text-xs font-semibold text-foreground">Nama Klien / Editor</Label>
                  <Input
                    id="mcp-name"
                    placeholder="Contoh: Antigravity IDE / VS Code Local"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    className="rounded-xl h-9 text-xs bg-background border-border/80"
                  />
                </div>
                <div className="p-3 bg-muted/30 border border-border/60 rounded-xl text-xs text-muted-foreground">
                  Token ini memiliki hak akses penuh untuk membaca skema, mengubah model konten, dan mengelola entri data melalui protokol MCP.
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button variant="outline" onClick={() => setShowGenerateModal(false)} disabled={isPending} className="rounded-xl text-xs font-bold h-9">
                  Batal
                </Button>
                <Button onClick={handleCreateToken} disabled={isPending} className="rounded-xl text-xs font-bold h-9 bg-primary text-primary-foreground">
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  {isPending ? "Membuat Token..." : "Generate Token"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </div>
  )
}
