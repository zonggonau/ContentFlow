import { GraphiQLWrapper } from "@/components/cms/graphiql-wrapper"
import { authOptions } from "@/lib/auth"
import { getTenantAccess } from "@/lib/tenant-access"
import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

export default async function GraphQLPlaygroundPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const access = await getTenantAccess(session, tenantSlug)
  if (!access) notFound()

  const headersList = await headers()
  const host = headersList.get("host") || "localhost:3000"
  const protocol = host.includes("localhost") ? "http" : "https"
  const endpoint = `${protocol}://${host}/api/public/${access.tenant.slug}/graphql`

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      <div className="border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        Set <code>Authorization: Bearer &lt;YOUR_API_TOKEN&gt;</code> in Sandbox headers.
        The stored token hash is never auto-injected.{" "}
        <Link className="font-semibold text-orange-600 hover:underline" href={`/dashboard/${access.tenant.slug}/developer/api-keys`}>
          Manage API tokens
        </Link>
      </div>
      <div className="min-h-0 flex-1" style={{ isolation: "isolate" }}>
        <GraphiQLWrapper endpoint={endpoint} />
      </div>
    </div>
  )
}
