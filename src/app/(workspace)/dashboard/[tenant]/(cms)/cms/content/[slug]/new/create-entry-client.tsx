"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft, Save, Send, FileText, CheckCircle2, 
  Clock, Archive, Loader2, Globe, Layout, ChevronDown,
  Calendar as CalendarIcon, Eye, AlertCircle, Check, Plus, Sparkles,
  Zap, Info
} from "lucide-react"
import { useSession } from "next-auth/react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { allowedInitialStatuses } from "@/lib/content-workflow-rules"

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
import { ButtonField } from "@/components/content/field-renderers/button-field"
import { TagsField } from "@/components/content/field-renderers/tags-field"
import { AdvancedField } from "@/components/content/field-renderers/advanced-fields"
import { SlugField } from "@/components/content/field-renderers/slug-field"
import { UrlField } from "@/components/content/field-renderers/url-field"
import { PhoneField } from "@/components/content/field-renderers/phone-field"
import { MultiSelectField } from "@/components/content/field-renderers/multiselect-field"
import { RatingField } from "@/components/content/field-renderers/rating-field"
import { MarkdownField } from "@/components/content/field-renderers/markdown-field"
import { CurrencyField } from "@/components/content/field-renderers/currency-field"
import { DateRangeField } from "@/components/content/field-renderers/date-range-field"
import { DynamicZoneField } from "@/components/content/field-renderers/dynamic-zone-field"
import { PasswordField } from "@/components/content/field-renderers/password-field"
import { PercentField } from "@/components/content/field-renderers/percent-field"
import { IconField } from "@/components/content/field-renderers/icon-field"
import { SeoField } from "@/components/content/field-renderers/seo-field"
import { CodeField } from "@/components/content/field-renderers/code-field"
import { DocumentTemplateField } from "@/components/content/field-renderers/document-template-field"
import { ValidationField } from "@/components/content/field-renderers/validation-fields"
import { isFieldVisible } from "@/lib/field-visibility"
import { AIAssistantDialog } from "@/components/content/ai-assistant-dialog"
import { AISmartFill } from "@/components/content/ai-smart-fill"
import { getContentTypeBySlugAction } from "@/actions/content-types"
import { createEntryAction } from "@/actions/content"

interface Field {
  id: string
  name: string
  slug: string
  type: string
  required: boolean
  options: any
  relationSlug?: string
}

interface ContentType {
  id: string
  name: string
  slug: string
  description: string | null
  fields: Field[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  DRAFT: { 
    label: "Draft", 
    color: "bg-muted text-muted-foreground border-border/80", 
    icon: FileText 
  },
  IN_REVIEW: { 
    label: "In Review", 
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", 
    icon: Clock 
  },
  APPROVED: { 
    label: "Approved", 
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", 
    icon: CheckCircle2 
  },
  SCHEDULED: { 
    label: "Scheduled", 
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20", 
    icon: Clock 
  },
  PUBLISHED: { 
    label: "Published", 
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", 
    icon: CheckCircle2 
  },
  ARCHIVED: { 
    label: "Archived", 
    color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20", 
    icon: Archive 
  },
  REJECTED: { 
    label: "Rejected", 
    color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", 
    icon: AlertCircle 
  },
}

export default function CMSCreateEntryClient({
  tenantSlug,
  contentTypeSlug,
  initialContentType,
  initialAvailableLocales,
  initialIsLimitReached,
  initialEntriesLimit,
  initialPreviewUrl,
  userRole,
  customPermissions: initialCustomPermissions,
}: {
  tenantSlug: string
  contentTypeSlug: string
  initialContentType?: ContentType | null
  initialAvailableLocales?: any[]
  initialIsLimitReached?: boolean
  initialEntriesLimit?: number
  initialPreviewUrl?: string | null
  userRole?: string
  customPermissions?: string[] | null
}) {
  const { data: session } = useSession()
  const router = useRouter()

  const [loading, setLoading] = useState(!initialContentType)
  const [saving, setSaving] = useState(false)
  const [contentType, setContentType] = useState<ContentType | null>(initialContentType || null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [entryStatus, setEntryStatus] = useState<string>("DRAFT")
  const [locale, setLocale] = useState<string>(initialAvailableLocales?.[0]?.locale || "id")
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>(undefined)
  const [availableLocales, setAvailableLocales] = useState<any[]>(initialAvailableLocales || [{ locale: "id", name: "Bahasa Indonesia" }])
  const [isLimitReached, setIsLimitReached] = useState(initialIsLimitReached || false)
  const [entriesLimit, setEntriesLimit] = useState(initialEntriesLimit || 0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl || null)

  const tenantMembership = session?.user?.tenants?.find((tenant) => tenant.slug === tenantSlug || tenant.id === tenantSlug)
  const effectiveRole = userRole || (session?.user?.role === "super_admin" ? "owner" : (tenantMembership?.role || "viewer"))
  const customPermissions = initialCustomPermissions !== undefined 
    ? initialCustomPermissions 
    : (Array.isArray(tenantMembership?.customPermissions) ? tenantMembership.customPermissions as string[] : null)

  const availableStatuses = useMemo(() => {
    return allowedInitialStatuses(effectiveRole, customPermissions)
  }, [effectiveRole, customPermissions])

  const canPublish = availableStatuses.includes("PUBLISHED")
  const canSchedule = availableStatuses.includes("SCHEDULED")

  const fetchData = useCallback(async () => {
    if (!tenantSlug || !contentTypeSlug) return
    try {
      if (!contentType) setLoading(true)
      const ctData = await getContentTypeBySlugAction(tenantSlug, contentTypeSlug)
      if (ctData?.contentType) {
        setContentType(ctData.contentType as any)
      }
    } catch {
      // Keep initial content type
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, contentTypeSlug, contentType])

  useEffect(() => {
    if (!initialContentType) fetchData()
  }, [fetchData, initialContentType])

  const handleSave = async (publishNow: boolean = false, targetOverride?: string) => {
    if (isLimitReached) {
      toast({ variant: "destructive", title: "Batas Kuota Tercapai", description: "Tingkatkan paket untuk membuat entri baru." })
      return
    }

    setSaving(true)
    let targetStatus = publishNow ? "PUBLISHED" : (targetOverride || entryStatus)
    if (!publishNow && scheduledAt && targetStatus !== "ARCHIVED") {
      targetStatus = "SCHEDULED"
    }

    try {
      const res = await createEntryAction(tenantSlug, contentTypeSlug, {
        data: formData,
        status: targetStatus,
        locale,
        scheduledAt: scheduledAt || null
      })

      if (res.error) {
        let errorDesc = res.error
        if (res.details && typeof res.details === 'object') {
          const detailList = Object.entries(res.details).map(([k, v]) => `${k}: ${v}`).join(", ")
          if (detailList) errorDesc = `${res.error} (${detailList})`
        }
        toast({ variant: "destructive", title: "Gagal Menyimpan", description: errorDesc })
      } else {
        toast({ 
          title: publishNow ? "Entri Berhasil Dipublikasikan" : "Entri Berhasil Disimpan",
          description: `Data untuk ${contentType?.name || 'konten'} berhasil dibuat.`
        })
        router.push(`/dashboard/${tenantSlug}/cms/content/${contentTypeSlug}`)
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: error.message || "Gagal menghubungi server" })
    } finally {
      setSaving(false)
    }
  }

  const handleFieldChange = (slug: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [slug]: value,
    }))
  }

  const handleSmartFill = (generatedData: Record<string, unknown>) => {
    setFormData((prev) => ({
      ...prev,
      ...generatedData,
    }))
    toast({
      title: "Smart Fill Berhasil",
      description: "Data form telah diisi otomatis oleh AI sesuai konteks.",
    })
  }

  const renderField = (field: Field) => {
    const value = formData[field.slug]

    const renderLabelWithAI = () => (
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-foreground flex items-center gap-1">
          {field.name}
          {field.required && <span className="text-destructive">*</span>}
        </Label>
        <AIAssistantDialog 
          tenantSlug={tenantSlug}
          contentTypeSlug={contentTypeSlug}
          fieldName={field.name}
          currentValue={value as string}
          onApply={(val) => handleFieldChange(field.slug, val)}
        />
      </div>
    )

    switch (field.type) {
      case "text":
        return <div className="space-y-1.5">{renderLabelWithAI()}<TextField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "slug":
        return (
          <div className="space-y-1.5">
            {renderLabelWithAI()}
            <SlugField
              value={value as string}
              onChange={v => handleFieldChange(field.slug, v)}
              required={field.required}
              sourceValue={formData.title as string || formData.judul as string || formData.name as string}
            />
          </div>
        )

      case "textarea":
        return <div className="space-y-1.5">{renderLabelWithAI()}<TextareaField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "richText":
        return <div className="space-y-1.5">{renderLabelWithAI()}<RichTextField value={value as string} onChange={v => handleFieldChange(field.slug, v)} /></div>

      case "markdown":
        return <div className="space-y-1.5">{renderLabelWithAI()}<MarkdownField value={value as string} onChange={v => handleFieldChange(field.slug, v)} /></div>

      case "number":
        return <div className="space-y-1.5">{renderLabelWithAI()}<NumberField value={value as number} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "currency":
        return <div className="space-y-1.5">{renderLabelWithAI()}<CurrencyField value={value as number} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "boolean":
        return <BooleanField label={field.name} value={value as boolean} onChange={v => handleFieldChange(field.slug, v)} />

      case "date":
        return <div className="space-y-1.5">{renderLabelWithAI()}<DateField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "dateRange":
        return <div className="space-y-1.5">{renderLabelWithAI()}<DateRangeField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "datetime":
        return <div className="space-y-1.5">{renderLabelWithAI()}<DateTimeField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="datetime" /></div>

      case "time":
        return <div className="space-y-1.5">{renderLabelWithAI()}<DateTimeField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="time" /></div>

      case "email":
        return <div className="space-y-1.5">{renderLabelWithAI()}<ValidationField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="email" /></div>

      case "uid":
        return <div className="space-y-1.5">{renderLabelWithAI()}<ValidationField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="uid" /></div>

      case "select":
        return <div className="space-y-1.5">{renderLabelWithAI()}<SelectField value={value as string} onChange={v => handleFieldChange(field.slug, v)} options={field.options?.choices || field.options?.options || field.options || []} required={field.required} /></div>

      case "multiselect":
        return <div className="space-y-1.5">{renderLabelWithAI()}<MultiSelectField value={value as string[]} onChange={v => handleFieldChange(field.slug, v)} options={field.options?.choices || field.options?.options || field.options || []} required={field.required} /></div>

      case "tags":
        return <div className="space-y-1.5">{renderLabelWithAI()}<TagsField value={Array.isArray(value) ? value : (typeof value === 'string' && value ? [value] : [])} onChange={v => handleFieldChange(field.slug, v)} /></div>

      case "media":
        return <div className="space-y-1.5">{renderLabelWithAI()}<MediaField value={value as any} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} type="image" /></div>

      case "file":
        return <div className="space-y-1.5">{renderLabelWithAI()}<MediaField value={value as any} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} type="file" /></div>

      case "mediaMultiple":
        return <div className="space-y-1.5">{renderLabelWithAI()}<MediaMultipleField value={Array.isArray(value) ? value : []} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} /></div>


      case "relation": {
        const isMultiple = field.options?.relationType === "oneToMany" || 
                           field.options?.relationType === "manyToMany" || 
                           field.options?.multiple === true
        const targetSlug = field.relationSlug || field.options?.targetSlug || ""
        return (
          <div className="space-y-1.5">
            {renderLabelWithAI()}
            <RelationSelectField
              value={value as any}
              onChange={v => handleFieldChange(field.slug, v)}
              targetSlug={targetSlug}
              tenantSlug={tenantSlug}
              required={field.required}
              multiple={isMultiple}
              relationType={field.options?.relationType}
            />
          </div>
        )
      }

      case "component":
        return <div className="space-y-1.5"><ComponentField label={field.name} componentSlug={field.options?.componentSlug} value={value} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} repeatable={field.options?.repeatable} /></div>

      case "repeater":
        return <div className="space-y-1.5"><DynamicZoneField label={field.name} allowedComponents={field.options?.allowedComponents || []} value={value as any} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} /></div>

      case "json":
        return <div className="space-y-1.5">{renderLabelWithAI()}<AdvancedField type="json" value={value} onChange={v => handleFieldChange(field.slug, v)} label={field.name} required={field.required} /></div>

      case "color":
        return <div className="space-y-1.5">{renderLabelWithAI()}<AdvancedField type="color" value={value} onChange={v => handleFieldChange(field.slug, v)} label={field.name} required={field.required} /></div>

      case "location":
        return <div className="space-y-1.5">{renderLabelWithAI()}<AdvancedField type="location" value={value} onChange={v => handleFieldChange(field.slug, v)} label={field.name} required={field.required} /></div>

      case "url":
        return <div className="space-y-1.5">{renderLabelWithAI()}<UrlField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "phone":
        return <div className="space-y-1.5">{renderLabelWithAI()}<PhoneField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "password":
        return <div className="space-y-1.5">{renderLabelWithAI()}<PasswordField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "rating":
        return <div className="space-y-1.5">{renderLabelWithAI()}<RatingField value={value as number} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "percent":
        return <div className="space-y-1.5">{renderLabelWithAI()}<PercentField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "icon":
        return <div className="space-y-1.5">{renderLabelWithAI()}<IconField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "seo":
        return <div className="space-y-1.5">{renderLabelWithAI()}<SeoField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "code":
        return <div className="space-y-1.5">{renderLabelWithAI()}<CodeField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "button":
        return <div className="space-y-1.5">{renderLabelWithAI()}<ButtonField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} /></div>

      case "document_template":
        return (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">{field.name}</Label>
            <DocumentTemplateField 
              field={field}
              value={value}
              onChange={v => handleFieldChange(field.slug, v)}
              tenantSlug={tenantSlug}
              contentTypeSlug={contentTypeSlug}
              allFields={contentType?.fields || []}
              entryData={formData}
            />
          </div>
        )
      
      default:
        return <div className="space-y-1.5"><Label className="text-xs font-bold text-foreground">{field.name}</Label><Input className="h-9 rounded-xl text-xs bg-background border-border/80" value={value as string || ""} onChange={e => handleFieldChange(field.slug, e.target.value)} /></div>
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[entryStatus] || STATUS_CONFIG.DRAFT
  const StatusIcon = statusCfg.icon

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className="flex-1 bg-background text-foreground flex flex-col w-full">
        <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">

          {/* Top Bar Navigation & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => router.push(`/dashboard/${tenantSlug}/cms/content/${contentTypeSlug}`)}
                className="h-9 w-9 rounded-xl border-border/80 hover:bg-muted shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">
                    Buat {contentType?.name || "Entri Baru"}
                  </h1>
                  <Badge className={cn("text-[10px] font-bold uppercase rounded-md", statusCfg.color)}>
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {statusCfg.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Isi informasi dan data untuk membuat konten baru pada model koleksi <code className="font-mono font-bold text-foreground">{contentTypeSlug}</code>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {contentType && (
                <AISmartFill 
                  tenantSlug={tenantSlug}
                  contentTypeName={contentType.name}
                  schema={contentType.fields || []}
                  onApply={handleSmartFill}
                />
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(false, "DRAFT")}
                disabled={saving || isLimitReached}
                className="rounded-xl h-9 text-xs font-bold border-border/80"
              >
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Simpan Draft
              </Button>

              {canPublish && (
                <Button
                  size="sm"
                  onClick={() => handleSave(true)}
                  disabled={saving || isLimitReached}
                  className="rounded-xl h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  Publikasikan
                </Button>
              )}
            </div>
          </div>

          {/* Limit Reached Warning */}
          {isLimitReached && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div className="font-medium">
                Workspace Anda telah mencapai batas kuota entri konten ({entriesLimit} entri). Anda tidak dapat membuat entri baru sampai kuota ditingkatkan.
              </div>
            </div>
          )}

          {/* Main Grid: Form Left, Workflow & Meta Sidebar Right */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Form Fields Section */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-2xl border-border/80 shadow-xs bg-card">
                <CardHeader className="pb-4 border-b border-border/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-foreground">Data Isian Konten</CardTitle>
                      <CardDescription className="text-xs">Lengkapi seluruh kolom atribut yang diperlukan untuk entri ini.</CardDescription>
                    </div>
                    {availableLocales.length > 1 && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        <Select value={locale} onValueChange={setLocale}>
                          <SelectTrigger className="h-8 w-32 text-xs font-bold rounded-xl bg-background border-border/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-border">
                            {availableLocales.map((loc) => (
                              <SelectItem key={loc.locale} value={loc.locale} className="text-xs font-medium">
                                {loc.name || loc.locale.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-5">
                  {(() => {
                    const visibleFields = (contentType?.fields || []).filter((f: any) => {
                      if (f.showInCms === false) return false
                      if (typeof f.options === 'object' && f.options !== null && f.options.showInCms === false) return false
                      if (!isFieldVisible(f, formData)) return false
                      return true
                    })

                    if (visibleFields.length > 0) {
                      return visibleFields.map((field: any) => (
                        <div key={field.id} className="space-y-1">
                          {renderField(field)}
                        </div>
                      ))
                    }

                    return (
                      <div className="py-12 text-center text-muted-foreground">
                        <Layout className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-semibold">Tidak ada kolom yang ditampilkan di CMS</p>
                        <p className="text-xs mt-1">Aktifkan "Tampilkan di CMS" melalui Content Type Builder.</p>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Right Sidebar: Status, Workflow, Publishing Schedule */}
            <div className="space-y-6">
              <Card className="rounded-2xl border-border/80 shadow-xs bg-card">
                <CardHeader className="pb-3 border-b border-border/60">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Pengaturan Alur Kerja (Workflow)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {/* Status Selector */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">Status Awal</Label>
                    <Select value={entryStatus} onValueChange={setEntryStatus}>
                      <SelectTrigger className="h-9 rounded-xl text-xs font-bold bg-background border-border/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border">
                        {availableStatuses.map((st) => (
                          <SelectItem key={st} value={st} className="text-xs font-medium">
                            {STATUS_CONFIG[st]?.label || st}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Pilih status tahap awal publikasi sesuai hak peran Anda (<span className="capitalize font-bold text-foreground">{effectiveRole}</span>).
                    </p>
                  </div>

                  {/* Scheduled Publishing */}
                  {canSchedule && (
                    <div className="space-y-2 pt-3 border-t border-border/60">
                      <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5 text-purple-500" /> Jadwal Publikasi Otomatis
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-9 justify-start text-left text-xs font-normal rounded-xl border-border/80",
                              !scheduledAt && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                            {scheduledAt ? format(scheduledAt, "PPP HH:mm") : "Pilih Tanggal & Waktu"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl border-border bg-card" align="start">
                          <Calendar
                            mode="single"
                            selected={scheduledAt}
                            onSelect={setScheduledAt}
                            disabled={(date) => date < new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      {scheduledAt && (
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Akan terbit: {format(scheduledAt, "dd/MM/yyyy HH:mm")}</span>
                          <button 
                            type="button" 
                            onClick={() => setScheduledAt(undefined)}
                            className="text-destructive hover:underline font-semibold"
                          >
                            Batal Jadwal
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Save Action Button */}
                  <div className="pt-3 border-t border-border/60">
                    <Button
                      className="w-full h-10 font-bold rounded-xl text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                      onClick={() => handleSave(entryStatus === "PUBLISHED")}
                      disabled={saving || isLimitReached}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Simpan & Selesaikan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}
