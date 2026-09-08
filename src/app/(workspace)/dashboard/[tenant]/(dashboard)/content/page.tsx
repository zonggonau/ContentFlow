import { redirect } from "next/navigation"

export default async function ContentRedirectPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const resolvedParams = await params
  redirect(`/dashboard/${resolvedParams.tenant}/cms`)
}
