"use client"

import { useState, useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Check, X, ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { normalizeSelectOptions, type SelectOption } from "@/lib/select-options"

interface MultiSelectFieldProps {
  value: string[] | string | null
  onChange: (value: string[]) => void
  label?: string | React.ReactNode
  placeholder?: string
  required?: boolean
  error?: string
  options?: any
}

export function MultiSelectField({
  value,
  onChange,
  label,
  placeholder = "Pilih opsi...",
  required = false,
  error,
  options = [],
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const normalizedOptions = useMemo(() => normalizeSelectOptions(options), [options])

  // Normalize value to array
  const selected: string[] = Array.isArray(value)
    ? value.map(v => String(v))
    : typeof value === "string" && value.trim()
      ? value.split(",").map(v => v.trim()).filter(Boolean)
      : []

  const filteredOptions = normalizedOptions.filter(
    (opt) => 
      opt.label.toLowerCase().includes(search.toLowerCase()) || 
      opt.value.toLowerCase().includes(search.toLowerCase())
  )

  const toggleOption = (optValue: string) => {
    if (selected.includes(optValue)) {
      onChange(selected.filter(v => v !== optValue))
    } else {
      onChange([...selected, optValue])
    }
  }

  const removeOption = (optValue: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    onChange(selected.filter(v => v !== optValue))
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  return (
    <div className="space-y-2">
      {label && (
        typeof label === "string" ? (
          <Label className={cn(error ? "text-destructive" : "")}>
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
        ) : label
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full min-h-[44px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
              "hover:bg-accent/50 transition-colors cursor-pointer",
              error && "border-destructive",
              open && "ring-2 ring-ring ring-offset-2"
            )}
          >
            <div className="flex flex-wrap gap-1.5 flex-1">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selected.map((val) => {
                  const matched = normalizedOptions.find(o => o.value === val)
                  const displayLabel = matched ? matched.label : val
                  return (
                    <Badge
                      key={val}
                      variant="secondary"
                      className="px-2 py-0.5 h-6 rounded-sm bg-primary/10 text-primary hover:bg-primary/20 border-none flex items-center gap-1 text-[11px] font-bold"
                    >
                      {displayLabel}
                      <button
                        type="button"
                        onClick={(e) => removeOption(val, e)}
                        className="ml-0.5 rounded-sm hover:bg-primary/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )
                })
              )}
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-sm hover:bg-destructive/10 p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180"
              )} />
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari opsi..."
                className="pl-8 h-9 border-none shadow-none focus-visible:ring-0 bg-muted/30"
              />
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Tidak ada opsi ditemukan
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selected.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleOption(opt.value)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/5 text-primary font-bold"
                        : "hover:bg-accent text-foreground"
                    )}
                  >
                    <div className={cn(
                      "h-4 w-4 rounded-sm border-2 flex items-center justify-center shrink-0 transition-all",
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30"
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span>{opt.label}</span>
                  </button>
                )
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t bg-muted/5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {selected.length} opsi dipilih
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

