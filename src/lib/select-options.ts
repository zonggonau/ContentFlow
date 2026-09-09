export interface SelectOption {
  label: string
  value: string
}

/**
 * Normalizes any variation of select options (string, array of strings, 
 * array of objects, object with choices/options/enum/items, or comma-separated string)
 * into a safe, normalized Array<SelectOption>.
 * Guaranteed to NEVER return non-array and NEVER throw.
 */
export function normalizeSelectOptions(raw: any): SelectOption[] {
  if (!raw) return []

  let list: any[] = []

  if (Array.isArray(raw)) {
    list = raw
  } else if (typeof raw === "object") {
    if (Array.isArray(raw.choices)) {
      list = raw.choices
    } else if (Array.isArray(raw.options)) {
      list = raw.options
    } else if (Array.isArray(raw.enum)) {
      list = raw.enum
    } else if (Array.isArray(raw.items)) {
      list = raw.items
    } else if (typeof raw.choices === "string") {
      list = raw.choices.split(",").map((s: string) => s.trim()).filter(Boolean)
    } else if (typeof raw.options === "string") {
      list = raw.options.split(",").map((s: string) => s.trim()).filter(Boolean)
    } else {
      // Check if it's a key-value map e.g. { "draft": "Draft", "published": "Published" }
      const entries = Object.entries(raw).filter(([k]) => k !== "showInCms" && k !== "required")
      if (entries.length > 0 && entries.every(([_, v]) => typeof v === 'string' || typeof v === 'number')) {
        return entries.map(([value, label]) => ({ label: String(label), value: String(value) }))
      }
      return []
    }
  } else if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed) return []
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed)
        return normalizeSelectOptions(parsed)
      } catch {
        // Fall back to comma-separated
        list = trimmed.split(",").map(s => s.trim()).filter(Boolean)
      }
    } else {
      list = trimmed.split(",").map(s => s.trim()).filter(Boolean)
    }
  }

  return list.map((item, index) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      return { label: String(item), value: String(item) }
    }
    if (typeof item === "object" && item !== null) {
      const val = item.value !== undefined ? item.value : (item.id !== undefined ? item.id : (item.slug !== undefined ? item.slug : (item.key !== undefined ? item.key : Object.values(item)[0])))
      const lab = item.label !== undefined ? item.label : (item.name !== undefined ? item.name : (item.title !== undefined ? item.title : (item.text !== undefined ? item.text : String(val ?? `opt-${index}`))))
      return { 
        label: String(lab ?? `Opsi ${index + 1}`), 
        value: String(val ?? `opt-${index}`) 
      }
    }
    return { label: String(item ?? `opt-${index}`), value: String(item ?? `opt-${index}`) }
  })
}
