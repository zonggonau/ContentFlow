"use client"

import { useState, useEffect } from "react"
import { Users, UserPlus, Search, Shield, MoreHorizontal, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"

interface Member {
  id: string
  email: string
  name: string | null
  avatar: string | null
  role: string
  status: string
  createdAt: string
  lastLoginAt: string | null
  emailVerified: string | null
}

interface Role {
  id: string
  name: string
  slug: string
  isSystem: boolean
}

interface MemberAuthPolicy {
  allowMemberRegistration: boolean
  requireMemberEmailVerification: boolean
}

interface Props {
  tenantSlug: string
  initialMembers: Member[]
  roles: Role[]
  total: number
  policy: MemberAuthPolicy
}

function RegistrationPolicyCard({ tenantSlug, initial }: { tenantSlug: string; initial: MemberAuthPolicy }) {
  const [policy, setPolicy] = useState<MemberAuthPolicy>(initial)
  const [saving, setSaving] = useState<string | null>(null)

  const update = async (patch: Partial<MemberAuthPolicy>) => {
    const key = Object.keys(patch)[0]
    setSaving(key)
    const prev = policy
    setPolicy((p) => ({ ...p, ...patch }))
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/app-members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Terjadi kesalahan. Silakan coba lagi.")
      }
      toast.success("Kebijakan registrasi diperbarui")
    } catch (err: any) {
      setPolicy(prev)
      toast.error(err.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Kebijakan Auth Headless</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="allow-reg">Izinkan registrasi mandiri</Label>
            <p className="text-xs text-muted-foreground">
              <code className="text-[11px]">/auth/register</code>
            </p>
          </div>
          <Switch
            id="allow-reg"
            checked={policy.allowMemberRegistration}
            disabled={saving === "allowMemberRegistration"}
            onCheckedChange={(v) => update({ allowMemberRegistration: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="require-verify">Wajibkan verifikasi email</Label>
            <p className="text-xs text-muted-foreground">
              <code className="text-[11px]">pending_verification</code>
            </p>
          </div>
          <Switch
            id="require-verify"
            checked={policy.requireMemberEmailVerification}
            disabled={saving === "requireMemberEmailVerification"}
            onCheckedChange={(v) => update({ requireMemberEmailVerification: v })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function AddMemberDialog({ tenantSlug, roles, onSuccess }: { tenantSlug: string; roles: Role[]; onSuccess: (m: Member) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "authenticated" })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/app-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Terjadi kesalahan. Silakan coba lagi.")
      toast.success("Pengguna berhasil dibuat")
      onSuccess(data.member)
      setOpen(false)
      setForm({ name: "", email: "", password: "", role: "authenticated" })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" /> Tambah
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Pengguna Aplikasi</DialogTitle>
          <DialogDescription>{`${roles.length} anggota end-user di seluruh aplikasi Anda`}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="name">Nama</Label>
            <Input id="name" placeholder="Nama lengkap" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" placeholder="user@example.com" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Kata Sandi *</Label>
            <Input id="password" type="password" placeholder="Min. 8 karakter" required minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="role">Peran</Label>
            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
              <SelectTrigger id="role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map(r => <SelectItem key={r.id} value={r.slug}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>{loading ? "Membuat…" : "Buat Pengguna"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function MembersClient({ tenantSlug, initialMembers, roles, total, policy }: Props) {
  const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Aktif", variant: "default" },
    suspended: { label: "Ditangguhkan", variant: "destructive" },
    pending_verification: { label: "Menunggu", variant: "secondary" },
  }
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [roleFilter, setRoleFilter] = useState("all")
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(Math.max(1, Math.ceil(total / 25)))
  const [totalMembers, setTotalMembers] = useState(total)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(handler)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, roleFilter])

  useEffect(() => {
    const controller = new AbortController()
    const fetchMembers = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: "25" })
        if (debouncedSearch) params.set("search", debouncedSearch)
        if (statusFilter !== "all") params.set("status", statusFilter)
        if (roleFilter !== "all") params.set("role", roleFilter)
        const res = await fetch(`/api/tenant/${tenantSlug}/app-members?${params.toString()}`, {
          signal: controller.signal,
        })
        if (res.ok) {
          const data = await res.json()
          setMembers(data.members ?? [])
          setTotalMembers(data.pagination?.total ?? 0)
          setPageCount(Math.max(1, data.pagination?.pageCount ?? 1))
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          toast.error("Gagal memuat daftar pengguna")
        }
      } finally {
        setLoading(false)
      }
    }
    fetchMembers()
    return () => controller.abort()
  }, [tenantSlug, page, debouncedSearch, statusFilter, roleFilter])

  const filtered = members

  const handleSuspend = async (member: Member) => {
    const newStatus = member.status === "active" ? "suspended" : "active"
    const res = await fetch(`/api/tenant/${tenantSlug}/app-members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(mem => mem.id === member.id ? { ...mem, status: newStatus } : mem))
      toast.success(newStatus === "active" ? "Pengguna diaktifkan kembali" : "Pengguna ditangguhkan")
    }
  }

  const handleDelete = async (memberId: string) => {
    const res = await fetch(`/api/tenant/${tenantSlug}/app-members/${memberId}`, { method: "DELETE" })
    if (res.ok) {
      setMembers(prev => prev.filter(mem => mem.id !== memberId))
      setTotalMembers(t => Math.max(0, t - 1))
      toast.success("Pengguna dihapus")
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={<span className="flex items-center gap-2"><Users className="h-6 w-6" /> Pengguna Aplikasi</span>}
        description={`${totalMembers} anggota end-user di seluruh aplikasi Anda`}
        action={
          <>
            <Button variant="outline" size="sm" asChild>
              <a href={`/dashboard/${tenantSlug}/users-permissions/roles`} className="gap-2 flex items-center">
                <Shield className="h-4 w-4" /> Kelola Peran
              </a>
            </Button>
            <AddMemberDialog tenantSlug={tenantSlug} roles={roles} onSuccess={mem => {
              setMembers(prev => [mem, ...prev])
              setTotalMembers(t => t + 1)
            }} />
          </>
        }
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Hapus pengguna ini?"
        description="Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus pengguna"
        variant="destructive"
        onConfirm={async () => { if (pendingDelete) await handleDelete(pendingDelete) }}
      />

      <RegistrationPolicyCard tenantSlug={tenantSlug} initial={policy} />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari berdasarkan email atau nama…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="suspended">Ditangguhkan</SelectItem>
            <SelectItem value="pending_verification">Menunggu</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Peran" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Peran</SelectItem>
            {roles.map(r => <SelectItem key={r.id} value={r.slug}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Pengguna</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bergabung</TableHead>
              <TableHead>Login Terakhir</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {search || statusFilter !== "all" || roleFilter !== "all" ? "Tidak ada hasil" : "Belum ada data"}
                </TableCell>
              </TableRow>
            ) : filtered.map(member => (
              <TableRow key={member.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatar ?? undefined} />
                      <AvatarFallback className="text-xs">{(member.name ?? member.email).slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">{member.name ?? <span className="text-muted-foreground italic">Tanpa nama</span>}</div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </div>
                    {member.emailVerified ? (
                      <span title="Email terverifikasi"><CheckCircle className="h-3.5 w-3.5 text-green-500 ml-1" /></span>
                    ) : (
                      <span title="Email belum terverifikasi"><XCircle className="h-3.5 w-3.5 text-muted-foreground ml-1" /></span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs font-mono">{member.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGES[member.status]?.variant ?? "outline"} className="text-xs">
                    {STATUS_BADGES[member.status]?.label ?? member.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(member.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : <span className="italic">Belum pernah</span>}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleSuspend(member)}>
                        {member.status === "active" ? "Ditangguhkan" : "Pengguna diaktifkan kembali"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setPendingDelete(member.id)}>Hapus Pengguna</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-2">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Halaman {page} dari {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount || loading}
            >
              Berikutnya <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
