import { redirect } from "next/navigation"

export default async function WebhooksRedirectPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const resolvedParams = await params
  redirect(`/dashboard/${resolvedParams.tenant}/developer/webhooks`)
}
