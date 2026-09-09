"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { 
  ArrowLeft, Save, Edit2, FileText, Trash2, Loader2, 
  Globe, Database, ShieldCheck, Send, CheckCircle2, Zap, Sparkles
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
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
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Field Renderers
import { TextField } from "@/components/content/field-renderers/text-field"
import { TextareaField } from "@/components/content/field-renderers/textarea-field"
import { NumberField } from "@/components/content/field-renderers/number-field"
import { DateTimeField } from "@/components/content/field-renderers/datetime-field"
import { BooleanField } from "@/components/content/field-renderers/boolean-field"
import { DateField } from "@/components/content/field-renderers/date-field"
import { SelectField } from "@/components/content/field-renderers/select-field"
import { MediaField } from "@/components/content/field-renderers/media-field"
import { RichTextField } from "@/components/content/field-renderers/rich-text-field"
import { ComponentField } from "@/components/content/field-renderers/component-field"
import { AdvancedField } from "@/components/content/field-renderers/advanced-fields"
import { PercentField } from "@/components/content/field-renderers/percent-field"
import { IconField } from "@/components/content/field-renderers/icon-field"
import { SeoField } from "@/components/content/field-renderers/seo-field"
import { CodeField } from "@/components/content/field-renderers/code-field"
import { cn } from "@/lib/utils"
import { getSingleTypeBySlugAction, saveSingleTypeDataAction } from "@/actions/single-types"

interface Field {
  id: string
  name: string
  slug: string
  type: string
  required: boolean
  unique: boolean
  options?: any
}

interface SingleType {
  id: string
  name: string
  slug: string
  description: string | null
  fields: Field[]
  data: Record<string, unknown> | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export default function SingleTypeDetailClient({
  tenantSlug,
  singleTypeSlug,
  initialSingleType,
  initialLocales,
}: {
  tenantSlug: string
  singleTypeSlug: string
  initialSingleType: SingleType | null
  initialLocales: any[]
}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  const [singleType, setSingleType] = useState<SingleType | null>(initialSingleType)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<Record<string, unknown>>(initialSingleType?.data || {})
  const [locale, setLocale] = useState<string>("id")
  const [availableLocales, setAvailableLocales] = useState<any[]>(initialLocales)

  const tenants = useMemo(() => session?.user?.tenants || [], [session?.user?.id])

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  const fetchData = useCallback(async () => {
    if (!tenantSlug || !singleTypeSlug) return
    setLoading(true)
    try {
      const stRes = await getSingleTypeBySlugAction(tenantSlug, singleTypeSlug)
      
      if (!stRes.error && stRes.singleType) {
        setSingleType(stRes.singleType as unknown as SingleType)
        setFormData(stRes.singleType.data || {})
      }
      
      const locRes = await fetch(`/api/tenant/${tenantSlug}/locales`)
      if (locRes.ok) {
        const data = await locRes.json()
        if (data.locales?.length > 0) setAvailableLocales(data.locales)
      }
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Gagal memuat data konten" })
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, singleTypeSlug])

  useEffect(() => {
    // If the slug changed and doesn't match initial prop, refetch
    if (status === "authenticated" && initialSingleType?.slug !== singleTypeSlug) {
      setSingleType(null)
      setFormData({})
      fetchData()
    }
  }, [fetchData, status, singleTypeSlug, initialSingleType?.slug])

  const handleSave = async (publishNow: boolean = false) => {
    if (!singleTypeSlug || !singleType) return
    setSaving(true)
    try {
      const response = await saveSingleTypeDataAction(tenantSlug, singleType.id, formData, publishNow)
      
      if (response.error) throw new Error(response.error)
      
      toast({ 
        title: publishNow ? "Berhasil Diterbitkan!" : "Draf Berhasil Disimpan",
        className: publishNow ? "bg-emerald-50 border-emerald-200 text-emerald-800" : ""
      })
      
      if (publishNow) {
        // Redirect to list page after publish
        router.push(`/dashboard/${tenantSlug}/content-type-builder/single-types`)
      } else {
        // Refresh data if only saving draft
        fetchData()
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Gagal menyimpan konten" })
    } finally {
      setSaving(false)
    }
  }

  const handleFieldChange = (slug: string, value: any) => {
    setFormData(prev => ({ ...prev, [slug]: value }))
  }

  const renderField = (field: Field) => {
    const value = formData[field.slug]
    let options: string[] = []
    
    if (field.options) {
      try {
        const opts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options
        if (Array.isArray(opts)) options = opts
        else if (typeof opts === 'string') options = opts.split(",").map(o => o.trim())
      } catch (e) {
        console.warn(`Failed to parse options for field ${field.slug}:`, e)
        if (typeof field.options === 'string') options = field.options.split(",").map(o => o.trim())
      }
    }

    switch (field.type) {
      case "text": 
        return <TextField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} placeholder={field.name} />
      case "textarea": 
        return <TextareaField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />
      case "richText": 
        return <RichTextField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />
      case "markdown": 
        return <TextareaField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} placeholder="Enter markdown..." />
      case "number": 
      case "integer":
      case "decimal":
      case "float":
        return <NumberField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type={field.type as any} />
      case "boolean": 
        return <BooleanField value={value as boolean} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />
      case "date": 
        return <DateField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />
      case "datetime": 
      case "timestamp":
        return <DateTimeField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type={field.type as any} />
      case "select": 
        return <SelectField value={value as string} onChange={v => handleFieldChange(field.slug, v)} options={field.options} required={field.required} />
      case "media": 
        return <MediaField value={value as string} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} type="image" />
      case "file":
        return <MediaField value={value as string} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} type="file" />
      case "json":
      case "color":
      case "location":
        return <AdvancedField value={value} onChange={v => handleFieldChange(field.slug, v)} type={field.type} required={field.required} label={field.name} />
      case "percent":
        return <PercentField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />
      case "icon":
        return <IconField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />
      case "seo":
        return <SeoField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />
      case "code":
        return <CodeField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />
      case "component":
        let compOpts: any = {}
        try {
          compOpts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options
        } catch { compOpts = {} }
        return <ComponentField tenantSlug={tenantSlug} componentSlug={compOpts?.componentSlug} value={value} onChange={v => handleFieldChange(field.slug, v)} label={field.name} repeatable={compOpts?.repeatable} />
      default: 
        return <Input value={value as string || ""} onChange={e => handleFieldChange(field.slug, e.target.value)} />
    }
  }

  if (loading) return (
    <div className="flex flex-1 flex-col w-full">
<div className="flex-1 flex items-center justify-center flex-col w-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  )

  if (!singleType) return null

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8 hover:bg-muted/60" onClick={() => router.push(`/dashboard/${tenantSlug}/content-type-builder/single-types`)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-black tracking-tight text-foreground">{singleType.name}</h1>
                  <Badge variant={singleType.publishedAt ? "default" : "secondary"} className="text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {singleType.publishedAt ? "Live" : "Draft"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Konten Tunggal &middot; <span className="font-mono">/{singleType.slug}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-8 px-3 text-xs font-bold rounded-xl border-border/80 text-foreground hover:bg-muted shadow-xs flex items-center gap-1.5" asChild>
                <Link href={`/dashboard/${tenantSlug}/cms/single-types/${singleType.slug}`} title="Buka entri single type di CMS Studio">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="hidden sm:inline">Buka di CMS Studio</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-8 px-3 text-xs font-bold rounded-xl border-border/80" asChild>
                <Link href={`/dashboard/${tenantSlug}/content-type-builder/single-types/${singleType.slug}/edit`}>
                  <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit Skema
                </Link>
              </Button>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="h-8 px-3 text-xs font-bold rounded-xl border-border/80">
                Simpan Draft
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving} className="h-8 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Publikasikan
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border border-border/80 rounded-2xl shadow-xs overflow-hidden bg-card">
                <CardHeader className="p-5 pb-3 border-b border-border/60">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Editor Konten</CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-6">
                  {singleType.fields.length === 0 ? (
                    <div className="text-center py-16 space-y-2">
                      <Zap className="h-8 w-8 mx-auto text-muted-foreground/30" />
                      <p className="font-bold text-xs text-foreground">Belum ada field yang didefinisikan</p>
                      <p className="text-[11px] text-muted-foreground">Buka editor skema untuk menambahkan atribut konten.</p>
                    </div>
                  ) : (
                    singleType.fields.map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-foreground">{field.name} {field.required && <span className="text-rose-500">*</span>}</Label>
                          <Badge variant="outline" className="text-[9px] font-mono uppercase px-1.5 py-0 rounded-full border-border/60 text-muted-foreground">{field.type}</Badge>
                        </div>
                        {renderField(field)}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border border-border/80 rounded-2xl shadow-xs overflow-hidden bg-card">
                <CardHeader className="p-4 pb-2 border-b border-border/60">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bahasa & Lokalisasi</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Bahasa Aktif</Label>
                    <Select value={locale} onValueChange={setLocale}>
                      <SelectTrigger className="bg-background border-border/80 rounded-xl h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-xl border-border bg-card">
                        {availableLocales.map(l => (
                          <SelectItem key={l.locale} value={l.locale} className="rounded-lg text-xs cursor-pointer">{l.name} ({l.locale})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 rounded-2xl shadow-xs overflow-hidden bg-card">
                <CardHeader className="p-4 pb-2 border-b border-border/60">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Informasi Sistem</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-border/60">
                    <span className="text-muted-foreground text-xs">API Slug</span>
                    <code className="font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-lg text-xs">/{singleType.slug}</code>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground text-xs">Terakhir Diperbarui</span>
                    <span className="font-medium text-foreground">{new Date(singleType.updatedAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl flex gap-3 text-primary shadow-xs">
                <ShieldCheck className="h-5 w-5 shrink-0" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Data single type terisolasi per workspace. Perubahan hanya berlaku untuk workspace <strong className="text-foreground">{tenantSlug}</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

