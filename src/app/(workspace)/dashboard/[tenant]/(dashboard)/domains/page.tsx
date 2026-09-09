import { redirect } from "next/navigation"

/**
 * "Custom Domains" was consolidated into the "Hosting & Deployments" page
 * (deployments/page.tsx) as its own tab — the two used to be separate
 * top-level menu items but rendered nearly identical Vercel/VPS deployment
 * status cards and both drove the same /api/tenant/[tenant]/white-label/domain
 * endpoint, which is exactly the "Domains as a tab of Deployments" pattern
 * Vercel/Netlify use rather than two disconnected pages. This route now
 * only exists to keep old links/bookmarks to /domains working.
 */
export default async function DomainsRedirectPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/dashboard/${tenant}/deployments?tab=domains`)
}
