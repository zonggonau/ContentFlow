import { redirect } from "next/navigation"

export default async function ContentSlugRedirectPage({
  params,
}: {
  params: Promise<{ tenant: string; slug: string }>
}) {
  const resolvedParams = await params
  redirect(`/dashboard/${resolvedParams.tenant}/cms/content/${resolvedParams.slug}`)
}
