import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db, getTenantDb } from "@/lib/database"
import { 
  hashMemberPassword, 
  signMemberAccessToken, 
  generateRefreshTokenString, 
  REFRESH_TOKEN_TTL_DAYS 
} from "@/lib/member-auth"
import { ensureSystemRoles } from "@/lib/permissions-engine"
import { guardMemberAuth } from "@/lib/member-auth-guard"
import { authCorsPreflight } from "@/lib/member-auth-cors"
import { sendMemberVerificationEmail } from "@/lib/mail"
import crypto from "crypto"

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params
  return authCorsPreflight(request, tenant)
}

const RegisterSchema = z.object({
  email: z.string().email("Format email tidak valid").toLowerCase().trim(),
  password: z.string().min(6, "Password minimal 6 karakter"),
  name: z.string().optional(),
  avatar: z.string().url().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  let CORS_HEADERS: Record<string, string> = {}
  try {
    const { tenant: tenantSlug } = await params
    if (!tenantSlug) {
      return NextResponse.json({ error: "Tenant identifier required" }, { status: 400 })
    }

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
    const { tenant, ip: clientIp, cors } = guard.ctx
    CORS_HEADERS = cors
    if (!tenant) {
      return NextResponse.json({ error: "Workspace tenant not found or inactive" }, { status: 404, headers: CORS_HEADERS })
    }

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
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.format() },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const { email, password, name, avatar, metadata } = parsed.data
    const tenantDb = (await getTenantDb(tenant.slug)) as any

    // Check if email already registered in this tenant
    const existing = await tenantDb.member.findUnique({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email,
        }
      }
    })

    if (existing) {
      return NextResponse.json(
        { error: "Email sudah terdaftar pada workspace ini" },
        { status: 409, headers: CORS_HEADERS }
      )
    }

    // Hash password with bcrypt
    const passwordHash = await hashMemberPassword(password)

    await ensureSystemRoles(tenant.id, tenantDb)

    const requireVerification = !!policy?.requireMemberEmailVerification

    // Create member
    const member = await tenantDb.member.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        name: name || null,
        avatar: avatar || null,
        role: "authenticated",
        status: requireVerification ? "pending_verification" : "active",
        emailVerified: requireVerification ? null : new Date(),
        metadata: metadata || {},
        lastLoginAt: requireVerification ? null : new Date(),
      }
    })

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
      void sendMemberVerificationEmail(tenant, email, verifyToken, name || "there").catch((err) => {
        console.error(`[register] verification mail failed for tenant ${tenant.slug}:`, err?.message || err)
      })
      return NextResponse.json(
        {
          message: "Account created. Please verify your email address before signing in.",
          requiresEmailVerification: true,
          ...(process.env.NODE_ENV === "development" ? { _dev_verifyToken: verifyToken } : {}),
        },
        { status: 202, headers: CORS_HEADERS }
      )
    }

    // Generate Refresh Token & Session
    const refreshToken = generateRefreshTokenString()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS)

    const userAgent = request.headers.get("user-agent") || null
    const ipAddress = clientIp || null

    await tenantDb.memberSession.create({
      data: {
        memberId: member.id,
        tenantId: tenant.id,
        refreshToken,
        userAgent,
        ipAddress,
        expiresAt,
      }
    })

    // Sign JWT Access Token
    const { token: accessToken, expiresIn } = signMemberAccessToken({
      sub: member.id,
      email: member.email,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      role: member.role,
    })

    return NextResponse.json(
      {
        message: "Registrasi berhasil",
        user: {
          id: member.id,
          email: member.email,
          name: member.name,
          avatar: member.avatar,
          role: member.role,
          status: member.status,
          metadata: member.metadata,
          createdAt: member.createdAt,
        },
        accessToken,
        refreshToken,
        expiresIn,
        tokenType: "Bearer",
      },
      { status: 201, headers: CORS_HEADERS }
    )
  } catch (error) {
    console.error("[public-auth/register]", error)
    return NextResponse.json(
      { error: "Gagal melakukan registrasi" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
