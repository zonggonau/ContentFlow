import { describe, it, expect } from "vitest"
import { normalizeSelectOptions } from "@/lib/select-options"

describe("normalizeSelectOptions", () => {
  it("handles null, undefined, and empty values gracefully", () => {
    expect(normalizeSelectOptions(null)).toEqual([])
    expect(normalizeSelectOptions(undefined)).toEqual([])
    expect(normalizeSelectOptions("")).toEqual([])
    expect(normalizeSelectOptions({})).toEqual([])
  })

  it("handles object with choices array (e.g. from dokumen_publik)", () => {
    const raw = {
      choices: [
        { label: "PDF Document (.pdf)", value: "pdf" },
        { label: "Spreadsheet Excel (.xlsx/.csv)", value: "excel" },
        { label: "Word Document (.docx)", value: "word" },
      ],
    }

    const result = normalizeSelectOptions(raw)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ label: "PDF Document (.pdf)", value: "pdf" })
    expect(result[1]).toEqual({ label: "Spreadsheet Excel (.xlsx/.csv)", value: "excel" })
    expect(result[2]).toEqual({ label: "Word Document (.docx)", value: "word" })
  })

  it("handles object with string choices", () => {
    const raw = {
      choices: ["Draft", "Published", "Archived"],
    }

    const result = normalizeSelectOptions(raw)
    expect(result).toEqual([
      { label: "Draft", value: "Draft" },
      { label: "Published", value: "Published" },
      { label: "Archived", value: "Archived" },
    ])
  })

  it("handles object with options array", () => {
    const raw = {
      options: [
        { label: "Option A", value: "a" },
        { label: "Option B", value: "b" },
      ],
    }

    const result = normalizeSelectOptions(raw)
    expect(result).toEqual([
      { label: "Option A", value: "a" },
      { label: "Option B", value: "b" },
    ])
  })

  it("handles comma-separated string choices", () => {
    const raw = "apple, banana, cherry"
    const result = normalizeSelectOptions(raw)
    expect(result).toEqual([
      { label: "apple", value: "apple" },
      { label: "banana", value: "banana" },
      { label: "cherry", value: "cherry" },
    ])
  })

  it("handles JSON string containing choices object", () => {
    const raw = JSON.stringify({
      choices: [{ label: "One", value: "1" }],
    })
    const result = normalizeSelectOptions(raw)
    expect(result).toEqual([{ label: "One", value: "1" }])
  })

  it("handles flat array of strings", () => {
    const raw = ["Red", "Green", "Blue"]
    const result = normalizeSelectOptions(raw)
    expect(result).toEqual([
      { label: "Red", value: "Red" },
      { label: "Green", value: "Green" },
      { label: "Blue", value: "Blue" },
    ])
  })

  it("handles dictionary key-value map", () => {
    const raw = {
      draft: "Draft Status",
      published: "Published Status",
    }
    const result = normalizeSelectOptions(raw)
    expect(result).toEqual([
      { label: "Draft Status", value: "draft" },
      { label: "Published Status", value: "published" },
    ])
  })
})
