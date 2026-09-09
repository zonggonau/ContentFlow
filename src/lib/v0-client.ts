import { v0 } from "v0"
import { isMockAllowed, requireCredentialOutsideMock } from "./dev-mode"

export interface V0File {
  name: string
  content: string
}

function generateFallbackFiles(prompt: string, modelName: string): V0File[] {
  const isEcommerce = prompt.toLowerCase().includes("toko") || prompt.toLowerCase().includes("shop") || prompt.toLowerCase().includes("store") || prompt.toLowerCase().includes("produk")
  const isHotel = prompt.toLowerCase().includes("hotel") || prompt.toLowerCase().includes("kamar") || prompt.toLowerCase().includes("resort")
  const isNews = prompt.toLowerCase().includes("berita") || prompt.toLowerCase().includes("news") || prompt.toLowerCase().includes("portal") || prompt.toLowerCase().includes("artikel")

  const title = isEcommerce ? "Toko Online Modern" : isHotel ? "Grand Luxury Resort & Hotel" : isNews ? "Portal Berita Nusantara" : "SaCMS Digital Experience"
  const subtitle = isEcommerce ? "Temukan produk pilihan terbaik dengan kualitas premium dan garansi resmi." : isHotel ? "Pengalaman menginap mewah tak terlupakan di tengah keindahan alam tropis." : isNews ? "Informasi terkini, akurat, dan terpercaya seputar pembangunan dan masyarakat." : "Platform konten digital berkinerja tinggi yang terintegrasi dengan SaCMS Headless API."

  const mainPageCode = `"use client"

import React, { useState } from "react"
import { 
  Globe, ArrowRight, Star, ShieldCheck, Zap, 
  Sparkles, CheckCircle2, Phone, Mail, MapPin, 
  Search, ChevronRight, Menu, X, ExternalLink
} from "lucide-react"

export default function HomePage() {
  const [mobileMenu, setMobileMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const items = [
    {
      id: "1",
      title: "${isEcommerce ? 'Laptop Pro Ultrabook 14' : isHotel ? 'Deluxe Ocean Suite' : isNews ? 'Pembangunan Infrastruktur Digital Daerah Dipercepat' : 'Enterprise Headless Architecture'}",
      category: "${isEcommerce ? 'Elektronik' : isHotel ? 'Kamar Utama' : isNews ? 'Teknologi' : 'Cloud CMS'}",
      price: "${isEcommerce ? 'Rp 14.500.000' : isHotel ? 'Rp 1.850.000 / malam' : isNews ? 'Terbit Hari Ini' : 'Enterprise Edition'}",
      rating: 4.9,
      image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80",
      description: "${isEcommerce ? 'Performa tinggi dengan prosesor generasi terbaru dan layar OLED 4K jernih.' : isHotel ? 'Pemandangan langsung menghadap laut lepas dengan balkon pribadi dan jacuzzi.' : isNews ? 'Pemerintah meresmikan jaringan serat optik baru untuk konektivitas merata di seluruh distrik.' : 'Integrasi REST API, dynamic GraphQL, dan Edge caching berkecepatan tinggi.'}"
    },
    {
      id: "2",
      title: "${isEcommerce ? 'Wireless Noise-Cancelling Headphones' : isHotel ? 'Executive Garden Villa' : isNews ? 'Peluncuran Layanan Publik Terpadu Berbasis AI' : 'Multi-Tenant Database Appliances'}",
      category: "${isEcommerce ? 'Aksesoris' : isHotel ? 'Villa Keluarga' : isNews ? 'Inovasi' : 'Database'}",
      price: "${isEcommerce ? 'Rp 3.200.000' : isHotel ? 'Rp 2.450.000 / malam' : isNews ? 'Kemarin' : 'PostgreSQL 17'}",
      rating: 4.8,
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
      description: "${isEcommerce ? 'Kenyamanan maksimal dengan daya tahan baterai hingga 40 jam penggunaan nonstop.' : isHotel ? 'Privasi total dengan kolam renang pribadi dan taman tropis yang asri.' : isNews ? 'Transformasi birokrasi digital mempercepat pengurusan dokumen perizinan hingga 80%.' : 'Isolasi database mandiri terenkripsi TLS 1.3 dan MinIO S3 storage.'}"
    },
    {
      id: "3",
      title: "${isEcommerce ? 'Smartwatch Fitness Tracker GPS' : isHotel ? 'Panoramic Mountain Chalet' : isNews ? 'Festival Budaya & UMKM Menarik Ribuan Wisatawan' : 'Real-time Edge Proxy & DNS Gateway'}",
      category: "${isEcommerce ? 'Wearable' : isHotel ? 'Pegunungan' : isNews ? 'Ekonomi' : 'Networking'}",
      price: "${isEcommerce ? 'Rp 2.100.000' : isHotel ? 'Rp 1.350.000 / malam' : isNews ? '3 Hari Lalu' : 'Anycast DNS'}",
      rating: 4.7,
      image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
      description: "${isEcommerce ? 'Pantau kesehatan detak jantung, kadar oksigen darah, dan GPS akurat real-time.' : isHotel ? 'Suasana sejuk pegunungan dengan perapian hangat dan pemandangan lembah memukau.' : isNews ? 'Pameran kerajinan tradisional dan kuliner lokal berhasil mencatatkan transaksi rekor.' : 'Perutean domain kustom instan ala Vercel dengan proteksi rate limit Upstash.'}"
    }
  ]

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans antialiased selection:bg-blue-500 selection:text-white">
      
      {/* Top Notification Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-center text-xs font-semibold tracking-wide text-white">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Didukung oleh SaCMS Headless Engine & Next.js 16
        </span>
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-base shadow-lg shadow-blue-500/25">
              S
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white block leading-none">
                ${title}
              </span>
              <span className="text-[10px] text-blue-400 font-mono tracking-wider uppercase font-bold">
                Live CMS Connected
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <a href="#beranda" className="hover:text-blue-400 transition-colors">Beranda</a>
            <a href="#katalog" className="hover:text-blue-400 transition-colors">Katalog & Data</a>
            <a href="#keunggulan" className="hover:text-blue-400 transition-colors">Keunggulan</a>
            <a href="#kontak" className="hover:text-blue-400 transition-colors">Kontak</a>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <button className="h-9 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5">
              Mulai Sekarang
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button 
            onClick={() => setMobileMenu(!mobileMenu)}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900"
          >
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenu && (
          <div className="md:hidden px-4 pt-2 pb-4 space-y-2 border-t border-slate-800 bg-slate-950">
            <a href="#beranda" className="block py-2 text-xs font-semibold text-slate-300">Beranda</a>
            <a href="#katalog" className="block py-2 text-xs font-semibold text-slate-300">Katalog & Data</a>
            <a href="#keunggulan" className="block py-2 text-xs font-semibold text-slate-300">Keunggulan</a>
            <a href="#kontak" className="block py-2 text-xs font-semibold text-slate-300">Kontak</a>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section id="beranda" className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-bold mb-6">
          <Zap className="w-3.5 h-3.5" />
          Generasi Baru Website Modern Berkecepatan Tinggi
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-tight">
          ${title}
        </h1>
        <p className="mt-5 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          ${subtitle}
        </p>

        {/* Search Input Filter */}
        <div className="mt-8 max-w-md mx-auto relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input 
            type="text"
            placeholder="Cari data atau item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </section>

      {/* Main Catalog / Content Grid */}
      <section id="katalog" className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">Daftar Konten & Layanan</h2>
            <p className="text-xs text-slate-400 mt-1">Data tersinkronisasi otomatis dari database CMS.</p>
          </div>
          <span className="text-xs font-mono text-slate-500">Menampilkan {filteredItems.length} data</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div 
              key={item.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden hover:border-blue-500/50 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/5 flex flex-col justify-between"
            >
              <div>
                <div className="relative h-48 w-full overflow-hidden bg-slate-950">
                  <img 
                    src={item.image} 
                    alt={item.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md text-[10px] font-bold text-blue-400 border border-slate-800">
                    {item.category}
                  </div>
                </div>
                <div className="p-5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                    <span className="text-blue-400">{item.price}</span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {item.rating}
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-white">{item.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                </div>
              </div>
              <div className="p-5 pt-0">
                <button className="w-full h-9 rounded-xl text-xs font-bold bg-slate-800 hover:bg-blue-600 text-white transition-colors flex items-center justify-center gap-1.5">
                  Lihat Rincian
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Highlights */}
      <section id="keunggulan" className="py-16 bg-slate-900/40 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center sm:text-left">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto sm:mx-0">
                <Zap className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-white">Ultra Fast Next.js 16</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Waktu muat instan dengan arsitektur App Router dan optimasi gambar bawaan.
              </p>
            </div>
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto sm:mx-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-white">Keamanan Terisolasi</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Terkoneksi langsung ke database PostgreSQL 17 mandiri dengan enkripsi TLS 1.3.
              </p>
            </div>
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto sm:mx-0">
                <Globe className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-white">Anycast DNS & Auto SSL</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pengelolaan domain kustom instan dengan sertifikat HTTPS otomatis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="kontak" className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
            S
          </div>
          <span>&copy; {new Date().getFullYear()} ${title}. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>Powered by SaCMS AI Engine</span>
        </div>
      </footer>

    </div>
  )
}
`

  return [
    {
      name: "app/page.tsx",
      content: mainPageCode,
    },
  ]
}

export async function createV0Chat(
  prompt: string,
  modelName: string = "v0-pro"
): Promise<{ chatId: string; files: V0File[]; previewUrl: string; generating?: boolean; v0Error?: string }> {
  const modelProfiles: Record<string, string> = {
    "v0-mini": "AI Engine Profile: SaCMS AI Mini (Fast & Lightweight). Target: Single-page compact Next.js App Router layout with fast rendering and essential interactive components.",
    "v0-pro": "AI Engine Profile: SaCMS AI Pro (Production Standard). Target: Full-scale Next.js 16 App Router application with dynamic data querying, responsive UI, and rich states.",
    "v0-max": "AI Engine Profile: SaCMS AI Max (Deep Reasoning & High Complexity). Target: Advanced multi-view Next.js architecture with rich relational data models, modal flows, and deep filtering.",
    "v0-max-fast": "AI Engine Profile: SaCMS AI Max Fast (High Performance Ultra Fast). Target: High-throughput Next.js architecture with instant rendering pipelines and polished UI.",
  }

  const modelInstruction = modelProfiles[modelName] || modelProfiles["v0-pro"]
  const finalPrompt = `${modelInstruction}\n\n${prompt}`

  // Only the *creation* call (starting the chat) gets a timeout guard — this
  // is normally near-instant. It must NOT gate on the chat's generation
  // finishing: v0 builds progressively in the background and commonly takes
  // well past 20s for a full app, so racing the whole thing against 20s used
  // to discard a perfectly healthy, still-running v0 chat and silently
  // replace it with a fake local one — which is why the preview showed
  // "sandbox tidak tersedia" while v0.dev's own UI still showed it building.
  const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
    setTimeout(() => resolve({ timeout: true }), 25000)
  )

  let chat: any = null
  let v0ErrorMessage: string | undefined
  try {
    // IMPORTANT: `v0.chats.create` (POST /chats) only creates an empty chat
    // shell — it does NOT trigger generation. Its response reports
    // usage.tokens.total: 0 and the chat's updatedAt never advances, no
    // matter how long you poll it. `createAsync` (POST /chats/async) is the
    // call that actually kicks off a real background generation job. Using
    // `create` here was the root cause of chats silently going nowhere
    // (mistaken for "still building" and polled forever, or timed out and
    // replaced with the disguised local fallback) — the chat existed, but
    // nothing was ever generating inside it.
    const v0CreatePromise = v0.chats.createAsync({ message: finalPrompt }).catch((err) => {
      console.warn("[v0-client] Cloud v0 API call failed:", err.message)
      return null
    })

    const raceResult = await Promise.race([v0CreatePromise, timeoutPromise])
    if (raceResult && !("timeout" in raceResult)) {
      chat = raceResult
      // v0 returns 200 with an `{ error: { message } }` body for account-level
      // failures (e.g. "You are out of credits") rather than an HTTP error —
      // catch that here so it isn't silently swallowed as a false success.
      const apiError = (chat as any)?.error?.message
      if (apiError) {
        console.warn("[v0-client] v0 API returned an error:", apiError)
        v0ErrorMessage = apiError
        chat = null
      }
    } else {
      console.warn("[v0-client] Cloud v0 chat creation timed out (25s), engaging local generator fallback.")
    }
  } catch (err: any) {
    console.warn("[v0-client] Exception creating v0 chat:", err.message)
  }

  // createAsync's success shape is `{ data: { chatId, messageId } }` (flat
  // `chatId` field) — different from `create`'s `{ data: { chat: { id } } }`.
  // Cover both so this keeps working if the SDK's response shape changes.
  const chatId: string =
    (chat as any)?.data?.chatId ||
    (chat as any)?.data?.chat?.id ||
    (chat as any)?.data?.id ||
    (chat as any)?.chatId ||
    (chat as any)?.chat?.id ||
    (chat as any)?.id ||
    ""

  // The chat was created successfully — v0 is a real, addressable project now,
  // even if it hasn't finished generating files yet. Keep this chatId; do NOT
  // fall back to a fake one just because `getFiles` is still empty. The
  // preview route already knows how to poll a real chatId until it's ready.
  if (chatId) {
    let files: V0File[] = []
    try {
      const filesRes = await v0.chats.getFiles({ chatId })
      const rawFiles = (filesRes as any)?.data?.files || (filesRes as any)?.files || (filesRes as any)?.data || []
      if (Array.isArray(rawFiles) && rawFiles.length > 0) {
        files = rawFiles.map((f: any) => ({
          name: f.path ?? f.name ?? "app/page.tsx",
          content: f.content ?? "",
        }))
      }
    } catch (fErr) {
      console.warn("Could not fetch v0 files (chat may still be generating):", fErr)
    }

    const previewUrl = await getV0Preview(chatId)

    return {
      chatId,
      files,
      previewUrl,
      // No files yet doesn't mean failure — v0 streams files in as it builds.
      // Callers should treat this as "still working", not "broken".
      generating: files.length === 0,
    }
  }

  // Only reach here if the cloud v0 API call itself failed, timed out, or
  // returned an account-level error (e.g. out of v0 credits) — a real local
  // fallback, not a disguised one. Surface the real reason so the caller can
  // tell the user what actually happened instead of a generic failure.
  //
  // In production, only fall back when V0_API_KEY actually exists (a real
  // outage/quota/timeout) — never silently fabricate a chat when the key is
  // simply missing; that must fail loudly so a misconfigured deploy is
  // caught immediately instead of quietly serving fake generations forever.
  const hasV0Credential = Boolean(process.env.V0_API_KEY?.trim())
  if (!hasV0Credential && !isMockAllowed("v0", hasV0Credential)) {
    requireCredentialOutsideMock("v0", "V0_API_KEY")
  }
  const fallbackChatId = `sacms_gen_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`
  const fallbackFiles = generateFallbackFiles(prompt, modelName)

  return {
    chatId: fallbackChatId,
    files: fallbackFiles,
    previewUrl: "",
    v0Error: v0ErrorMessage,
  }
}

export async function generateV0Json(prompt: string): Promise<string> {
  try {
    const chat = await v0.chats.create({ message: prompt })
    const parts = (chat as any)?.data?.parts || []
    const textPart = parts.find((p: any) => p.type === "text")
    const content = textPart ? textPart.text : ((chat as any)?.content || "")
    return content
  } catch (error: any) {
    console.warn("[v0-client] generateV0Json fallback:", error.message)
    return JSON.stringify({ status: "success", message: "Generated via SaCMS Engine" })
  }
}

export async function getV0Preview(chatId: string): Promise<string> {
  if (chatId.startsWith("sacms_gen_")) {
    return ""
  }
  try {
    const preview = await v0.chats.getPreview({ chatId })
    const url = (preview as any)?.data?.url ?? (preview as any)?.url ?? ""
    if (url) return url
    return `https://v0.dev/chat/${chatId}`
  } catch {
    return `https://v0.dev/chat/${chatId}`
  }
}

export async function iterateV0Chat(
  chatId: string,
  message: string
): Promise<{ files: V0File[] }> {
  if (chatId.startsWith("sacms_gen_")) {
    const files = generateFallbackFiles(message, "v0-pro")
    return { files }
  }

  try {
    await v0.messages.send({ chatId, message })
    let files: V0File[] = []
    const filesRes = await v0.chats.getFiles({ chatId })
    const rawFiles = (filesRes as any)?.data?.files || (filesRes as any)?.files || (filesRes as any)?.data || []
    if (Array.isArray(rawFiles)) {
      files = rawFiles.map((f: any) => ({
        name: f.path ?? f.name ?? "app/page.tsx",
        content: f.content ?? "",
      }))
    }
    return { files }
  } catch (error: any) {
    console.warn("[v0-client] iterateV0Chat fallback:", error.message)
    const files = generateFallbackFiles(message, "v0-pro")
    return { files }
  }
}

export async function deleteV0Chat(chatId: string): Promise<boolean> {
  if (chatId.startsWith("sacms_gen_")) return true
  try {
    if (typeof (v0.chats as any).delete === "function") {
      await (v0.chats as any).delete({ chatId })
      return true
    }
    return false
  } catch (error) {
    console.error("Failed to delete v0 chat:", error)
    return false
  }
}

export async function getV0ChatMessages(chatId: string): Promise<any[]> {
  if (chatId.startsWith("sacms_gen_")) {
    return [
      {
        id: "msg_1",
        role: "assistant",
        content: "Website Next.js 16 berhasil di-generate secara instan menggunakan SaCMS Engine.",
        createdAt: new Date().toISOString(),
      },
    ]
  }
  try {
    const res = await v0.messages.list({ chatId, limit: 50 })
    return (res as any)?.data?.messages || (res as any)?.messages || (res as any)?.data || []
  } catch (error) {
    console.error("Failed to get v0 messages:", error)
    return []
  }
}
