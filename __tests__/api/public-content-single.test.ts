import { describe, it, expect, vi, beforeEach } from "vitest"
import { db } from "@/lib/database"
import { rateLimit } from "@/lib/rate-limit"
import { getCache, setCache } from "@/lib/cache"
import { GET } from "../../src/app/api/public/[tenant]/content/[contentType]/[id]/route"
import { NextRequest } from "next/server"

vi.mock("@/lib/monitoring", () => ({
  logApiRequest: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/database", () => {
  const mockDb = {
    tenant: { findFirst: vi.fn() },
    apiKey: { findUnique: vi.fn(), update: vi.fn() },
    apiToken: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contentType: { findFirst: vi.fn() },
    contentEntry: { findFirst: vi.fn(), findMany: vi.fn() },
    tenantLocale: { findFirst: vi.fn() },
    memberRole: { findFirst: vi.fn(), findMany: vi.fn() },
    memberRolePermission: { findFirst: vi.fn() },
  }
  return {
    db: mockDb,
    getTenantDb: vi.fn().mockResolvedValue(mockDb),
  }
})

function createRequest(
  url: string,
  headers: Record<string, string> = { authorization: "Bearer cf_test_token" }
) {
  return new NextRequest(url, {
    method: "GET",
    headers,
  })
}

describe("Public Single Entry REST API Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.tenant.findFirst).mockResolvedValue({ id: "tenant-1", slug: "tenant-1", status: "active" } as any)
    vi.mocked(db.apiKey.findUnique).mockResolvedValue(null)
    vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 99, limit: 100, resetAt: Date.now() + 60000 })
    vi.mocked(getCache).mockResolvedValue(null)
  })

  it("should be treated as the anonymous 'public' role when the authorization header is missing", async () => {
    vi.mocked(db.memberRole.findFirst).mockResolvedValue(null)
    vi.mocked(db.contentType.findFirst).mockResolvedValue({
      id: "type-articles",
      name: "Articles",
      slug: "articles",
      schemaFields: [],
      tenants: [],
    } as any)
    vi.mocked(db.contentEntry.findFirst).mockResolvedValue(null)

    const req = createRequest("http://localhost:3000/api/public/tenant-1/content/articles/entry-1", {})
    const params = Promise.resolve({ tenant: "tenant-1", contentType: "articles", id: "entry-1" })

    const response = await GET(req, { params })
    // Anonymous "public" role is authorized to findOne by default; the 404
    // below comes from the entry lookup, not from an auth failure.
    expect(response.status).toBe(404)
  })

  it("should return 401 if API token is invalid", async () => {
    vi.mocked(db.apiToken.findFirst).mockResolvedValue(null)

    const req = createRequest("http://localhost:3000/api/public/tenant-1/content/articles/entry-1")
    const params = Promise.resolve({ tenant: "tenant-1", contentType: "articles", id: "entry-1" })

    const response = await GET(req, { params })
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toContain("Invalid API token")
  })

  it("should return 404 if entry is not found", async () => {
    vi.mocked(db.apiToken.findFirst).mockResolvedValue({
      id: "token-1",
      token: "cf_test_token",
      tenantId: "tenant-1",
      expiresAt: null,
      type: "read-only",
      tenant: { id: "tenant-1", slug: "tenant-1" },
    } as any)

    vi.mocked(db.contentType.findFirst).mockResolvedValue({
      id: "type-articles",
      name: "Articles",
      slug: "articles",
      schemaFields: [],
      tenants: [],
    } as any)

    vi.mocked(db.contentEntry.findFirst).mockResolvedValue(null)

    const req = createRequest("http://localhost:3000/api/public/tenant-1/content/articles/entry-missing")
    const params = Promise.resolve({ tenant: "tenant-1", contentType: "articles", id: "entry-missing" })

    const response = await GET(req, { params })
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe("Entry not found")
  })

  it("should return single entry correctly when found", async () => {
    vi.mocked(db.apiToken.update).mockResolvedValue({} as any)
    vi.mocked(db.apiToken.findFirst).mockResolvedValue({
      id: "token-1",
      token: "cf_test_token",
      tenantId: "tenant-1",
      expiresAt: null,
      type: "read-only",
      tenant: { id: "tenant-1", slug: "tenant-1" },
    } as any)

    vi.mocked(db.contentType.findFirst).mockResolvedValue({
      id: "type-articles",
      name: "Articles",
      slug: "articles",
      schemaFields: [
        { slug: "title", type: "string" },
        { slug: "content", type: "text" },
      ],
      tenants: [],
    } as any)

    vi.mocked(db.contentEntry.findFirst).mockResolvedValue({
      id: "entry-1",
      documentId: "doc-1",
      contentTypeId: "type-articles",
      tenantId: "tenant-1",
      locale: "en",
      data: { title: "Single Entry Title", content: "Body text" },
      status: "PUBLISHED",
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
    } as any)

    vi.mocked(db.contentEntry.findMany).mockResolvedValue([
      { locale: "en" },
      { locale: "id" },
    ] as any)

    const req = createRequest("http://localhost:3000/api/public/tenant-1/content/articles/entry-1")
    const params = Promise.resolve({ tenant: "tenant-1", contentType: "articles", id: "entry-1" })

    const response = await GET(req, { params })
    expect(response.status).toBe(200)
    expect(response.headers.get("X-Cache")).toBe("MISS")

    const body = await response.json()
    expect(body.data.id).toBe("entry-1")
    expect(body.data.title).toBe("Single Entry Title")
    expect(body.data.availableLocales).toEqual(["en", "id"])
    expect(body.meta.contentType.slug).toBe("articles")
    expect(setCache).toHaveBeenCalled()
  })
})
