"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Lock, Plus, Trash2, Save, Loader2, Eye, EyeOff, Variable } from "lucide-react"
import { toast } from "sonner"

interface CustomVar {
  key: string
  value: string
}

export function EnvironmentView({ tenantSlug }: { tenantSlug: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [systemVars, setSystemVars] = useState<{ key: string; note: string }[]>([])
  const [vars, setVars] = useState<CustomVar[]>([])
  const [reveal, setReveal] = useState<Record<number, boolean>>({})
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/environment`)
      if (res.ok) {
        const data = await res.json()
        setSystemVars(data.systemVars || [])
        setVars(data.customVars || [])
        setDirty(false)
      } else {
        toast.error("Gagal memuat environment variables")
      }
    } catch {
      toast.error("Kesalahan jaringan saat memuat environment")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  const update = (i: number, patch: Partial<CustomVar>) => {
    setVars((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)))
    setDirty(true)
  }
  const addRow = () => {
    setVars((prev) => [...prev, { key: "", value: "" }])
    setDirty(true)
  }
  const removeRow = (i: number) => {
    setVars((prev) => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  const save = async () => {
    const cleaned = vars.map((v) => ({ key: v.key.trim(), value: v.value })).filter((v) => v.key)
    const bad = cleaned.find((v) => !/^[A-Z_][A-Z0-9_]*$/.test(v.key))
    if (bad) {
      toast.error(`Nama variabel tidak valid: "${bad.key}". Gunakan HURUF_BESAR dan _.`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/tenant/${tenantSlug}/environment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vars: cleaned }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success("Environment variables disimpan. Deploy ulang situs agar perubahan diterapkan.")
        setVars(data.customVars || cleaned)
        setDirty(false)
      } else {
        toast.error(data.error || "Gagal menyimpan")
      }
    } catch {
      toast.error("Kesalahan jaringan saat menyimpan")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border/80 shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" /> Variabel Sistem
          </CardTitle>
          <CardDescription className="text-xs">
            Di-inject otomatis ke build Vercel setiap kali situs di-deploy. Tidak bisa diubah di sini.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-2">
          {systemVars.map((v) => (
            <div key={v.key} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/40 border">
              <code className="text-[11px] font-mono font-bold text-foreground">{v.key}</code>
              <span className="text-[11px] text-muted-foreground text-right">{v.note}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border/80 shadow-xs">
        <CardHeader className="p-5 pb-3 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Variable className="h-4 w-4 text-primary" /> Variabel Kustom
            </CardTitle>
            <CardDescription className="text-xs">
              Untuk <strong>frontend</strong> saja (mis. API key layanan pihak ketiga). Otomatis dikirim ke Vercel
              (env project) atau ditulis ke <code className="font-mono">.env</code> di VPS Contabo setiap kali situs
              di-deploy — lewat dashboard maupun MCP. Berlaku pada <strong>deploy berikutnya</strong>.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-xl h-9 text-xs font-bold gap-1.5 shrink-0"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Simpan
          </Button>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-2.5">
          {vars.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">Belum ada variabel kustom.</p>
          )}
          {vars.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={v.key}
                onChange={(e) => update(i, { key: e.target.value.toUpperCase() })}
                placeholder="NAMA_VARIABEL"
                className="h-9 text-xs rounded-lg font-mono w-2/5"
              />
              <div className="relative flex-1">
                <Input
                  value={v.value}
                  type={reveal[i] ? "text" : "password"}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder="value"
                  className="h-9 text-xs rounded-lg font-mono pr-9"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => ({ ...r, [i]: !r[i] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {reveal[i] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={() => removeRow(i)}>
                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow} className="h-8 text-xs font-bold gap-1.5 mt-1">
            <Plus className="h-3.5 w-3.5" /> Tambah Variabel
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
