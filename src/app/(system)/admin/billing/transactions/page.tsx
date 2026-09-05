"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Loader2, CreditCard, Search, Filter, RefreshCw, 
  ArrowLeft, Building2, Download, ChevronLeft, ChevronRight,
  ExternalLink, MoreHorizontal, Check, Copy
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { cn, formatRupiah } from "@/lib/utils"

interface Transaction {
  id: string
  orderId: string
  amount: number
  status: string
  paymentType: string | null
  createdAt: string
  transactionId: string | null
  subscription?: {
    tenant: {
      name: string
      slug: string
    }
  } | null
}

export default function AdminTransactionsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState("all")
  const [search, setSearch] = useState("")
  
  // Details Modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchTransactions = async (p: number = 1) => {
    setRefreshing(true)
    try {
      let url = `/api/admin/billing/transactions?page=${p}&limit=20`
      if (statusFilter !== "all") url += `&status=${statusFilter}`
      if (search) url += `&search=${search}`
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions || [])
        setTotalPages(data.pagination?.totalPages || 1)
        setPage(data.pagination?.page || 1)
      }
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session?.user?.role === "super_admin") fetchTransactions(1)
  }, [session, statusFilter])

  const exportCSV = () => {
    if (transactions.length === 0) return toast({ title: "Tidak ada data untuk diekspor", variant: "destructive" })
    
    const headers = ["Order ID", "Tenant", "Payment Method", "Amount", "Status", "Date"]
    const rows = transactions.map(tx => [
      tx.orderId,
      tx.subscription?.tenant?.slug || "System",
      tx.paymentType || "Unknown",
      tx.amount,
      tx.status,
      new Date(tx.createdAt).toISOString()
    ])
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n")
      
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `transaksi_sacms_${new Date().getTime()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({ title: "Ekspor Berhasil", description: "File CSV transaksi berhasil diunduh" })
  }

  const handleSync = async (orderId: string) => {
    toast({ title: "Menyinkronkan status..." })
    try {
      const res = await fetch(`/api/billing/payment/${encodeURIComponent(orderId)}/status`)
      const data = await res.json()
      if (!res.ok) {
        toast({ variant: "destructive", title: "Gagal Sinkronisasi", description: data.error || "Gagal memeriksa status transaksi ke Midtrans" })
        return
      }
      await fetchTransactions(page)
      toast({
        title: data.status === "pending" ? "Status Belum Berubah" : "Status Berhasil Disinkronkan",
        description: `Status transaksi saat ini: ${data.status}`,
      })
    } catch (err) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan jaringan saat sinkronisasi" })
    }
  }

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase()
    if (s === "success" || s === "settlement" || s === "capture") {
      return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-none">Sukses</Badge>
    }
    if (s === "pending") {
      return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-none">Menunggu</Badge>
    }
    if (s === "failed" || s === "expire" || s === "deny" || s === "cancel") {
      return <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-none">Gagal</Badge>
    }
    return <Badge variant="outline" className="text-[9px] font-bold px-2 py-0.5 rounded-full border-border/60 text-muted-foreground">{status}</Badge>
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 min-h-[80vh] items-center justify-center flex-col w-full bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground mt-3 font-semibold">Memuat Transaksi Pembayaran...</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push("/admin/billing")} className="rounded-xl h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Riwayat Transaksi</h1>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold rounded-full">
                    Gateway Midtrans
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Seluruh riwayat pembayaran dan status checkout platform.</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="outline" className="rounded-xl h-9 text-xs font-bold shadow-xs border-border/80" onClick={() => fetchTransactions(page)}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} /> Refresh
              </Button>
              <Button onClick={exportCSV} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 rounded-xl shadow-xs">
                <Download className="h-3.5 w-3.5 mr-1.5" /> Ekspor CSV
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <Card className="border border-border/80 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardContent className="p-3 flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  placeholder="Cari berdasarkan Order ID, Transaction ID, atau nama workspace..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchTransactions(1)}
                  className="pl-9 h-9 rounded-xl text-xs bg-background border-border/80" 
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px] h-9 rounded-xl text-xs bg-background border-border/80">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border bg-card">
                  <SelectItem value="all" className="text-xs rounded-lg">Semua Status</SelectItem>
                  <SelectItem value="success" className="text-xs rounded-lg">Sukses / Lunas</SelectItem>
                  <SelectItem value="pending" className="text-xs rounded-lg">Menunggu</SelectItem>
                  <SelectItem value="failed" className="text-xs rounded-lg">Gagal / Kadaluarsa</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Transactions Table */}
          <Card className="border border-border/80 shadow-xs overflow-hidden bg-card rounded-2xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-b border-border/60">
                    <TableHead className="font-bold text-xs uppercase pl-5">Info Order</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Workspace</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Metode Bayar</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Jumlah</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Status</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase">Tanggal</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase pr-5">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-20 text-muted-foreground">
                        <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p className="font-bold text-xs text-foreground">Tidak ada transaksi ditemukan</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Sesuaikan filter atau kata kunci pencarian Anda.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx) => (
                      <TableRow key={tx.id} className="hover:bg-muted/20 transition-colors border-b border-border/40 last:border-0">
                        <TableCell className="pl-5 py-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-foreground font-mono">{tx.orderId}</span>
                            <span className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[180px]">TX: {tx.transactionId || 'not-started'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {tx.subscription?.tenant ? (
                            <Link href={`/admin/tenants`} className="flex items-center gap-2 hover:opacity-80 transition-opacity w-fit">
                              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                                <Building2 className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold truncate max-w-[150px]">{tx.subscription.tenant.name}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">/{tx.subscription.tenant.slug}</span>
                              </div>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2 opacity-50">
                              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border border-border/60">
                                <Building2 className="h-3.5 w-3.5" />
                              </div>
                              <span className="text-xs font-bold text-muted-foreground">Sistem / Dihapus</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-bold uppercase rounded-full border-border/60 text-muted-foreground">
                            {tx.paymentType || "Midtrans"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-black text-foreground font-mono">{formatRupiah(tx.amount)}</span>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(tx.status)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground font-mono">
                          <div>{new Date(tx.createdAt).toLocaleDateString('id-ID')}</div>
                          <div className="text-[10px] opacity-70">{new Date(tx.createdAt).toLocaleTimeString('id-ID')}</div>
                        </TableCell>
                        <TableCell className="text-right pr-5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 rounded-xl border-border bg-card">
                              <DropdownMenuItem className="cursor-pointer text-xs rounded-lg" onClick={() => setSelectedTx(tx)}>
                                <ExternalLink className="mr-2 h-3.5 w-3.5 text-primary" /> Lihat Detail
                              </DropdownMenuItem>
                              {tx.status.toLowerCase() === 'pending' && (
                                <DropdownMenuItem className="cursor-pointer text-xs rounded-lg" onClick={() => handleSync(tx.orderId)}>
                                  <RefreshCw className="mr-2 h-3.5 w-3.5 text-amber-500" /> Sinkronkan Status
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            
            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="p-3 bg-muted/20 border-t border-border/60 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Halaman <span className="font-bold text-foreground">{page}</span> dari <span className="font-bold text-foreground">{totalPages}</span>
                </p>
                <div className="flex gap-1.5">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => fetchTransactions(page - 1)} 
                    disabled={page <= 1 || refreshing}
                    className="h-8 rounded-lg text-xs font-bold"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Sebelumnya
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => fetchTransactions(page + 1)} 
                    disabled={page >= totalPages || refreshing}
                    className="h-8 rounded-lg text-xs font-bold"
                  >
                    Berikutnya <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
      
      {/* Transaction Details Modal */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="rounded-2xl border-border/80 shadow-xl max-w-xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Detail Transaksi
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              Order ID: {selectedTx?.orderId}
            </DialogDescription>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 p-4 bg-muted/20 border border-border/60 rounded-xl text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Jumlah Tagihan</p>
                  <p className="text-base font-black text-foreground font-mono">{formatRupiah(selectedTx.amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Status Pembayaran</p>
                  <div className="mt-0.5">{getStatusBadge(selectedTx.status)}</div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Metode Pembayaran</p>
                  <p className="font-bold text-foreground uppercase">{selectedTx.paymentType || "Midtrans"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">ID Transaksi Gateway</p>
                  <p className="font-mono text-muted-foreground truncate">{selectedTx.transactionId || "-"}</p>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Payload JSON Transaksi</p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedTx, null, 2))
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-500" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copied ? "Tersalin" : "Salin JSON"}
                  </Button>
                </div>
                <pre className="bg-muted/40 p-3 rounded-xl border border-border/60 text-[10px] font-mono text-foreground overflow-auto max-h-48">
                  {JSON.stringify(selectedTx, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
