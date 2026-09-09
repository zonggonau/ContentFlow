"use client"

import { useEffect, useState, useMemo } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { normalizeSelectOptions, type SelectOption } from "@/lib/select-options"

export type { SelectOption }

interface SelectFieldProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  required?: boolean
  error?: string
  options?: any
  jsonPath?: string // Path to fetch JSON data (e.g., "/api/categories")
  tenantSlug?: string // For API calls
}

export function SelectField({
  value,
  onChange,
  label,
  placeholder = "Select an option...",
  required = false,
  error,
  options = [],
  jsonPath,
  tenantSlug,
}: SelectFieldProps) {
  const initialNormalized = useMemo(() => normalizeSelectOptions(options), [options])
  const [dynamicOptions, setDynamicOptions] = useState<SelectOption[]>(initialNormalized)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!jsonPath || !tenantSlug) {
      setDynamicOptions(normalizeSelectOptions(options))
      return
    }

    const fetchOptions = async () => {
      setLoading(true)
      try {
        const response = await fetch(jsonPath)
        if (response.ok) {
          const data = await response.json()
          setDynamicOptions(normalizeSelectOptions(data))
        } else {
          setDynamicOptions(normalizeSelectOptions(options))
        }
      } catch (error) {
        console.error("Error fetching options:", error)
        setDynamicOptions(normalizeSelectOptions(options))
      } finally {
        setLoading(false)
      }
    }

    fetchOptions()
  }, [jsonPath, tenantSlug, options])

  const safeOptions = Array.isArray(dynamicOptions) ? dynamicOptions : normalizeSelectOptions(dynamicOptions)

  return (
    <div className="space-y-2">
      {label && (
        <Label className={error ? "text-destructive" : ""}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <Select value={value || ""} onValueChange={onChange} disabled={loading}>
        <SelectTrigger className={error ? "border-destructive" : ""}>
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>
        <SelectContent>
          {safeOptions.length === 0 ? (
            <SelectItem value="no-options" disabled>
              No options available
            </SelectItem>
          ) : (
            safeOptions.map((option, index) => {
              const optLabel = option.label
              const optValue = option.value || `opt-${index}`
              const optKey = `opt-${index}-${optValue}`
              
              return (
                <SelectItem key={optKey} value={optValue}>
                  {optLabel}
                </SelectItem>
              )
            })
          )}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

