import { redirect } from "next/navigation"

/**
 * "Hosting & Deployments" and "Custom Domains" were consolidated into the
 * single "Hosting & Infrastruktur" page (../infrastructure) as tabs —
 * Deployments' own Vercel/VPS status cards duplicated what the Infrastructure
 * page showed, so the two are now one hub (Overview / Hosting / Domains /
 * Environment / Database & Storage). This route only keeps old links working.
 */
export default async function DeploymentsRedirectPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/dashboard/${tenant}/infrastructure?tab=hosting`)
}
