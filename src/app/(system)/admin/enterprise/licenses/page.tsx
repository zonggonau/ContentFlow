"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import {
  Gem,
  Plus,
  Copy,
  Check,
  Search,
  ExternalLink,
  Trash2,
  Loader2,
  Key,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"

interface License {
  id: string
  displayKey?: string
  customerName: string
  customerEmail: string
  organization: string
  type: string
  expiresAt: string
  isExpired: boolean
  daysRemaining: number
  status: string
  lastValidatedAt: string | null
  validatedCount: number
  createdAt: string
}

export default function EnterpriseLicensesPage() {
  const { data: session, status } = useSession()
  const { toast } = useToast()
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalLicenses, setTotalLicenses] = useState(0)
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    organization: "",
    type: "enterprise",
    expiresIn: "365",
  })
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchLicenses = async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (debouncedSearch) params.set("search", debouncedSearch)
      const res = await fetch(`/api/admin/license/list?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLicenses(data.licenses || [])
        setTotalPages(data.totalPages || 1)
        setTotalLicenses(data.total || 0)
      }
    } catch (err) {
      toast({
        title: "Gagal",
        description: "Gagal memuat daftar lisensi enterprise",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 400)
    return () => clearTimeout(handler)
  }, [searchQuery])

  useEffect(() => {
    fetchLicenses()
  }, [debouncedSearch, page])

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopiedKey(true)
      toast({
        title: "Tersalin!",
        description: "Serial lisensi berhasil disalin ke clipboard",
      })
      setTimeout(() => setCopiedKey(false), 2000)
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal", description: "Gagal menyalin ke clipboard" })
    }
  }

  const handleCopyLicenseById = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/license/${id}`)
      if (!res.ok) throw new Error("reveal failed")
      const data = await res.json()
      await handleCopyKey(data.licenseKey)
    } catch {
      toast({
        title: "Gagal menyalin",
        description: "Silakan salin secara manual",
        variant: "destructive",
      })
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGeneratedKey(null)
    setConfirmGenerate(false)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + parseInt(form.expiresIn))

    try {
      const res = await fetch("/api/admin/license/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          organization: form.organization,
          type: form.type,
          expiresAt: expiresAt.toISOString(),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setGeneratedKey(data.licenseKey)
        setShowGenerate(false)
        fetchLicenses()
        setForm({
          customerName: "",
          customerEmail: "",
          organization: "",
          type: "enterprise",
          expiresIn: "365",
        })
        toast({
          title: "Lisensi Dibuat",
          description: `Lisensi aktif berhasil di-generate untuk ${form.customerName}`,
        })
      } else {
        const errData = await res.json()
        toast({
          title: "Gagal Generate",
          description: errData.error || "Terjadi kesalahan",
          variant: "destructive",
        })
      }
    } catch (err) {
      toast({
        title: "Terjadi Kesalahan",
        description: "Gagal membuat lisensi",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/license/${id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        toast({
          title: "Lisensi Dihapus",
          description: "Lisensi berhasil dihapus dari sistem.",
        })
        setDeletingId(null)
        fetchLicenses()
      } else {
        const errData = await res.json()
        toast({
          title: "Gagal Menghapus",
          description: errData.error || "Terjadi kesalahan",
          variant: "destructive",
        })
      }
    } catch (err) {
      toast({
        title: "Terjadi Kesalahan",
        description: "Gagal menghapus lisensi",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredLicenses = licenses.filter((lic) => {
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && lic.status === "active" && !lic.isExpired) ||
      (statusFilter === "expired" && (lic.isExpired || lic.status === "expired"))
    return matchesStatus
  })

  if (!session?.user || session.user.role !== "super_admin") {
    return (
      <div className="flex flex-1 flex-col w-full">
        <div className="flex-1 min-h-[60vh] flex items-center justify-center p-6">
          <Card className="max-w-md w-full rounded-2xl border-border/80 shadow-xs">
            <CardHeader className="text-center p-6">
              <Gem className="w-10 h-10 mx-auto text-primary mb-2" />
              <CardTitle className="text-base font-bold">Akses Dibatasi</CardTitle>
              <CardDescription className="text-xs">
                Hanya administrator yang dapat mengelola lisensi enterprise.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
                  <Gem className="w-6 h-6 text-primary" />
                  Lisensi Self-Hosted Enterprise
                </h1>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold rounded-full">
                  RSA Signature
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate serial key RSA offline & online untuk instansi dan pelanggan Enterprise Self-Hosted.
              </p>
            </div>
            
            <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 rounded-xl shadow-xs">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Generate Serial Baru
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl border-border/80 shadow-xl bg-card sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold flex items-center gap-2">
                    <Key className="h-4 w-4 text-primary" /> Generate Lisensi Enterprise
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Buat serial key berlisensi resmi RSA untuk pelanggan mandiri (self-hosted).
                  </DialogDescription>
                </DialogHeader>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    setConfirmGenerate(true)
                  }}
                  className="space-y-3 py-2"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="customerName" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nama Pelanggan / PIC *</Label>
                      <Input
                        id="customerName"
                        required
                        value={form.customerName}
                        onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                        placeholder="Pemerintah Kab. Jayawijaya"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email Kontak</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.customerEmail}
                        onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                        placeholder="admin@jayawijaya.go.id"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="org" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Organisasi / Instansi</Label>
                      <Input
                        id="org"
                        value={form.organization}
                        onChange={(e) => setForm({ ...form, organization: e.target.value })}
                        placeholder="Pemkab Jayawijaya"
                        className="h-9 rounded-xl text-xs bg-muted/20 border-border/80"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="type" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipe Lisensi</Label>
                      <Select
                        value={form.type}
                        onValueChange={(v) => setForm({ ...form, type: v })}
                      >
                        <SelectTrigger id="type" className="h-9 rounded-xl text-xs bg-muted/20 border-border/80">
                          <SelectValue placeholder="Pilih tipe" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-card">
                          <SelectItem value="enterprise" className="text-xs rounded-lg">Enterprise (Dedicated)</SelectItem>
                          <SelectItem value="partner" className="text-xs rounded-lg">Partner / Reseller</SelectItem>
                          <SelectItem value="trial" className="text-xs rounded-lg">Trial (Evaluasi)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor="duration" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Masa Berlaku</Label>
                      <Select
                        value={form.expiresIn}
                        onValueChange={(v) => setForm({ ...form, expiresIn: v })}
                      >
                        <SelectTrigger id="duration" className="h-9 rounded-xl text-xs bg-muted/20 border-border/80">
                          <SelectValue placeholder="Pilih durasi" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-card">
                          <SelectItem value="30" className="text-xs rounded-lg">30 Hari (Masa Percobaan Trial)</SelectItem>
                          <SelectItem value="90" className="text-xs rounded-lg">3 Bulan</SelectItem>
                          <SelectItem value="365" className="text-xs rounded-lg">1 Tahun (Standar Enterprise)</SelectItem>
                          <SelectItem value="730" className="text-xs rounded-lg">2 Tahun (Multi-Year Contract)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border/60">
                    <Button type="button" variant="outline" onClick={() => setShowGenerate(false)} className="rounded-xl text-xs font-bold h-9">
                      Batal
                    </Button>
                    <AlertDialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
                      <AlertDialogTrigger asChild>
                        <Button type="submit" disabled={!form.customerName.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 rounded-xl shadow-xs">
                          {generating ? "Memproses..." : "Generate Serial Key"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl border-border/80 shadow-xl bg-card max-w-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-base font-bold">Konfirmasi Pembuatan Lisensi</AlertDialogTitle>
                          <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground">
                            Sistem akan menandatangani serial RSA untuk{" "}
                            <strong className="text-foreground">{form.customerName}</strong>
                            {form.organization ? ` (${form.organization})` : ""}.
                            Lisensi akan aktif selama{" "}
                            <strong className="text-foreground">
                              {form.expiresIn === "30" ? "30 hari" :
                               form.expiresIn === "90" ? "3 bulan" :
                               form.expiresIn === "365" ? "1 tahun" : "2 tahun"}
                            </strong>.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
                          <AlertDialogCancel className="rounded-xl text-xs font-bold h-9">Batal</AlertDialogCancel>
                          <AlertDialogAction onClick={handleGenerate} disabled={generating} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 rounded-xl shadow-xs">
                            {generating ? "Memproses..." : "Ya, Terbitkan Lisensi"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Generated Key Success */}
          {generatedKey && (
            <Card className="border border-emerald-500/30 bg-emerald-500/5 rounded-2xl shadow-xs">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Serial Lisensi Berhasil Dibuat
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Salin kunci serial ini dan berikan kepada pelanggan. Jaga kerahasiaan kunci ini.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-3">
                <div className="relative">
                  <pre className="bg-muted/40 p-3 pr-20 rounded-xl font-mono text-[10px] break-all select-all border border-border/80 overflow-x-auto text-foreground">
                    {generatedKey}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2 rounded-lg text-xs font-bold h-7"
                    onClick={() => handleCopyKey(generatedKey)}
                  >
                    {copiedKey ? (
                      <><Check className="w-3 h-3 mr-1 text-emerald-500" /> Tersalin</>
                    ) : (
                      <><Copy className="w-3 h-3 mr-1" /> Salin</>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pelanggan harus memasukkan nilai ini ke dalam variabel{" "}
                  <code className="bg-muted/40 px-1.5 py-0.5 rounded text-[11px] font-mono text-foreground font-bold">LICENSE_KEY</code>{" "}
                  di file <code className="bg-muted/40 px-1.5 py-0.5 rounded text-[11px] font-mono text-foreground font-bold">.env</code> server mereka.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari berdasarkan pelanggan, email, atau instansi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 rounded-xl text-xs bg-card border-border/80"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 rounded-xl text-xs bg-card border-border/80">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border bg-card">
                <SelectItem value="all" className="text-xs rounded-lg">Semua Status</SelectItem>
                <SelectItem value="active" className="text-xs rounded-lg">Aktif</SelectItem>
                <SelectItem value="expired" className="text-xs rounded-lg">Kadaluarsa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Licenses Table */}
          <Card className="border border-border/80 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-b border-border/60">
                    <TableHead className="font-bold text-xs uppercase pl-5">Pelanggan</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Organisasi</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Tipe</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Masa Berlaku</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Status</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Validasi</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase pr-5">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j} className="p-4">
                            <Skeleton className="h-4 w-full rounded-md" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredLicenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                          <Gem className="w-8 h-8 opacity-20 mb-1" />
                          {searchQuery || statusFilter !== "all" ? (
                            <p className="text-xs font-bold text-foreground">Tidak ada lisensi yang sesuai dengan filter.</p>
                          ) : (
                            <>
                              <p className="text-xs font-bold text-foreground">Belum ada lisensi enterprise</p>
                              <p className="text-[11px] text-muted-foreground">Klik 'Generate Serial Baru' untuk menerbitkan lisensi pertama.</p>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLicenses.map((lic) => (
                      <TableRow key={lic.id} className="hover:bg-muted/20 transition-colors border-b border-border/40 last:border-0">
                        <TableCell className="pl-5 py-3.5">
                          <div className="font-bold text-xs text-foreground">{lic.customerName}</div>
                          {lic.customerEmail && (
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{lic.customerEmail}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{lic.organization || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[9px] uppercase font-bold rounded-full border-border/60">
                            {lic.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="text-foreground">{new Date(lic.expiresAt).toLocaleDateString('id-ID')}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {lic.daysRemaining > 0 ? `${lic.daysRemaining} hari tersisa` : "Kadaluarsa"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {lic.status === "active" && !lic.isExpired ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[9px] font-bold rounded-full border shadow-none">
                              Aktif
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[9px] font-bold rounded-full border shadow-none">
                              {lic.isExpired ? "Kadaluarsa" : lic.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{lic.validatedCount}x</TableCell>
                        <TableCell className="text-right pr-5">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              onClick={() => handleCopyLicenseById(lic.id)}
                              title="Salin kunci lisensi"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletingId(lic.id)}
                              title="Hapus lisensi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-border/60">
                  <span className="text-xs text-muted-foreground">
                    Halaman {page} dari {totalPages} &bull; {totalLicenses} lisensi total
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="rounded-lg h-8 text-xs font-bold"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Sebelumnya
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="rounded-lg h-8 text-xs font-bold"
                    >
                      Berikutnya <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delete Confirmation */}
          <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
            <AlertDialogContent className="rounded-2xl border-border/80 shadow-xl bg-card max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base font-bold text-foreground">Hapus Lisensi Enterprise?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground">
                  Tindakan ini tidak dapat dibatalkan. Lisensi ini akan dinonaktifkan permanen dan instance pelanggan yang menggunakannya akan kehilangan akses enterprise.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
                <AlertDialogCancel disabled={isDeleting} className="rounded-xl text-xs font-bold h-9">Batal</AlertDialogCancel>
                <Button 
                  variant="destructive" 
                  onClick={() => deletingId && handleDelete(deletingId)}
                  disabled={isDeleting}
                  className="rounded-xl text-xs font-bold h-9"
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  {isDeleting ? "Menghapus..." : "Hapus Lisensi"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}
