import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { z } from "zod"
import { db, getTenantDb } from "@/lib/database"
import { hashMemberPassword, signMemberAccessToken, generateRefreshTokenString, REFRESH_TOKEN_TTL_DAYS } from "@/lib/member-auth"
import { ensureSystemRoles } from "@/lib/permissions-engine"
import { guardMemberAuth } from "@/lib/member-auth-guard"
import { authCorsPreflight } from "@/lib/member-auth-cors"
import { sendMemberVerificationEmail } from "@/lib/mail"

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params
  return authCorsPreflight(request, tenant)
}

const RegisterSchema = z.object({
  username: z.string().min(2).max(60).trim().optional(),
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8, "Password minimal 8 karakter"),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  let CORS_HEADERS: Record<string, string> = {}
  try {
    const { tenant: tenantSlug } = await params

    const guard = await guardMemberAuth(request, tenantSlug, {
      endpoint: "register",
      limit: 5,
      windowSeconds: 60,
    })
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, {
        status: guard.status,
        headers: guard.retryAfterSeconds
          ? { ...guard.cors, "Retry-After": String(guard.retryAfterSeconds) }
          : guard.cors,
      })
    }
    const { tenant, ip, cors } = guard.ctx
    CORS_HEADERS = cors
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404, headers: CORS_HEADERS })

    // Registration policy — resolve the full tenant flags.
    const policy = await db.tenant.findUnique({
      where: { id: tenant.id },
      select: { allowMemberRegistration: true, requireMemberEmailVerification: true },
    })
    if (policy && !policy.allowMemberRegistration) {
      return NextResponse.json(
        { error: "Public registration is disabled for this workspace." },
        { status: 403, headers: CORS_HEADERS }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 400, headers: CORS_HEADERS })

    const { username, email, password } = parsed.data

    const tenantDb = (await getTenantDb(tenant.slug)) as any

    const existing = await tenantDb.member.findFirst({ where: { tenantId: tenant.id, email } })
    if (existing) return NextResponse.json({ error: "Email is already taken." }, { status: 400, headers: CORS_HEADERS })

    const passwordHash = await hashMemberPassword(password)

    await ensureSystemRoles(tenant.id, tenantDb)

    const requireVerification = !!policy?.requireMemberEmailVerification

    const member = await tenantDb.member.create({
      data: {
        tenantId: tenant.id,
        email,
        name: username ?? email.split("@")[0],
        passwordHash,
        role: "authenticated",
        status: requireVerification ? "pending_verification" : "active",
        emailVerified: requireVerification ? null : new Date(),
      },
    })

    // If email verification is required, do NOT issue a session — the client must
    // confirm first. A verification token is stored (reusing the reset-token columns).
    if (requireVerification) {
      const verifyToken = crypto.randomBytes(32).toString("hex")
      const verifyTokenHash = crypto.createHash("sha256").update(verifyToken).digest("hex")
      await tenantDb.member.update({
        where: { id: member.id },
        data: {
          passwordResetToken: verifyTokenHash,
          passwordResetExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      void sendMemberVerificationEmail(tenant, email, verifyToken, username ?? email.split("@")[0]).catch((err) => {
        console.error(`[local/register] verification mail failed for tenant ${tenant.slug}:`, err?.message || err)
      })
      return NextResponse.json(
        {
          ok: true,
          requiresEmailVerification: true,
          message: "Account created. Please verify your email address before signing in.",
          ...(process.env.NODE_ENV === "development" ? { _dev_verifyToken: verifyToken } : {}),
        },
        { status: 202, headers: CORS_HEADERS }
      )
    }

    const refreshToken = generateRefreshTokenString()
    const sessionExpires = new Date()
    sessionExpires.setDate(sessionExpires.getDate() + REFRESH_TOKEN_TTL_DAYS)
    await tenantDb.memberSession.create({ data: { memberId: member.id, tenantId: tenant.id, refreshToken, userAgent: request.headers.get("user-agent"), ipAddress: ip, expiresAt: sessionExpires } })

    const { token: jwt } = signMemberAccessToken({ sub: member.id, email: member.email, tenantId: tenant.id, tenantSlug: tenant.slug, role: member.role })

    return NextResponse.json({
      jwt,
      refreshToken,
      user: {
        id: member.id,
        documentId: member.id,
        username: member.name,
        email: member.email,
        provider: "local",
        confirmed: !!member.emailVerified,
        blocked: false,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        role: { id: member.role, name: member.role, type: member.role },
      },
    }, { status: 200, headers: CORS_HEADERS })
  } catch (error) {
    console.error("[public-auth/local/register]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS })
  }
}
