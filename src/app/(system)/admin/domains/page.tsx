"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Globe,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Trash2,
  Building2,
  ExternalLink,
  ShieldCheck,
  Loader2,
  Plus,
  ArrowUpRight,
  Info
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

interface CustomDomainItem {
  id: string
  domain: string
  status: "pending" | "verified" | "failed" | string
  verifiedAt: string | null
  isPrimary: boolean
  createdAt: string
  tenant: {
    id: string
    name: string
    slug: string
    plan: string
    status: string
  }
}

export default function AdminCustomDomainsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()

  const [domains, setDomains] = useState<CustomDomainItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  const [domainToDelete, setDomainToDelete] = useState<CustomDomainItem | null>(null)
  const [dnsGuideDomain, setDnsGuideDomain] = useState<CustomDomainItem | null>(null)

  const isAdmin = session?.user?.role === "super_admin" || session?.user?.role === "admin"

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(handler)
  }, [search])

  const fetchDomains = async () => {
    try {
      let url = "/api/admin/domains"
      if (debouncedSearch) url += `?search=${encodeURIComponent(debouncedSearch)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setDomains(data.domains || [])
      } else {
        toast({ variant: "destructive", title: "Gagal", description: "Gagal memuat data custom domain" })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan jaringan" })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      fetchDomains()
    }
  }, [isAdmin, debouncedSearch])

  const handleUpdateStatus = async (domainId: string, action: "verify" | "set_pending") => {
    setActionLoading(domainId)
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId, action })
      })

      if (res.ok) {
        toast({
          title: "Berhasil",
          description: action === "verify" ? "Domain berhasil diverifikasi dan SSL aktif." : "Status domain diubah menjadi pending."
        })
        fetchDomains()
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "Gagal", description: err.error || "Gagal memperbarui status domain" })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan jaringan" })
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteDomain = async () => {
    if (!domainToDelete) return
    setActionLoading(domainToDelete.id)
    try {
      const res = await fetch(`/api/admin/domains?id=${domainToDelete.id}`, {
        method: "DELETE"
      })

      if (res.ok) {
        toast({ title: "Berhasil", description: "Domain kustom berhasil dihapus" })
        setDomainToDelete(null)
        fetchDomains()
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "Gagal", description: err.error || "Gagal menghapus domain" })
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan jaringan" })
    } finally {
      setActionLoading(null)
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 min-h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-center text-muted-foreground">
        <p>Akses dibatasi khusus untuk Super Administrator.</p>
      </div>
    )
  }

  const verifiedCount = domains.filter(d => d.status === "verified").length
  const pendingCount = domains.filter(d => d.status === "pending").length

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Custom Domains & SSL</h1>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20 rounded-full">
                  DNS Routing
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                Pantau domain kustom yang didaftarkan tenant, status verifikasi DNS CNAME/A record, dan sertifikat SSL platform.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setRefreshing(true); fetchDomains(); }} 
                disabled={refreshing} 
                className="rounded-xl h-9 text-xs font-bold shadow-xs border-border/80"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> 
                Muat Ulang
              </Button>
            </div>
          </div>

          {/* Stats Strip */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="rounded-2xl border border-border/80 bg-card shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Domain</CardTitle>
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Globe className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="text-2xl font-black text-foreground tracking-tight">{domains.length}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Domain terdaftar pada seluruh workspace</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-emerald-500/20 bg-card shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Terverifikasi & Aktif</CardTitle>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{verifiedCount}</div>
                <p className="text-[11px] text-muted-foreground mt-1">DNS valid dan SSL aktif</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-amber-500/20 bg-card shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Menunggu Verifikasi</CardTitle>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">{pendingCount}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Menunggu konfigurasi DNS record oleh tenant</p>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filter bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari domain atau workspace..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 rounded-xl text-xs bg-muted/20 border-border/80"
              />
            </div>
          </div>

          {/* Domains Table */}
          <Card className="border border-border/80 shadow-xs overflow-hidden rounded-2xl bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/60">
                    <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[240px]">
                      Domain Kustom
                    </th>
                    <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[180px]">
                      Workspace Tenant
                    </th>
                    <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[120px]">
                      Status DNS
                    </th>
                    <th className="p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[160px]">
                      Tanggal Diverifikasi
                    </th>
                    <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground min-w-[180px]">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {domains.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-muted-foreground">
                        <Globe className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-xs font-semibold">Belum ada custom domain yang terdaftar</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Tenant dapat menambahkan custom domain di pengaturan workspace mereka.</p>
                      </td>
                    </tr>
                  ) : (
                    domains.map((item) => {
                      const isVerified = item.status === "verified"
                      const isLoadingThis = actionLoading === item.id

                      return (
                        <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <Globe className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-foreground font-mono">{item.domain}</span>
                                  <a 
                                    href={`https://${item.domain}`} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    <ArrowUpRight className="h-3 w-3" />
                                  </a>
                                </div>
                                {item.isPrimary && (
                                  <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 h-4 border-primary/30 text-primary mt-0.5">
                                    Primary Domain
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <div>
                                <p className="text-xs font-bold text-foreground">{item.tenant?.name || "Unknown Tenant"}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">/{item.tenant?.slug}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            {isVerified ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold rounded-full">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Verified & SSL Active
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-bold rounded-full">
                                <Clock className="h-3 w-3 mr-1" /> Pending DNS
                              </Badge>
                            )}
                          </td>
                          <td className="p-4 text-xs text-muted-foreground">
                            {item.verifiedAt ? new Date(item.verifiedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDnsGuideDomain(item)}
                                className="h-8 text-[11px] font-bold text-muted-foreground hover:text-foreground rounded-lg"
                              >
                                Instruksi DNS
                              </Button>

                              {isVerified ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isLoadingThis}
                                  onClick={() => handleUpdateStatus(item.id, "set_pending")}
                                  className="h-8 text-[11px] font-bold rounded-lg border-border/80"
                                >
                                  {isLoadingThis && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                  Set Pending
                                </Button>
                              ) : (
                                <Button
                                  variant="default"
                                  size="sm"
                                  disabled={isLoadingThis}
                                  onClick={() => handleUpdateStatus(item.id, "verify")}
                                  className="h-8 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                >
                                  {isLoadingThis && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                  Verifikasi Domain
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDomainToDelete(item)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* DNS Instructions Modal */}
      <Dialog open={!!dnsGuideDomain} onOpenChange={(open) => !open && setDnsGuideDomain(null)}>
        <DialogContent className="rounded-2xl border-border/80 shadow-xl bg-card sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Konfigurasi DNS: {dnsGuideDomain?.domain}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Instruksi DNS record yang harus dipasang tenant pada DNS Management (Cloudflare / Namecheap / dll).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
              <p className="font-bold text-foreground">Opsi 1: CNAME Record (Subdomain)</p>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-card p-2 rounded-lg border">
                <div><span className="text-muted-foreground block text-[9px]">TYPE</span>CNAME</div>
                <div><span className="text-muted-foreground block text-[9px]">NAME</span>{dnsGuideDomain?.domain.split(".")[0] || "@"}</div>
                <div><span className="text-muted-foreground block text-[9px]">TARGET</span>cname.sacms.io</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
              <p className="font-bold text-foreground">Opsi 2: A Record (Root Apex Domain)</p>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-card p-2 rounded-lg border">
                <div><span className="text-muted-foreground block text-[9px]">TYPE</span>A</div>
                <div><span className="text-muted-foreground block text-[9px]">NAME</span>@</div>
                <div><span className="text-muted-foreground block text-[9px]">VALUE</span>76.76.21.21</div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>Sertifikat SSL otomatis diterbitkan oleh SaCMS Proxy setelah DNS terpropagasi (1-10 menit).</span>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setDnsGuideDomain(null)} className="rounded-xl text-xs font-bold h-9">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <AlertDialog open={!!domainToDelete} onOpenChange={(open) => !open && setDomainToDelete(null)}>
        <AlertDialogContent className="rounded-2xl border-border/80 shadow-xl bg-card max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold">Hapus Custom Domain?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Domain <strong>{domainToDelete?.domain}</strong> akan dicopot dari workspace <strong>{domainToDelete?.tenant?.name}</strong>. Traffic ke domain ini tidak lagi diarahkan ke CMS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
            <AlertDialogCancel className="rounded-xl text-xs font-bold h-9">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDomain} className="bg-destructive hover:bg-destructive/90 text-white rounded-xl text-xs font-bold h-9">
              Hapus Domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
