/**
 * Public API actor resolution.
 *
 * A request to the tenant-scoped public API (`/api/public/[tenant]/...`) can be
 * authenticated in one of two ways:
 *
 *  1. **API token** (`Authorization: Bearer <key>` or `x-api-key: <key>`)
 *     - `ApiKey`  → full-access machine credential
 *     - `ApiToken` → read-only or full-access machine credential
 *     These bypass the RBAC permission engine (they are trusted server-side keys).
 *
 *  2. **Member JWT** (`Authorization: Bearer <jwt>`)
 *     A signed end-user token issued by the headless auth endpoints. The member's
 *     role slug is resolved and every action is checked against the Strapi-parity
 *     permission engine (`canPerform`).
 *
 * When no credential is supplied, the actor is the anonymous **"public"** role and
 * is likewise gated by `canPerform`.
 */

import { createHash } from "crypto"
import { db, getTenantDb } from "@/lib/database"
import { verifyMemberAccessToken } from "@/lib/member-auth"
import {
  canPerform,
  resolveRoleFromJwt,
  SYSTEM_ROLES,
  type ContentAction,
} from "@/lib/permissions-engine"

export type PublicApiActor =
  | {
      kind: "api-token"
      tenantId: string
      tenantSlug: string
      /** "full-access" tokens may read/write non-published content */
      accessLevel: "read-only" | "full-access"
      tokenId: string
      /** true when the credential is an `ApiKey` row (vs `ApiToken`) */
      isApiKey: boolean
    }
  | {
      kind: "member"
      tenantId: string
      tenantSlug: string
      memberId: string
      roleSlug: string
    }
  | {
      kind: "public"
      tenantId: string
      tenantSlug: string
      roleSlug: "public"
    }

export type ActorResolution =
  | { ok: true; actor: PublicApiActor }
  | { ok: false; status: number; error: string }

function extractBearer(request: Request): string {
  const authHeader = request.headers.get("authorization")
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim()
  }
  const xApiKey = request.headers.get("x-api-key") || request.headers.get("X-API-Key")
  return xApiKey ? xApiKey.trim() : ""
}

/**
 * Resolve the actor for a tenant-scoped public API request.
 *
 * `tenantParam` is the `[tenant]` route segment (slug or id). The returned actor's
 * `tenantId` is always the canonical tenant id.
 */
export async function resolvePublicApiActor(
  request: Request,
  tenantParam: string,
): Promise<ActorResolution> {
  const tenant = await db.tenant.findFirst({
    where: { OR: [{ slug: tenantParam }, { id: tenantParam }] },
    select: { id: true, slug: true, status: true },
  })
  if (!tenant || tenant.status !== "active") {
    return { ok: false, status: 404, error: "Tenant not found or inactive" }
  }

  const token = extractBearer(request)

  // ---- Anonymous (public role) ----
  if (!token) {
    return {
      ok: true,
      actor: { kind: "public", tenantId: tenant.id, tenantSlug: tenant.slug, roleSlug: "public" },
    }
  }

  // ---- 1. Member JWT (structurally a 3-part dotted token) ----
  if (token.split(".").length === 3) {
    const payload = verifyMemberAccessToken(token)
    if (payload) {
      if (payload.tenantId !== tenant.id) {
        return { ok: false, status: 403, error: "Token does not match tenant" }
      }
      // Confirm the member still exists and is active (JWT may outlive a suspend).
      const tenantDb = (await getTenantDb(tenant.slug)) as any
      const member = await tenantDb.member.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, status: true },
      })
      if (!member || member.status !== "active") {
        return { ok: false, status: 401, error: "Member account is not active" }
      }
      return {
        ok: true,
        actor: {
          kind: "member",
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          memberId: member.id,
          roleSlug: resolveRoleFromJwt({ role: member.role }),
        },
      }
    }
    // Not a valid member JWT — fall through and try API-token lookup.
  }

  // ---- 2. API key / API token ----
  const apiKey = await db.apiKey.findUnique({
    where: { key: token },
    select: { id: true, tenantId: true, expiresAt: true, tenant: { select: { slug: true } } },
  })
  if (apiKey) {
    if (apiKey.tenantId !== tenant.id) {
      return { ok: false, status: 403, error: "Token does not match tenant" }
    }
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { ok: false, status: 401, error: "API token expired" }
    }
    return {
      ok: true,
      actor: {
        kind: "api-token",
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        accessLevel: "full-access",
        tokenId: apiKey.id,
        isApiKey: true,
      },
    }
  }

  const hashedToken = createHash("sha256").update(token).digest("hex")
  const apiToken = await db.apiToken.findFirst({
    where: { OR: [{ token: hashedToken }, { token }] },
    select: { id: true, tenantId: true, type: true, expiresAt: true },
  })
  if (apiToken) {
    if (apiToken.tenantId !== tenant.id) {
      return { ok: false, status: 403, error: "Token does not match tenant" }
    }
    if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
      return { ok: false, status: 401, error: "API token expired" }
    }
    return {
      ok: true,
      actor: {
        kind: "api-token",
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        accessLevel: apiToken.type === "full-access" ? "full-access" : "read-only",
        tokenId: apiToken.id,
        isApiKey: false,
      },
    }
  }

  return { ok: false, status: 401, error: "Invalid API token" }
}

/**
 * Authorize an action for the resolved actor.
 *
 * - API tokens are trusted: read-only tokens may only `find`/`findOne`, full-access
 *   tokens may do anything.
 * - Member + public actors are gated by the RBAC permission engine.
 *
 * Returns `null` when allowed, or a `{ status, error }` describing the denial.
 */
export async function authorizeActor(
  actor: PublicApiActor,
  contentTypeSlug: string,
  action: ContentAction,
): Promise<{ status: number; error: string } | null> {
  if (actor.kind === "api-token") {
    const isRead = action === "find" || action === "findOne"
    if (actor.accessLevel === "full-access" || isRead) return null
    return { status: 403, error: "A full-access API token is required for write operations" }
  }

  // MemberRole / MemberRolePermission live in the tenant's own database
  // (dedicated-DB tenants get the full schema pushed via
  // deployTenantDatabaseSchema) — resolve the same client Member lookups
  // use, so permission checks don't silently read from the wrong database.
  const roleSlug = actor.kind === "public" ? SYSTEM_ROLES.PUBLIC : actor.roleSlug
  const tenantDb = await getTenantDb(actor.tenantSlug)
  const allowed = await canPerform(actor.tenantId, roleSlug, contentTypeSlug, action, tenantDb)
  if (allowed) return null

  return {
    status: actor.kind === "public" ? 401 : 403,
    error:
      actor.kind === "public"
        ? "Authentication required for this action"
        : `Role "${roleSlug}" is not permitted to ${action} "${contentTypeSlug}"`,
  }
}

/** Whether this actor is allowed to see non-published content. */
export function actorCanReadDrafts(actor: PublicApiActor): boolean {
  return actor.kind === "api-token" && actor.accessLevel === "full-access"
}

/**
 * Translate a `PublicApiActor` into the `ContentActor` the content-entry service
 * expects. Members and the anonymous public role are ownership-scoped and
 * DRAFT-only; a full-access token acts as a trusted `system` writer.
 */
export function toContentActor(actor: PublicApiActor):
  | { kind: "member"; memberId: string; ownershipRequired: true }
  | { kind: "public" }
  | { kind: "system" } {
  if (actor.kind === "member") return { kind: "member", memberId: actor.memberId, ownershipRequired: true }
  if (actor.kind === "public") return { kind: "public" }
  return { kind: "system" }
}

/** Map a content-service error code to an HTTP status. */
export function serviceErrorStatus(code: string): number {
  switch (code) {
    case "unauthorized": return 401
    case "forbidden": return 403
    case "not_found": return 404
    case "conflict": return 409
    case "plan_limit": return 402
    case "validation":
    case "invalid_status":
    case "locale_not_enabled":
    case "rejected_by_hook":
    default: return 400
  }
}
