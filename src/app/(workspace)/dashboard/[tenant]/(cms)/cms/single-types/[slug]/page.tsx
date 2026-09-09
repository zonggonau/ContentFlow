"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { 
  ArrowLeft, Save, FileText, Loader2, 
  Globe, ShieldCheck, Send, Zap
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getSingleTypeBySlugAction, saveSingleTypeDataAction } from "@/actions/single-types"

// Field Renderers
import { TextField } from "@/components/content/field-renderers/text-field"
import { TextareaField } from "@/components/content/field-renderers/textarea-field"
import { NumberField } from "@/components/content/field-renderers/number-field"
import { DateTimeField } from "@/components/content/field-renderers/datetime-field"
import { BooleanField } from "@/components/content/field-renderers/boolean-field"
import { DateField } from "@/components/content/field-renderers/date-field"
import { SelectField } from "@/components/content/field-renderers/select-field"
import { MediaField } from "@/components/content/field-renderers/media-field"
import { MediaMultipleField } from "@/components/content/field-renderers/media-multiple-field"
import { RichTextField } from "@/components/content/field-renderers/rich-text-field"
import { RelationSelectField } from "@/components/content/field-renderers/relation-select-field"
import { ComponentField } from "@/components/content/field-renderers/component-field"
import { TagsField } from "@/components/content/field-renderers/tags-field"
import { AdvancedField } from "@/components/content/field-renderers/advanced-fields"
import { SlugField } from "@/components/content/field-renderers/slug-field"
import { PercentField } from "@/components/content/field-renderers/percent-field"
import { IconField } from "@/components/content/field-renderers/icon-field"
import { SeoField } from "@/components/content/field-renderers/seo-field"
import { CodeField } from "@/components/content/field-renderers/code-field"
import { ValidationField } from "@/components/content/field-renderers/validation-fields"
import { isFieldVisible } from "@/lib/field-visibility"
import { AIAssistantDialog } from "@/components/content/ai-assistant-dialog"

interface Field {
  id: string
  name: string
  slug: string
  type: string
  required: boolean
  options?: any
  relationSlug?: string
}

interface SingleType {
  id: string
  name: string
  slug: string
  description: string | null
  fields: Field[]
  data: Record<string, unknown> | null
  publishedAt: string | null
  updatedAt: string
}

export default function CMSSingleTypeDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const tenantSlug = params?.tenant as string
  const singleTypeSlug = params?.slug as string
  
  const [singleType, setSingleType] = useState<SingleType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [locale, setLocale] = useState<string>("id")
  const [availableLocales, setAvailableLocales] = useState<any[]>([{ locale: "id", name: "Bahasa Indonesia" }])

  const fetchData = useCallback(async () => {
    if (!tenantSlug || !singleTypeSlug) return
    setLoading(true)
    try {
      const [stRes, locRes] = await Promise.all([
        getSingleTypeBySlugAction(tenantSlug, singleTypeSlug),
        fetch(`/api/tenant/${tenantSlug}/locales`)
      ])
      
      if (stRes.singleType) {
        setSingleType(stRes.singleType as any)
        setFormData(stRes.singleType.data || {})
      } else if (stRes.error) {
        toast({ variant: "destructive", title: "Terjadi Kesalahan", description: stRes.error })
      }
      if (locRes.ok) {
        try {
          const data = await locRes.json()
          if (data.locales?.length > 0) setAvailableLocales(data.locales)
        } catch (e) {
          console.error("Failed to parse locales response:", e)
        }
      }
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Gagal memuat konten halaman" })
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, singleTypeSlug])

  useEffect(() => {
    if (session?.user?.id) fetchData()
  }, [session?.user?.id, fetchData])

  const handleFieldChange = (fieldSlug: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [fieldSlug]: value
    }))
  }

  const handleSave = async (publish: boolean = false) => {
    if (!singleType) return
    setSaving(true)
    try {
      const res = await saveSingleTypeDataAction(tenantSlug, singleType.id, formData, publish)
      if (res && !res.error) {
        toast({ 
          title: publish ? "Halaman Diterbitkan" : "Draft Disimpan", 
          description: publish ? "Perubahan halaman kini live di API publik" : "Draft perubahan konten berhasil disimpan" 
        })
        fetchData()
      } else {
        toast({ variant: "destructive", title: "Gagal Menyimpan", description: res?.error || "Terjadi kesalahan saat menyimpan konten" })
      }
    } catch (error) {
      console.error(error)
      toast({ variant: "destructive", title: "Koneksi Error", description: "Gagal menghubungi server" })
    } finally {
      setSaving(false)
    }
  }

  const renderField = (field: Field) => {
    const value = formData[field.slug]
    const renderLabelWithAI = () => (
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          {field.name}
          {field.required && <span className="text-destructive font-bold">*</span>}
        </Label>
        {["text", "richText", "textarea"].includes(field.type) && (
          <AIAssistantDialog 
            fieldName={field.name}
            contentTypeSlug={singleType?.slug || ""} 
            tenantSlug={tenantSlug} 
            currentValue={value as string || ""} 
            onApply={val => handleFieldChange(field.slug, val)} 
          />
        )}
      </div>
    )

    switch (field.type) {
      case "text":
        return <div className="space-y-1.5">{renderLabelWithAI()}<TextField label="" value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>
      
      case "slug":
        return <div className="space-y-1.5">{renderLabelWithAI()}<SlugField label="" value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "textarea":
        return <div className="space-y-1.5">{renderLabelWithAI()}<TextareaField label="" value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "richText":
        return <div className="space-y-1.5">{renderLabelWithAI()}<RichTextField label="" value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "number":
        return <div className="space-y-1.5">{renderLabelWithAI()}<NumberField label="" value={value as number || 0} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "boolean":
        return <div className="space-y-1.5">{renderLabelWithAI()}<BooleanField label="" value={value as boolean || false} onChange={v => handleFieldChange(field.slug, v)} /></div>

      case "date":
        return <div className="space-y-1.5">{renderLabelWithAI()}<DateField label="" value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "datetime":
        return <div className="space-y-1.5">{renderLabelWithAI()}<DateTimeField label="" value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="datetime" /></div>

      case "time":
        return <div className="space-y-1.5">{renderLabelWithAI()}<DateTimeField label="" value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="time" /></div>

      case "email":
        return <div className="space-y-1.5">{renderLabelWithAI()}<ValidationField value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="email" /></div>

      case "uid":
        return <div className="space-y-1.5">{renderLabelWithAI()}<ValidationField value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="uid" /></div>

      case "select":
        return <div className="space-y-1.5">{renderLabelWithAI()}<SelectField label="" options={field.options} value={value as string || ""} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "tags":
        return <div className="space-y-1.5">{renderLabelWithAI()}<TagsField value={Array.isArray(value) ? value : []} onChange={v => handleFieldChange(field.slug, v)} /></div>

      case "media":
        return <div className="space-y-1.5">{renderLabelWithAI()}<MediaField label="" value={value as any} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} type="image" /></div>

      case "file":
        return <div className="space-y-1.5">{renderLabelWithAI()}<MediaField label="" value={value as any} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} type="file" /></div>

      case "mediaMultiple":
        return <div className="space-y-1.5">{renderLabelWithAI()}<MediaMultipleField label="" value={Array.isArray(value) ? value : []} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} /></div>

      case "relation":
        let relOpts: any = {}
        try { relOpts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options } catch { relOpts = {} }
        return (
          <div className="space-y-1.5">
            {renderLabelWithAI()}
            <RelationSelectField
              label=""
              tenantSlug={tenantSlug}
              targetSlug={field.relationSlug || relOpts?.targetSlug || relOpts?.targetContentType || ""}
              multiple={relOpts?.relationType === "manyToMany" || relOpts?.relationType === "oneToMany" || relOpts?.multiple === true}
              value={value as any}
              onChange={v => handleFieldChange(field.slug, v)}
              relationType={relOpts?.relationType}
            />
          </div>
        )

      case "json":
      case "color":
      case "location":
        return <div className="space-y-1.5">{renderLabelWithAI()}<AdvancedField type={field.type as any} value={value} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "percent":
        return <div className="space-y-1.5">{renderLabelWithAI()}<PercentField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "icon":
        return <div className="space-y-1.5">{renderLabelWithAI()}<IconField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "seo":
        return <div className="space-y-1.5">{renderLabelWithAI()}<SeoField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "code":
        return <div className="space-y-1.5">{renderLabelWithAI()}<CodeField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "component":
        let compOpts: any = {}
        try { compOpts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options } catch { compOpts = {} }
        return <div className="space-y-1.5">{renderLabelWithAI()}<ComponentField label={null} tenantSlug={tenantSlug} componentSlug={compOpts?.componentSlug} value={value} onChange={v => handleFieldChange(field.slug, v)} repeatable={compOpts?.repeatable} /></div>
      
      default:
        return <div className="space-y-1.5"><Label className="text-xs font-semibold text-foreground">{field.name}</Label><Input value={value as string || ""} onChange={e => handleFieldChange(field.slug, e.target.value)} className="rounded-xl h-9 text-xs" /></div>
    }
  }

  if (loading) return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (!singleType) return null

  const tenantMembership = session?.user?.tenants?.find((t) => t.slug === tenantSlug || t.id === tenantSlug)
  const effectiveRole = session?.user?.role === "super_admin" 
    ? "owner" 
    : (tenantMembership?.role || "owner")
  const customPermissions = Array.isArray(tenantMembership?.customPermissions)
    ? tenantMembership.customPermissions as string[]
    : null

  const isRestrictedViewer = effectiveRole === "subscriber" || effectiveRole === "viewer"
  const canPublish = !isRestrictedViewer || Boolean(customPermissions?.includes("workflow.draft_to_publish"))
  const canEdit = !isRestrictedViewer

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/${tenantSlug}/cms/single-types`)} className="rounded-xl h-9 w-9">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-foreground">{singleType.name}</h1>
              <Badge className={cn("text-[10px] font-bold uppercase px-2.5 py-0.5 shadow-none border rounded-full", singleType.publishedAt ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border/60")}>
                {singleType.publishedAt ? "Terbit" : "Draft"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Konten Singleton &middot; /{singleType.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            onClick={() => handleSave(false)} 
            disabled={saving || !canEdit} 
            className="rounded-xl text-xs font-bold h-9 shadow-xs"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Simpan Draft
          </Button>
          <Button 
            onClick={() => handleSave(true)} 
            disabled={saving || !canPublish} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-9 px-4 font-bold text-xs shadow-xs"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            Terbitkan Sekarang
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-border/80 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 p-5">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <FileText className="h-4 w-4 text-primary" /> Editor Konten Halaman
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {singleType.fields.length === 0 ? (
                <div className="text-center py-12 opacity-40">
                  <Zap className="h-10 w-10 mx-auto mb-2 text-primary" />
                  <p className="font-bold text-xs text-foreground">Belum ada field yang didefinisikan untuk halaman ini</p>
                </div>
              ) : (
                singleType.fields.filter((field) => isFieldVisible(field, formData)).map((field) => (
                  <div key={field.id} className="space-y-1.5 pb-2">
                    {renderField(field)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border border-border/80 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-foreground">
                <Globe className="h-4 w-4 text-primary" /> Bahasa & Lokalisasi
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Bahasa Target</Label>
                <Select value={locale} onValueChange={setLocale}>
                  <SelectTrigger className="bg-background border-border/80 h-9 rounded-xl font-bold text-xs text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-card">
                    {availableLocales.map(l => (
                      <SelectItem key={l.locale} value={l.locale} className="font-bold text-xs rounded-lg">{l.name} ({l.locale.toUpperCase()})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="p-4 bg-muted/20 border border-border/80 rounded-2xl text-foreground shadow-xs relative">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">Data Terisolasi</h4>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Perubahan pada halaman ini khusus disimpan untuk workspace <strong>{tenantSlug}</strong> dan aman dari workspace lain.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
