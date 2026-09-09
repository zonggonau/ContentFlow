import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/database"
import { getTenantAccess } from "@/lib/tenant-access"
import { MCPDashboardClient } from "./mcp-client"

export default async function MCPPage({ params }: { params: Promise<{ tenant: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const { tenant: tenantSlug } = await params
  const access = await getTenantAccess(session, tenantSlug)
  if (!access) redirect("/dashboard")

  const tenantSummary = access.tenant
  // Matches the masking rule already used by /api/tenant/[tenant]/api-keys:
  // only the workspace owner (or a super admin) ever sees the legacy
  // ApiKey's full plaintext value.
  const canSeeFullApiKey = access.role === "owner" || session.user.role === "super_admin"

  // Fetch existing tokens, keys, subscriptions, and infrastructure for this tenant
  const [tenant, tokens, apiKeys, subscription, vpsServer] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantSummary.id },
      select: { id: true, name: true, slug: true, plan: true, status: true, hostingStatus: true },
    }),
    db.apiToken.findMany({
      where: { tenantId: tenantSummary.id },
      select: { id: true, name: true, description: true, type: true, token: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.apiKey.findMany({
      where: { tenantId: tenantSummary.id },
      select: { id: true, name: true, key: true, createdAt: true, lastUsed: true },
      orderBy: { createdAt: "desc" },
    }),
    db.subscription.findFirst({
      where: { tenantId: tenantSummary.id },
      orderBy: { createdAt: "desc" },
    }),
    db.infrastructureServer.findFirst({
      where: { tenantId: tenantSummary.id },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const currentStatus = tenant?.status ?? "active"
  const currentHostingStatus = tenant?.hostingStatus ?? null
  const currentPlan = tenant?.plan ?? tenantSummary.plan

  // Determine Paid & Hosting Plan status
  const isPaid = (currentStatus === "active" && (subscription?.status === "active" || subscription?.status === "paid" || subscription?.status === "trialing")) || currentHostingStatus === "active"
  const isVpsPlan = currentPlan.startsWith("vps-") || currentPlan === "enterprise"
  const hostingType = isVpsPlan ? "dedicated_vps" : "shared_vercel"

  return (
    <MCPDashboardClient
      tenantSlug={tenantSlug}
      tenantId={tenantSummary.id}
      plan={currentPlan}
      isPaid={isPaid}
      hostingType={hostingType}
      subscriptionStatus={subscription?.status || "inactive"}
      vpsDetails={vpsServer ? {
        hostname: vpsServer.hostname || null,
        ipv4: vpsServer.ipv4 || null,
        status: vpsServer.status,
        plan: vpsServer.plan,
        cpuCount: vpsServer.cpuCount,
        ramMb: vpsServer.ramMb,
      } : null}
      existingTokens={tokens.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        // ApiToken.token is stored as a SHA-256 hash (see actions/mcp-tokens.ts)
        // — never send it to the client. The real token is only ever shown
        // once, immediately after creation, via generatedPlainToken in
        // handleCreateToken. Intentionally omitted here, not just masked,
        // so nothing downstream can mistake the hash for a usable token.
        description: t.description,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
      }))}
      existingApiKeys={apiKeys.map(k => ({
        id: k.id,
        name: k.name || "API Key",
        // Masked for anyone but the owner/super admin — matches
        // /api/tenant/[tenant]/api-keys's existing rule. A masked value is
        // never usable as a real credential, so it's excluded from
        // selectedTokenValue auto-select in the client.
        key: canSeeFullApiKey ? k.key : `${k.key.slice(0, 10)}…${k.key.slice(-4)}`,
        keyIsMasked: !canSeeFullApiKey,
        createdAt: k.createdAt.toISOString(),
        lastUsed: k.lastUsed ? k.lastUsed.toISOString() : null,
      }))}
    />
  )
}
