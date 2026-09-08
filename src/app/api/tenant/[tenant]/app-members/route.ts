import { NextResponse } from "next/server"
import { z } from "zod"
import { db, getTenantDbById } from "@/lib/database"
import { hashMemberPassword } from "@/lib/member-auth"
import { withStaffAuth, apiError, readJson } from "@/lib/api/route-helpers"

const LIST_FIELDS = {
  id: true, email: true, name: true, avatar: true, role: true, status: true,
  metadata: true, createdAt: true, updatedAt: true, lastLoginAt: true, emailVerified: true,
} as const

const CreateMemberSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(128),
  role: z.string().regex(/^[a-z0-9-]{1,60}$/).default("authenticated"),
  status: z.enum(["active", "suspended", "pending_verification"]).default("active"),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const PolicySchema = z.object({
  allowMemberRegistration: z.boolean().optional(),
  requireMemberEmailVerification: z.boolean().optional(),
  memberEmailConfirmationRedirect: z.string().url().or(z.literal("")).nullable().optional(),
  memberPasswordResetRedirect: z.string().url().or(z.literal("")).nullable().optional(),
})

export const GET = withStaffAuth(async (request, _context, { access }) => {
  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "25")))
  const search = url.searchParams.get("search") ?? ""
  const role = url.searchParams.get("role") ?? ""
  const status = url.searchParams.get("status") ?? ""

  const where: Record<string, unknown> = { tenantId: access.tenantId }
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ]
  }
  if (role) where.role = role
  if (status) where.status = status

  const tenantDb = await getTenantDbById(access.tenantId)
  const [members, total] = await Promise.all([
    tenantDb.member.findMany({
      where,
      select: LIST_FIELDS,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    tenantDb.member.count({ where }),
  ])

  return NextResponse.json({
    members,
    pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
  })
})

/** PATCH — update the workspace's headless member-auth policy. */
export const PATCH = withStaffAuth(
  async (request, _context, { access }) => {
    const body = await readJson(request, PolicySchema)
    if (!body.ok) return body.response

    const data: Record<string, boolean | string | null> = {}
    if (body.data.allowMemberRegistration !== undefined) data.allowMemberRegistration = body.data.allowMemberRegistration
    if (body.data.requireMemberEmailVerification !== undefined) {
      data.requireMemberEmailVerification = body.data.requireMemberEmailVerification
    }
    if (body.data.memberEmailConfirmationRedirect !== undefined) {
      data.memberEmailConfirmationRedirect = body.data.memberEmailConfirmationRedirect || null
    }
    if (body.data.memberPasswordResetRedirect !== undefined) {
      data.memberPasswordResetRedirect = body.data.memberPasswordResetRedirect || null
    }

    const tenant = await db.tenant.update({
      where: { id: access.tenantId },
      data,
      select: {
        allowMemberRegistration: true,
        requireMemberEmailVerification: true,
        memberEmailConfirmationRedirect: true,
        memberPasswordResetRedirect: true,
      },
    })
    return NextResponse.json({ policy: tenant })
  },
  { minRole: "admin" },
)

export const POST = withStaffAuth(
  async (request, _context, { access }) => {
    const body = await readJson(request, CreateMemberSchema)
    if (!body.ok) return body.response
    const { email, name, password, role, status, metadata } = body.data

    const tenantDb = await getTenantDbById(access.tenantId)

    if (role !== "authenticated") {
      const known = await tenantDb.memberRole.findFirst({
        where: { tenantId: access.tenantId, slug: role },
        select: { id: true },
      })
      if (!known) return apiError("validation", { message: `Unknown member role: ${role}` })
    }

    const existing = await tenantDb.member.findFirst({ where: { tenantId: access.tenantId, email } })
    if (existing) return apiError("conflict", { message: "A member with this email already exists" })

    const passwordHash = await hashMemberPassword(password)
    const member = await tenantDb.member.create({
      data: { tenantId: access.tenantId, email, name, passwordHash, role, status, metadata: metadata as any },
      select: { id: true, email: true, name: true, avatar: true, role: true, status: true, metadata: true, createdAt: true },
    })
    return NextResponse.json({ member }, { status: 201 })
  },
  { minRole: "admin" },
)
