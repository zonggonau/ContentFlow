"use client"

import { useState } from "react"
import { Building2, Search, ChevronLeft, ChevronRight, Loader2, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useAdminTenants, Tenant } from "@/hooks/admin/use-admin-tenants"
import { TenantTable } from "@/components/admin/tenants/tenant-table"
import { TenantFormModal } from "@/components/admin/tenants/tenant-form-modal"
import { TenantDeleteModal } from "@/components/admin/tenants/tenant-delete-modal"
import { TenantOverrideModal } from "@/components/admin/tenants/tenant-override-modal"

export default function AdminTenantsPage() {
  const { toast } = useToast()
  const {
    tenants,
    loading,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    totalPages,
    totalTenants,
    refetch
  } = useAdminTenants()

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isOverrideOpen, setIsOverrideOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [isSettingUpGlobal, setIsSettingUpGlobal] = useState(false)

  // Selection States
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null)
  const [overrideTenant, setOverrideTenant] = useState<Tenant | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")

  // Form States
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    plan: "free",
    status: "active",
    databaseUrl: ""
  })

  const [overrideFormData, setOverrideFormData] = useState({
    maxContentTypes: "",
    maxContentEntries: "",
    maxTeamMembers: "",
    maxStorage: "",
    maxLocales: "",
    maxApiCalls: "",
    note: ""
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        toast({ title: "Berhasil", description: "Workspace berhasil dibuat" })
        setIsCreateOpen(false)
        refetch()
        setFormData({ name: "", slug: "", description: "", plan: "free", status: "active", databaseUrl: "" })
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "Gagal", description: err.error || "Gagal membuat workspace" })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan yang tidak terduga" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTenant) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/admin/tenants/${selectedTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        toast({ title: "Berhasil", description: "Workspace berhasil diperbarui" })
        setIsEditOpen(false)
        refetch()
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "Gagal", description: err.error || "Gagal memperbarui workspace" })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan yang tidak terduga" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!tenantToDelete) return
    const confirmation = (deleteConfirmation || "").trim().toLowerCase()
    const validMatch = 
      confirmation === tenantToDelete.name.trim().toLowerCase() ||
      confirmation === tenantToDelete.id.trim().toLowerCase() ||
      confirmation === (tenantToDelete.slug || "").trim().toLowerCase()

    if (!validMatch) {
      toast({ variant: "destructive", title: "Gagal", description: "Nama konfirmasi tidak cocok" })
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantToDelete.id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        toast({ title: "Berhasil", description: "Workspace berhasil dihapus" })
        setIsDeleteOpen(false)
        setTenantToDelete(null)
        setDeleteConfirmation("")
        refetch()
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "Gagal", description: err.error || "Gagal menghapus workspace" })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan saat menghapus workspace" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        toast({ title: "Status Diperbarui", description: `Workspace sekarang dalam status ${status}` })
        refetch()
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "Gagal", description: err.error || "Gagal mengubah status" })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan saat mengubah status" })
    }
  }

  const handleSaveOverrides = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overrideTenant) return
    setOverrideLoading(true)
    try {
      const toNullableInt = (v: string) => (v.trim() === "" ? null : parseInt(v, 10))
      const res = await fetch(`/api/admin/tenants/${overrideTenant.id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxContentTypes: toNullableInt(overrideFormData.maxContentTypes),
          maxContentEntries: toNullableInt(overrideFormData.maxContentEntries),
          maxTeamMembers: toNullableInt(overrideFormData.maxTeamMembers),
          maxStorage: toNullableInt(overrideFormData.maxStorage),
          maxLocales: toNullableInt(overrideFormData.maxLocales),
          maxApiCalls: toNullableInt(overrideFormData.maxApiCalls),
          note: overrideFormData.note.trim() === "" ? null : overrideFormData.note,
        }),
      })
      if (res.ok) {
        toast({ title: "Berhasil", description: "Batas limit khusus workspace berhasil disimpan" })
        setIsOverrideOpen(false)
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "Gagal", description: err.error || "Gagal menyimpan limit" })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Terjadi kesalahan saat menyimpan limit" })
    } finally {
      setOverrideLoading(false)
    }
  }

  const handleSetupGlobalTenant = async () => {
    setIsSettingUpGlobal(true)
    try {
      const res = await fetch("/api/admin/tenants/setup-global", { method: "POST" })
      if (res.ok) {
        toast({ title: "Setup Berhasil", description: "Global Tenant & Seed Data berhasil disiapkan." })
        refetch()
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "Setup Gagal", description: err.error || "Gagal menyiapkan global tenant" })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Setup Error", description: "Terjadi kesalahan saat penyiapan." })
    } finally {
      setIsSettingUpGlobal(false)
    }
  }

  const openEdit = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setFormData({
      name: tenant.name,
      slug: tenant.slug,
      description: tenant.description || "",
      plan: tenant.plan,
      status: tenant.status,
      databaseUrl: tenant.databaseUrl || ""
    })
    setIsEditOpen(true)
  }

  const openDelete = (tenant: Tenant) => {
    if (tenant.slug === "sacms-global" || tenant.slug === "sacms" || tenant.id === "sacms-global" || tenant.name.toLowerCase() === "sacms global") {
      toast({ variant: "destructive", title: "Dilarang", description: "Workspace global sistem tidak boleh dihapus." })
      return
    }
    setTenantToDelete(tenant)
    setDeleteConfirmation("")
    setIsDeleteOpen(true)
  }

  const openOverride = async (tenant: Tenant) => {
    setOverrideTenant(tenant)
    setOverrideFormData({
      maxContentTypes: "",
      maxContentEntries: "",
      maxTeamMembers: "",
      maxStorage: "",
      maxLocales: "",
      maxApiCalls: "",
      note: ""
    })
    setIsOverrideOpen(true)
    setOverrideLoading(true)
    
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/override`)
      if (res.ok) {
        const data = await res.json()
        if (data.override) {
          setOverrideFormData({
            maxContentTypes: data.override.maxContentTypes?.toString() || "",
            maxContentEntries: data.override.maxContentEntries?.toString() || "",
            maxTeamMembers: data.override.maxTeamMembers?.toString() || "",
            maxStorage: data.override.maxStorage?.toString() || "",
            maxLocales: data.override.maxLocales?.toString() || "",
            maxApiCalls: data.override.maxApiCalls?.toString() || "",
            note: data.override.note || ""
          })
        }
      }
    } catch (error) {
      console.error("Failed to fetch overrides:", error)
    } finally {
      setOverrideLoading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Manajemen Workspace</h1>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold rounded-full">
                  {totalTenants} Workspace
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Kelola seluruh instance tenant, perizinan, batas kuota, dan status akun platform.
              </p>
            </div>
            
            <div className="flex items-center gap-2.5">
              <Button 
                variant="outline"
                onClick={handleSetupGlobalTenant} 
                disabled={isSettingUpGlobal}
                className="rounded-xl h-9 text-xs font-bold shadow-xs border-border/80"
              >
                {isSettingUpGlobal ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Globe className="h-3.5 w-3.5 mr-1.5" />}
                Setup Global Tenant SaCMS
              </Button>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                placeholder="Cari workspace berdasarkan nama atau slug..." 
                className="pl-9 h-9 rounded-xl text-xs bg-card border-border/80"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <TenantTable 
            tenants={tenants}
            loading={loading}
            onEdit={openEdit}
            onDelete={openDelete}
            onOverride={openOverride}
            onStatusChange={handleStatusChange}
          />

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Menampilkan halaman <span className="font-bold text-foreground">{page}</span> dari <span className="font-bold text-foreground">{totalPages}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Modals */}
          <TenantFormModal 
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            onSubmit={handleCreate}
            formData={formData}
            setFormData={setFormData}
            isSubmitting={isSubmitting}
            mode="create"
          />

          <TenantFormModal 
            isOpen={isEditOpen}
            onClose={() => setIsEditOpen(false)}
            onSubmit={handleUpdate}
            formData={formData}
            setFormData={setFormData}
            isSubmitting={isSubmitting}
            mode="edit"
          />

          <TenantDeleteModal 
            isOpen={isDeleteOpen}
            onClose={() => setIsDeleteOpen(false)}
            onConfirm={handleDelete}
            tenant={tenantToDelete}
            confirmation={deleteConfirmation}
            setConfirmation={setDeleteConfirmation}
            isSubmitting={isSubmitting}
          />

          <TenantOverrideModal 
            isOpen={isOverrideOpen}
            onClose={() => setIsOverrideOpen(false)}
            onSubmit={handleSaveOverrides}
            tenant={overrideTenant}
            formData={overrideFormData}
            setFormData={setOverrideFormData}
            loading={overrideLoading}
          />
        </div>
      </div>
    </div>
  )
}
