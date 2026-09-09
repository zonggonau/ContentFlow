"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

import { TextField } from "./text-field"
import { TextareaField } from "./textarea-field"
import { NumberField } from "./number-field"
import { DateTimeField } from "./datetime-field"
import { BooleanField } from "./boolean-field"
import { DateField } from "./date-field"
import { SelectField } from "./select-field"
import { normalizeSelectOptions } from "@/lib/select-options"
import { MediaField } from "./media-field"
import { SlugField } from "./slug-field"
import { RichTextField } from "./rich-text-field"
import { RelationSelectField } from "./relation-select-field"
import { AdvancedField } from "./advanced-fields"
import { UrlField } from "./url-field"
import { PhoneField } from "./phone-field"
import { MultiSelectField } from "./multiselect-field"
import { PasswordField } from "./password-field"
import { RatingField } from "./rating-field"
import { ButtonField } from "./button-field"
import { MarkdownField } from "./markdown-field"
import { CurrencyField } from "./currency-field"
import { DateRangeField } from "./date-range-field"
import { DynamicZoneField } from "./dynamic-zone-field"
import { PercentField } from "./percent-field"
import { IconField } from "./icon-field"
import { SeoField } from "./seo-field"
import { CodeField } from "./code-field"

interface FieldDefinition {
  id: string
  name: string
  slug: string
  type: string
  required: boolean
  options?: any
}

interface ComponentDefinition {
  id: string
  name: string
  slug: string
  fields: FieldDefinition[]
}

interface ComponentFieldProps {
  tenantSlug: string
  componentSlug: string
  value: any 
  onChange: (val: any) => void
  label: React.ReactNode
  repeatable?: boolean
}

export function ComponentField({
  tenantSlug,
  componentSlug,
  value,
  onChange,
  label,
  repeatable = false
}: ComponentFieldProps) {
  const [definition, setDefinition] = useState<ComponentDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set([0]))

  useEffect(() => {
    async function fetchDefinition() {
      if (!componentSlug || componentSlug === "undefined") {
        setLoading(false)
        return
      }
      try {
        const res = await fetch(`/api/tenant/${tenantSlug}/components/slug/${componentSlug}`)
        if (res.ok) {
          const data = await res.json()
          setDefinition(data)
        }
      } catch (err) {
        console.error("Failed to fetch component definition:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchDefinition()
  }, [tenantSlug, componentSlug])

  const handleAddField = () => {
    const newItem = {}
    const newValue = Array.isArray(value) ? [...value, newItem] : [newItem]
    onChange(newValue)
    setExpandedIndices(new Set(expandedIndices).add(newValue.length - 1))
  }

  const handleRemoveField = (index: number) => {
    if (!Array.isArray(value)) return
    const newValue = [...value]
    newValue.splice(index, 1)
    onChange(newValue)
  }

  const handleFieldChange = (index: number | null, fieldName: string, fieldValue: any) => {
    if (repeatable) {
      const newValue = Array.isArray(value) ? [...value] : []
      if (!newValue[index!]) newValue[index!] = {}
      newValue[index!] = { ...newValue[index!], [fieldName]: fieldValue }
      onChange(newValue)
    } else {
      const newValue = { ...(value || {}), [fieldName]: fieldValue }
      onChange(newValue)
    }
  }

  const toggleExpand = (index: number) => {
    const next = new Set(expandedIndices)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setExpandedIndices(next)
  }

  const renderInnerField = (field: FieldDefinition, data: any, index: number | null) => {
    const fieldValue = data?.[field.slug]
    const onFieldChange = (val: any) => handleFieldChange(index, field.slug, val)

    let selectOptions: any[] = []
    if (field.options) {
      selectOptions = normalizeSelectOptions(field.options)
    }

    switch (field.type) {
      case "text": 
        return <TextField value={fieldValue as string} onChange={onFieldChange} required={field.required} placeholder={field.name} />
      case "textarea": 
        return <TextareaField value={fieldValue as string} onChange={onFieldChange} required={field.required} />
      case "richText": 
        return <RichTextField value={fieldValue as string} onChange={onFieldChange} required={field.required} />
      case "markdown": 
        return <MarkdownField value={fieldValue as string} onChange={onFieldChange} required={field.required} />
      case "number": 
      case "integer":
      case "decimal":
      case "float":
        return <NumberField value={fieldValue as any} onChange={onFieldChange} required={field.required} type={field.type as any} />
      case "currency":
        return <CurrencyField value={fieldValue as any} onChange={onFieldChange} required={field.required} />
      case "percent":
        return <PercentField value={fieldValue as any} onChange={onFieldChange} required={field.required} />
      case "icon":
        return <IconField value={fieldValue as string} onChange={onFieldChange} required={field.required} />
      case "seo":
        return <SeoField value={fieldValue as any} onChange={onFieldChange} required={field.required} />
      case "code":
        return <CodeField value={fieldValue as any} onChange={onFieldChange} required={field.required} />
      case "boolean": 
        return <BooleanField value={fieldValue as boolean} onChange={onFieldChange} required={field.required} />
      case "date": 
        return <DateField value={fieldValue as string} onChange={onFieldChange} required={field.required} />
      case "datetime": 
      case "timestamp":
      case "time":
        return <DateTimeField value={fieldValue as string} onChange={onFieldChange} required={field.required} type={field.type as any} />
      case "dateRange":
        return <DateRangeField value={fieldValue as any} onChange={onFieldChange} required={field.required} />
      case "select": 
        return <SelectField value={fieldValue as string} onChange={onFieldChange} options={selectOptions} required={field.required} />
      case "component":
        let compOpts: any = {}
        try { compOpts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options } catch { compOpts = {} }
        return <ComponentField label={null} tenantSlug={tenantSlug} componentSlug={compOpts?.componentSlug} value={fieldValue} onChange={onFieldChange} repeatable={compOpts?.repeatable} />
      case "repeater":
        return <DynamicZoneField label={null} tenantSlug={tenantSlug} value={fieldValue as any[]} onChange={onFieldChange} />
      case "relation":
        const relOpts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options
        const isMultiple = relOpts?.relationType === 'oneToMany' || relOpts?.relationType === 'manyToMany'
        return (
          <RelationSelectField 
            value={fieldValue as any} 
            onChange={onFieldChange} 
            tenantSlug={tenantSlug}
            targetSlug={(field as any).relationSlug || relOpts?.targetSlug || ""}
            required={field.required}
            multiple={isMultiple}
          />
        )
      case "media": 
        return <MediaField value={fieldValue as string} onChange={onFieldChange} tenantSlug={tenantSlug} type="image" />
      case "file":
        return <MediaField value={fieldValue as string} onChange={onFieldChange} tenantSlug={tenantSlug} type="file" />
      case "slug":
      case "uid":
        return <SlugField value={fieldValue} onChange={onFieldChange} required={field.required} />
      case "password":
        return <PasswordField value={fieldValue as string} onChange={onFieldChange} required={field.required} />
      case "json":
      case "color":
      case "location":
        return <AdvancedField value={fieldValue} onChange={onFieldChange} type={field.type} required={field.required} />
      case "url":
        return <UrlField value={fieldValue as string} onChange={onFieldChange} required={field.required} />
      case "phone":
        return <PhoneField value={fieldValue as any} onChange={onFieldChange} required={field.required} />
      case "multiselect":
        return <MultiSelectField value={fieldValue as any} onChange={onFieldChange} options={selectOptions} required={field.required} />
      case "rating":
        return <RatingField value={fieldValue as number} onChange={onFieldChange} required={field.required} />
      case "button":
        return <ButtonField value={fieldValue as any} onChange={onFieldChange} required={field.required} />
      default: 
        return <Input value={fieldValue as string || ""} onChange={e => onFieldChange(e.target.value)} />
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading component structure...</div>
  if (!definition) return <div className="text-xs text-destructive">Error: Component "{componentSlug}" not found.</div>

  const renderInnerFields = (data: any, index: number | null = null) => {
    return (
      <div className="space-y-6 py-2">
        {definition.fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">
              {field.name} {field.required && <span className="text-destructive">*</span>}
            </Label>
            {renderInnerField(field, data, index)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-center justify-between">
          {typeof label === 'string' ? <Label className="text-sm font-bold">{label}</Label> : label}
          {repeatable && (
            <Badge variant="outline" className="text-[10px] font-bold uppercase bg-primary/5 text-primary border-primary/20">
              Repeatable
            </Badge>
          )}
        </div>
      )}

      <div className="bg-muted/20 rounded-2xl p-4 border border-dashed border-border/80">
        {!repeatable ? (
          renderInnerFields(value)
        ) : (
          <div className="space-y-3">
            {(Array.isArray(value) ? value : []).map((item, idx) => (
              <Card key={idx} className="border border-border/70 shadow-xs overflow-hidden bg-card rounded-xl">
                <div 
                  className="flex items-center justify-between px-4 py-2 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => toggleExpand(idx)}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <span className="text-xs font-bold text-muted-foreground">
                      {definition.name} #{idx + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer" 
                      onClick={(e) => { e.stopPropagation(); handleRemoveField(idx) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg cursor-pointer">
                      {expandedIndices.has(idx) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {expandedIndices.has(idx) && (
                  <CardContent className="pt-4 pb-6">
                    {renderInnerFields(item, idx)}
                  </CardContent>
                )}
              </Card>
            ))}
            <Button 
              variant="outline" 
              className="w-full border-dashed border-2 hover:bg-primary/5 hover:border-primary/50 text-muted-foreground hover:text-primary transition-all rounded-xl h-10 cursor-pointer text-xs font-semibold"
              onClick={handleAddField}
            >
              <Plus className="h-4 w-4 mr-2" />
              Tambah ke {definition.name}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
