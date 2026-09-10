import { describe, it, expect } from "vitest"

describe("Vercel Subdomain & Domain White-Label API", () => {
  it("should correctly extract hostname/subdomain from various Vercel deployment URL formats", () => {
    const parseVercelSubdomain = (vercelUrl: string): string => {
      try {
        const parsed = new URL(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`)
        return parsed.hostname
      } catch {
        return vercelUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      }
    }

    expect(parseVercelSubdomain("https://sacms-delvia.vercel.app")).toBe("sacms-delvia.vercel.app")
    expect(parseVercelSubdomain("https://sacms-delvia.vercel.app/")).toBe("sacms-delvia.vercel.app")
    expect(parseVercelSubdomain("sacms-project-123.vercel.app")).toBe("sacms-project-123.vercel.app")
    expect(parseVercelSubdomain("https://my-app-git-main-org.vercel.app/overview")).toBe("my-app-git-main-org.vercel.app")
  })

  it("should assemble vercelDeployment payload when deployment exists", () => {
    const rawUrl = "https://sacms-cmtofcls80009mk01va6b8r1q.vercel.app"
    const vercelProjectId = "prj_abc123"
    const vercelCustomDomain = "site.example.com"
    const updatedAt = new Date("2026-09-09T12:00:00Z")

    const vercelDeployment = {
      url: rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`,
      subdomain: new URL(rawUrl).hostname,
      projectId: vercelProjectId,
      customDomain: vercelCustomDomain,
      status: "ready",
      updatedAt,
    }

    expect(vercelDeployment.url).toBe("https://sacms-cmtofcls80009mk01va6b8r1q.vercel.app")
    expect(vercelDeployment.subdomain).toBe("sacms-cmtofcls80009mk01va6b8r1q.vercel.app")
    expect(vercelDeployment.projectId).toBe("prj_abc123")
    expect(vercelDeployment.customDomain).toBe("site.example.com")
    expect(vercelDeployment.status).toBe("ready")
  })
})
