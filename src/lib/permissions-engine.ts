/**
 * Strapi-parity Permissions Engine
 *
 * Resolves whether a given role (e.g. "public", "authenticated", "vip-member")
 * has permission to perform an action on a content-type within a tenant.
 *
 * Permission resolution order:
 *  1. Wildcard rule: contentTypeSlug = "*", action = action  (applies to ALL types)
 *  2. Specific rule: contentTypeSlug = slug, action = action
 *
 * Results are cached in Redis (TTL 60s) to avoid DB round-trips on every request.
 */

import { getRedis } from "@/lib/redis"
import { db } from "@/lib/database"
import type { PrismaClient } from "../../prisma/generated-client"

export type ContentAction = "find" | "findOne" | "create" | "update" | "delete"

export const SYSTEM_ROLES = {
  PUBLIC: "public",
  AUTHENTICATED: "authenticated",
} as const

/** Default permissions for the two built-in system roles */
const DEFAULT_PUBLIC_PERMISSIONS: Record<ContentAction, boolean> = {
  find: true,
  findOne: true,
  create: false,
  update: false,
  delete: false,
}

const DEFAULT_AUTHENTICATED_PERMISSIONS: Record<ContentAction, boolean> = {
  find: true,
  findOne: true,
  create: true,
  update: false,
  delete: false,
}

type PermissionMap = {
  [contentTypeSlug: string]: Partial<Record<ContentAction, boolean>>
}

async function getCachedPermissions(
  tenantId: string,
  roleSlug: string
): Promise<PermissionMap | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const key = `perm:${tenantId}:${roleSlug}`
    const raw = await redis.get<string>(key)
    if (!raw) return null
    return typeof raw === "string" ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

async function setCachedPermissions(
  tenantId: string,
  roleSlug: string,
  permissions: PermissionMap
): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const key = `perm:${tenantId}:${roleSlug}`
    await redis.set(key, JSON.stringify(permissions), { ex: 60 })
  } catch {
    // ignore
  }
}

/** Invalidate permission cache for a tenant role (call when permissions are updated) */
export async function invalidatePermissionCache(
  tenantId: string,
  roleSlug: string
): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const key = `perm:${tenantId}:${roleSlug}`
    await redis.del(key)
  } catch {
    // ignore
  }
}

/** Built-in defaults, used only when a role has no rows persisted yet. */
function systemDefault(roleSlug: string): PermissionMap {
  if (roleSlug === SYSTEM_ROLES.PUBLIC) return { "*": { ...DEFAULT_PUBLIC_PERMISSIONS } }
  return { "*": { ...DEFAULT_AUTHENTICATED_PERMISSIONS } }
}

/**
 * Load permission map for a given role from DB, falling back to built-in defaults.
 *
 * This applies to system roles ("public" / "authenticated") too: once an admin
 * saves a permission matrix for them, those rows win over the built-in defaults.
 */
async function loadPermissions(
  tenantId: string,
  roleSlug: string,
  client: PrismaClient = db
): Promise<PermissionMap> {
  const role = await client.memberRole.findFirst({
    where: { tenantId, slug: roleSlug },
    include: { permissions: true },
  })

  // Unknown role: system roles fall back to their own default, everything else to
  // the "authenticated" default (deny-write, allow-read).
  if (!role) {
    return roleSlug === SYSTEM_ROLES.PUBLIC || roleSlug === SYSTEM_ROLES.AUTHENTICATED
      ? systemDefault(roleSlug)
      : { "*": { ...DEFAULT_AUTHENTICATED_PERMISSIONS } }
  }

  // Role exists but has no explicit permissions yet -> use the sensible default.
  if (role.permissions.length === 0) {
    return role.isSystem ? systemDefault(roleSlug) : { "*": { ...DEFAULT_AUTHENTICATED_PERMISSIONS } }
  }

  const map: PermissionMap = {}
  for (const perm of role.permissions) {
    if (!map[perm.contentTypeSlug]) {
      map[perm.contentTypeSlug] = {}
    }
    map[perm.contentTypeSlug][perm.action as ContentAction] = perm.granted
  }

  return map
}

/**
 * Check whether a role can perform ction on contentTypeSlug within 	enantId.
 *
 * @returns true if allowed, false if denied
 */
export async function canPerform(
  tenantId: string,
  roleSlug: string,
  contentTypeSlug: string,
  action: ContentAction,
  client: PrismaClient = db
): Promise<boolean> {
  // Try cache
  let permissions = await getCachedPermissions(tenantId, roleSlug)

  if (!permissions) {
    permissions = await loadPermissions(tenantId, roleSlug, client)
    await setCachedPermissions(tenantId, roleSlug, permissions)
  }

  // Specific rule takes priority over wildcard
  const specific = permissions[contentTypeSlug]?.[action]
  if (specific !== undefined) {
    return specific
  }

  // Wildcard fallback
  const wildcard = permissions["*"]?.[action]
  if (wildcard !== undefined) {
    return wildcard
  }

  // Default: deny
  return false
}

/**
 * Resolve the effective role slug for an incoming request:
 * - If Authorization: Bearer <jwt> then decoded role from JWT
 * - Otherwise then "public"
 */
export function resolveRoleFromJwt(
  jwtPayload: { role?: string } | null
): string {
  if (!jwtPayload || !jwtPayload.role) {
    return SYSTEM_ROLES.PUBLIC
  }
  return jwtPayload.role
}

/**
 * Ensure a tenant has the two required system roles ("public" and "authenticated").
 * Safe to call multiple times - skips if already exists.
 */
export async function ensureSystemRoles(tenantId: string, client: PrismaClient = db): Promise<void> {
  const existing = await client.memberRole.findMany({
    where: { tenantId, isSystem: true },
    select: { slug: true },
  })
  const existingSlugs = new Set(existing.map((r) => r.slug))

  const toCreate = [
    {
      tenantId,
      name: "Public",
      slug: SYSTEM_ROLES.PUBLIC,
      description: "Akses untuk pengunjung yang tidak login",
      isSystem: true,
    },
    {
      tenantId,
      name: "Authenticated",
      slug: SYSTEM_ROLES.AUTHENTICATED,
      description: "Akses untuk member yang sudah login",
      isSystem: true,
    },
  ].filter((r) => !existingSlugs.has(r.slug))

  if (toCreate.length > 0) {
    await client.memberRole.createMany({ data: toCreate, skipDuplicates: true })
  }
}
