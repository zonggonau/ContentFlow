"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft, Save, Send, FileText, CheckCircle2, 
  Clock, Archive, Loader2, Globe, Layout, ChevronDown,
  Calendar as CalendarIcon, Eye, AlertCircle, Check, Plus, Zap
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
import { PercentField } from "@/components/content/field-renderers/percent-field"
import { IconField } from "@/components/content/field-renderers/icon-field"
import { SeoField } from "@/components/content/field-renderers/seo-field"
import { CodeField } from "@/components/content/field-renderers/code-field"
import { DocumentTemplateField } from "@/components/content/field-renderers/document-template-field"
import { ValidationField } from "@/components/content/field-renderers/validation-fields"
import { isFieldVisible } from "@/lib/field-visibility"
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

export default function CTBNewEntryClient({
  tenantSlug,
  contentTypeSlug,
}: {
  tenantSlug: string
  contentTypeSlug: string
}) {
  const router = useRouter()
  const { data: session } = useSession()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contentType, setContentType] = useState<ContentType | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [entryStatus, setEntryStatus] = useState<string>("DRAFT")
  const [locale, setLocale] = useState<string>("id")
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>(undefined)
  const [availableLocales, setAvailableLocales] = useState<any[]>([{ locale: "id", name: "Bahasa Indonesia" }])
  const [isLimitReached, setIsLimitReached] = useState(false)
  const [entriesLimit, setEntriesLimit] = useState(0)

  useEffect(() => {
    async function fetchData() {
      if (!tenantSlug || !contentTypeSlug) return
      try {
        setLoading(true)
        const [ctData, locRes, limitRes] = await Promise.all([
          getContentTypeBySlugAction(tenantSlug, contentTypeSlug),
          fetch(`/api/tenant/${tenantSlug}/locales`),
          fetch(`/api/tenant/${tenantSlug}/subscription/limit-check?feature=content_entries`),
        ])
        
        if (ctData?.error) {
          toast({ variant: "destructive", title: "Terjadi Kesalahan", description: ctData.error })
        } else if (ctData?.contentType) {
          setContentType(ctData.contentType as any)
        }

        if (locRes.ok) {
          const data = await locRes.json()
          if (data.locales?.length > 0) setAvailableLocales(data.locales)
        }

        if (limitRes.ok) {
          const data = await limitRes.json()
          setIsLimitReached(!data.allowed)
          setEntriesLimit(data.max || 0)
        }
      } catch (err) {
        toast({ variant: "destructive", title: "Terjadi Kesalahan", description: "Gagal memuat data persyaratan" })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [tenantSlug, contentTypeSlug])

  const handleSave = async (publishNow: boolean = false, targetOverride?: string) => {
    if (isLimitReached) {
      toast({ variant: "destructive", title: "Batas Kuota Tercapai", description: "Workspace Anda telah mencapai batas maksimal entri konten." })
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
        toast({ variant: "destructive", title: "Gagal Membuat Entri", description: res.error })
      } else {
        toast({ 
          title: publishNow ? "Berhasil Diterbitkan" : "Entri Berhasil Dibuat",
          description: `Entri untuk ${contentType?.name || 'konten'} berhasil dibuat.`
        })
        router.push(`/dashboard/${tenantSlug}/content-type-builder/content-types/${contentTypeSlug}`)
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Terjadi Kesalahan", description: error.message || "Terjadi kesalahan pada sistem" })
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
      title: "Smart Fill applied",
      description: "Form fields have been filled with AI-generated data.",
    })
  }

  const renderField = (field: Field) => {
    const value = formData[field.slug]

    switch (field.type) {
      case "text":
        return <TextField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "slug":
        return (
          <SlugField
            value={value as string}
            onChange={v => handleFieldChange(field.slug, v)}
            required={field.required}
            sourceValue={formData.title as string || formData.name as string}
          />
        )

      case "textarea":
        return <TextareaField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "richText":
        return <RichTextField value={value as string} onChange={v => handleFieldChange(field.slug, v)} />

      case "number":
        return <NumberField value={value as number} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "boolean":
        return <BooleanField label={field.name} value={value as boolean} onChange={v => handleFieldChange(field.slug, v)} />

      case "date":
        return <DateField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "datetime":
        return <DateTimeField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="datetime" />

      case "time":
        return <DateTimeField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="time" />

      case "email":
        return <ValidationField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="email" />

      case "uid":
        return <ValidationField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} type="uid" />

      case "select":
        return <SelectField value={value as string} onChange={v => handleFieldChange(field.slug, v)} options={field.options?.choices || field.options?.options || field.options || []} required={field.required} />

      case "media":
        return <MediaField value={value as any} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} type="image" />

      case "file":
        return <MediaField value={value as any} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} type="file" />

      case "mediaMultiple":
        return <MediaMultipleField value={value as any} onChange={v => handleFieldChange(field.slug, v)} tenantSlug={tenantSlug} />

      case "relation": {
        const isMultiple = field.options?.relationType === "oneToMany" || 
                           field.options?.relationType === "manyToMany" || 
                           field.options?.multiple === true
        const targetSlug = field.relationSlug || field.options?.targetSlug || ""
        return (
          <RelationSelectField
            value={value as any}
            onChange={v => handleFieldChange(field.slug, v)}
            tenantSlug={tenantSlug}
            targetSlug={targetSlug}
            required={field.required}
            multiple={isMultiple}
            relationType={field.options?.relationType}
          />
        )
      }

      case "button":
        return <ButtonField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "tags":
        return <TagsField value={value as string[]} onChange={v => handleFieldChange(field.slug, v)} />

      case "component":
        const opts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options
        return <ComponentField tenantSlug={tenantSlug} componentSlug={opts?.componentSlug} value={value} onChange={v => handleFieldChange(field.slug, v)} label={field.name} repeatable={opts?.repeatable} />

      case "json":
        return <AdvancedField type="json" value={value} onChange={v => handleFieldChange(field.slug, v)} label={field.name} required={field.required} />

      case "color":
        return <AdvancedField type="color" value={value} onChange={v => handleFieldChange(field.slug, v)} label={field.name} required={field.required} />

      case "location":
        return <AdvancedField type="location" value={value} onChange={v => handleFieldChange(field.slug, v)} label={field.name} required={field.required} />

      case "percent":
        return <PercentField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "icon":
        return <IconField value={value as string} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "seo":
        return <SeoField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "code":
        return <CodeField value={value as any} onChange={v => handleFieldChange(field.slug, v)} required={field.required} />

      case "document_template":
        return (
          <DocumentTemplateField 
            field={field}
            value={value}
            onChange={v => handleFieldChange(field.slug, v)}
            tenantSlug={tenantSlug}
            contentTypeSlug={contentTypeSlug}
            allFields={contentType?.fields || []}
            entryData={formData}
          />
        )

      default:
        return <Input value={value as string || ""} onChange={e => handleFieldChange(field.slug, e.target.value)} />
      }
  }

  if (loading) return <div className="flex items-center justify-center flex-1 flex-col w-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  if (!contentType) {
    return (
      <div className="flex flex-1 flex-col w-full">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center w-full">
          <div className="w-20 h-20 rounded-none bg-red-50 flex items-center justify-center mb-6 text-red-500">
            <AlertCircle className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Content Type Not Found</h2>
          <p className="text-muted-foreground mt-2 max-w-sm">
            We couldn't find the structure for <strong>{contentTypeSlug}</strong>. It might have been deleted or moved.
          </p>
          <Button variant="outline" className="mt-8 rounded-none font-bold" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Button>
        </div>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[entryStatus] || STATUS_CONFIG.DRAFT

  return (
    <div className="flex flex-1 flex-col w-full min-h-screen">
      <div className="flex-1 bg-background text-foreground flex w-full flex-col">
        
        {/* Editor Pane */}
        <div className="flex flex-col flex-1 w-full">
          {/* Sticky Header */}
          <div className="bg-card/80 backdrop-blur-md border-b border-border/60 px-4 md:px-6 py-3.5 sticky top-0 z-10 shrink-0">
            <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8 hover:bg-muted/60" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-base font-black text-foreground">New {contentType.name}</h1>
                    <Badge className={cn("text-[9px] font-bold uppercase rounded-full px-2 py-0.5", statusCfg.color)}>
                      {statusCfg.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">Create new entry for {contentTypeSlug}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AISmartFill 
                  tenantSlug={tenantSlug}
                  contentTypeName={contentType.name}
                  schema={contentType.fields || []}
                  onApply={handleSmartFill}
                />

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-xl h-8 text-xs font-bold border-border/80" 
                  disabled={saving || isLimitReached}
                  onClick={() => handleSave(false, "DRAFT")}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Save Draft
                </Button>

                <Button 
                  size="sm" 
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-8 text-xs px-3 shadow-xs" 
                  disabled={saving || isLimitReached}
                  onClick={() => handleSave(true)}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Publish
                </Button>
              </div>
            </div>
          </div>

          {/* Form Content Area */}
          <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6 flex-1">
            {isLimitReached && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <div className="font-medium">
                  Your workspace has reached the limit for content entries ({entriesLimit} entries). Upgrade your plan to add more.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form Fields */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-sm font-bold">Content Fields</CardTitle>
                    <CardDescription className="text-xs">Fill in the required information below.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {contentType.fields.filter((field) => isFieldVisible(field, formData)).map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <Label className="text-xs font-bold text-foreground">
                          {field.name}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        {renderField(field)}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <Card className="rounded-2xl border-border/80 shadow-xs bg-card">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-sm font-bold">Publishing</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Status</Label>
                      <Select value={entryStatus} onValueChange={setEntryStatus}>
                        <SelectTrigger className="h-8 rounded-xl text-xs bg-background border-border/80">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border">
                          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
                            <SelectItem key={status} value={status} className="text-xs">
                              {cfg.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {availableLocales.length > 1 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Language</Label>
                        <Select value={locale} onValueChange={setLocale}>
                          <SelectTrigger className="h-8 rounded-xl text-xs bg-background border-border/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-border">
                            {availableLocales.map((loc) => (
                              <SelectItem key={loc.locale} value={loc.locale} className="text-xs">
                                {loc.name || loc.locale}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
