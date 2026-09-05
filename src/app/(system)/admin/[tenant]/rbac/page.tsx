import { redirect } from "next/navigation"

/**
 * This page used to be a fully mocked RBAC editor — hardcoded permission
 * list, a Save button that only did `setTimeout` + `alert()`, nothing ever
 * persisted. The real, working per-tenant role/permission editor lives at
 * /dashboard/[tenant]/users-permissions/roles (backed by MemberRole /
 * MemberRolePermission), so this route now sends admins there instead of
 * presenting a second, fake RBAC surface.
 */
export default async function RBACRedirectPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  redirect(`/dashboard/${tenant}/users-permissions/roles`)
}
