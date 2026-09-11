import { db } from "@/lib/database"
import { decryptCredential } from "./encryption"
import { sshExec, sshSyncDirectory, type RemoteFile } from "./ssh-client"
import { renderDotEnv } from "./frontend-env"

export interface VpsDeployFile {
  name: string
  content: string
}

export interface VpsDeployOptions {
  files?: VpsDeployFile[]
  domain?: string
  chatId?: string | null
  /** Full frontend env (custom vars + fixed SACMS_* connection vars) — see
   *  lib/infrastructure/frontend-env.ts. Written to `.env.production` in the
   *  uploaded project so `next build`/`next start` picks it up. */
  env?: Record<string, string>
}

export interface VpsDeployResult {
  success: boolean
  url: string
  hostType: "vps" | "simulation"
  vpsIp?: string | null
  serverName?: string
  state: "READY" | "BUILDING" | "ERROR"
  error?: string
  /** Set when the deploy failed after the build actually ran — the last
   *  lines of `docker compose up --build`'s combined output, so the caller
   *  (an AI IDE agent via MCP) can see the real npm/next error instead of a
   *  generic failure message. */
  buildLogTail?: string
  /** True only for the "can't deploy for real yet" cases (no IP yet, or a
   *  server provisioned before the SSH deploy keypair existed) — never
   *  fabricates a fake success the way the old stub did. */
  simulated?: boolean
  envFileVars?: string[]
  deliveryFileCount?: number
}

/**
 * Generic multi-stage Dockerfile for a standard Next.js project (App or
 * Pages Router, any `next build`/`next start` setup) — used when the
 * uploaded project doesn't already include its own Dockerfile. Matches the
 * `frontend` service's `build: context: ./site` in cloud-init.ts.
 */
const DEFAULT_NEXTJS_DOCKERFILE = `
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
`.trim()

/**
 * Deploy a Next.js/Node project to the tenant's dedicated Contabo VPS over
 * SSH: sync the files into /opt/sacms/site (replacing whatever was there —
 * the placeholder "VPS Ready" page on a fresh appliance, or the previous
 * deploy), then `docker compose up -d --build frontend` to rebuild and
 * restart the container Caddy already reverse-proxies the tenant's domain
 * to (see cloud-init.ts).
 *
 * Requires the server to have an assigned IP and a stored deploy SSH
 * keypair — both only present once provisioning has progressed far enough
 * (IP) and, for the keypair, only on servers provisioned after this
 * pipeline was added (cloud-init only runs once at boot, so an
 * already-running older VPS can't have the key retrofitted without
 * reprovisioning).
 */
export async function deployAiWebsiteToVps(
  tenantId: string,
  options: VpsDeployOptions = {}
): Promise<VpsDeployResult> {
  try {
    const server = await db.infrastructureServer.findFirst({
      where: {
        tenantId,
        status: { in: ["active", "provisioning", "configuring"] },
      },
      orderBy: { createdAt: "desc" },
      include: { credentials: true },
    })

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, name: true, customDomain: true },
    })

    const tenantSlug = tenant?.slug || tenantId
    const effectiveDomain = options.domain || tenant?.customDomain || server?.webHost || undefined
    const vpsIp = server?.ipv4 || null
    const serverName = server?.name || "Contabo Dedicated VPS"
    const liveUrl = effectiveDomain ? `https://${effectiveDomain}` : vpsIp ? `http://${vpsIp}:3000` : ""

    if (!server) {
      return {
        success: false,
        url: "",
        hostType: "vps",
        state: "ERROR",
        error: `Tidak ada dedicated VPS aktif untuk workspace "${tenantSlug}". Provision VPS dulu sebelum deploy.`,
      }
    }

    if (!vpsIp || !server.credentials?.sshPrivateKeyEncrypted) {
      return {
        success: false,
        url: liveUrl,
        hostType: "vps",
        vpsIp,
        serverName,
        state: "ERROR",
        simulated: true,
        error: !vpsIp
          ? "Instance belum punya alamat IP — masih dalam proses provisioning, coba lagi sebentar lagi."
          : "Server ini di-provision sebelum fitur deploy SSH tersedia, jadi tidak punya kunci SSH tersimpan. Provision ulang server (buat instance baru) untuk mengaktifkan deploy_to_vps.",
      }
    }

    if (!options.files || options.files.length === 0) {
      return {
        success: false,
        url: liveUrl,
        hostType: "vps",
        vpsIp,
        serverName,
        state: "ERROR",
        error: "Tidak ada file yang dikirim untuk di-deploy.",
      }
    }

    const hasPackageJson = options.files.some((f) => f.name === "package.json")
    if (!hasPackageJson) {
      return {
        success: false,
        url: liveUrl,
        hostType: "vps",
        vpsIp,
        serverName,
        state: "ERROR",
        error: "Project tidak punya package.json — bukan project Next.js/Node yang valid untuk di-deploy.",
      }
    }

    const sshTarget = {
      host: vpsIp,
      user: server.credentials.sshUser || "root",
      privateKeyPem: decryptCredential(server.credentials.sshPrivateKeyEncrypted),
    }

    const deliveryFiles: RemoteFile[] = options.files.map((f) => ({ path: f.name, content: f.content }))
    if (!options.files.some((f) => f.name === "Dockerfile")) {
      deliveryFiles.push({ path: "Dockerfile", content: DEFAULT_NEXTJS_DOCKERFILE })
    }
    if (options.env && Object.keys(options.env).length > 0) {
      deliveryFiles.push({ path: ".env.production", content: renderDotEnv(options.env) })
    }

    // 1. Replace /opt/sacms/site with the new project (clears stale files
    //    from a previous deploy first — see sshSyncDirectory).
    await sshSyncDirectory(sshTarget, "/opt/sacms/site", deliveryFiles)

    // 2. Rebuild and restart the frontend container. Generous timeout: a
    //    cold `npm install` + `next build` on a small VPS can genuinely
    //    take several minutes.
    const build = await sshExec(
      sshTarget,
      "cd /opt/sacms && docker compose up -d --build frontend 2>&1",
      10 * 60 * 1000,
    )
    const buildLogTail = (build.stdout || build.stderr).split("\n").slice(-60).join("\n")

    if (build.code !== 0) {
      return {
        success: false,
        url: liveUrl,
        hostType: "vps",
        vpsIp,
        serverName,
        state: "ERROR",
        error: "Build/deploy gagal di VPS — lihat buildLogTail untuk error aslinya (biasanya dari npm install / next build).",
        buildLogTail,
        envFileVars: options.env ? Object.keys(options.env) : [],
        deliveryFileCount: deliveryFiles.length,
      }
    }

    // 3. Record the deployment (mirrors the Vercel path's Settings rows).
    const now = new Date().toISOString()
    await Promise.all([
      db.setting.upsert({
        where: { key: `${tenantId}_vpsDeploymentUrl` },
        update: { value: liveUrl },
        create: { tenantId, key: `${tenantId}_vpsDeploymentUrl`, value: liveUrl },
      }),
      db.setting.upsert({
        where: { key: `${tenantId}_vpsDeployedAt` },
        update: { value: now },
        create: { tenantId, key: `${tenantId}_vpsDeployedAt`, value: now },
      }),
      db.setting.upsert({
        where: { key: `${tenantId}_v0Status` },
        update: { value: "project" },
        create: { tenantId, key: `${tenantId}_v0Status`, value: "project" },
      }),
      db.setting.upsert({
        where: { key: `${tenantId}_v0HostingProvider` },
        update: { value: "vps" },
        create: { tenantId, key: `${tenantId}_v0HostingProvider`, value: "vps" },
      }),
      effectiveDomain
        ? db.setting.upsert({
            where: { key: `${tenantId}_customDomain` },
            update: { value: effectiveDomain },
            create: { tenantId, key: `${tenantId}_customDomain`, value: effectiveDomain },
          })
        : Promise.resolve(null),
    ])

    return {
      success: true,
      url: liveUrl,
      hostType: "vps",
      vpsIp,
      serverName,
      state: "READY",
      buildLogTail,
      envFileVars: options.env ? Object.keys(options.env) : [],
      deliveryFileCount: deliveryFiles.length,
    }
  } catch (error: any) {
    console.error("[VPS Deployer Error]", error)
    return {
      success: false,
      url: "",
      hostType: "vps",
      state: "ERROR",
      error: error.message || "Failed to deploy website to dedicated VPS",
    }
  }
}
