import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import sharp from "sharp"
import fs from "fs"
import path from "path"
import { db } from "./database"

import { getResolvedStorageConfig } from "./settings"

export interface StorageConfig {
  endpoint: string
  accessKey: string
  secretKey: string
  bucket: string
  publicUrl: string
}

async function getTenantStorageConfig(tenantSlug: string): Promise<StorageConfig | null> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { storageConfig: true }
    })
    if (tenant?.storageConfig) {
      const config = tenant.storageConfig as unknown as StorageConfig
      if (config.endpoint && config.accessKey && config.secretKey && config.bucket) {
        return config
      }
    }
  } catch (error) {
    console.error(`Failed to fetch storage config for ${tenantSlug}`, error)
  }
  return null
}

async function getS3Client(tenantSlug?: string): Promise<{ s3: S3Client, bucket: string, publicUrl: string, isCustom: boolean }> {
  if (tenantSlug) {
    const customConfig = await getTenantStorageConfig(tenantSlug)
    if (customConfig) {
      const customS3 = new S3Client({
        region: "auto",
        endpoint: customConfig.endpoint,
        credentials: {
          accessKeyId: customConfig.accessKey,
          secretAccessKey: customConfig.secretKey,
        },
      })
      return { 
        s3: customS3, 
        bucket: customConfig.bucket, 
        publicUrl: customConfig.publicUrl || "", 
        isCustom: true 
      }
    }
  }
  
  const storageConfig = await getResolvedStorageConfig()
  const accountId = storageConfig.accountId || process.env.R2_ACCOUNT_ID || ""
  const endpoint = accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : "http://localhost:9000"

  const globalS3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: storageConfig.accessKeyId || process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: storageConfig.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY || "",
    },
  })

  return { 
    s3: globalS3, 
    bucket: storageConfig.bucketName || process.env.R2_BUCKET_NAME || "sacms-media", 
    publicUrl: storageConfig.publicUrl || process.env.R2_PUBLIC_URL || "", 
    isCustom: false 
  }
}

/**
 * Check if global R2 is configured.
 */
export async function isR2Configured(): Promise<boolean> {
  const cfg = await getResolvedStorageConfig()
  return !!(cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey)
}

/**
 * Check if storage is configured for a specific tenant (Custom S3, Dedicated MinIO VPS, or Global R2).
 */
export async function isTenantStorageConfigured(tenantSlug?: string): Promise<boolean> {
  if (tenantSlug) {
    const customConfig = await getTenantStorageConfig(tenantSlug)
    if (customConfig) return true
  }
  return isR2Configured()
}

/**
 * Generate a storage key for a file.
 */
function generateStorageKey(tenantSlug: string, filename: string): string {
  const parts = filename.split(".")
  const ext = parts.pop()?.toLowerCase() || "bin"
  const baseName = parts.join(".").replace(/[^a-z0-9]/gi, "_").toLowerCase()
  const timestamp = Date.now()
  return `upload/${tenantSlug}/.${ext}/${baseName}_${timestamp}.${ext}`
}

/**
 * Extract tenant slug from storage key
 */
function extractTenantSlug(key: string): string | null {
  const parts = key.split("/")
  if (parts.length >= 2 && parts[0] === "upload") {
    return parts[1]
  }
  return null
}

/**
 * Build CDN URL from storage key.
 */
function buildUrl(key: string, publicUrl: string, isCustom: boolean): string {
  if (publicUrl) return `${publicUrl.replace(/\/$/, '')}/${key}`
  return `/api/media/serve?key=${key}`
}


export interface UploadResult {
  url: string
  storageKey: string
  thumbnailUrl: string | null
  mediumUrl: string | null
  width: number | null
  height: number | null
}

/**
 * Upload a file to R2 with optional image resizing.
 */
export async function uploadToR2(
  tenantSlug: string,
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<UploadResult> {
  const { s3, bucket, publicUrl, isCustom } = await getS3Client(tenantSlug)
  const storageKey = generateStorageKey(tenantSlug, filename)

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    })
  )

  let thumbnailUrl: string | null = null
  let mediumUrl: string | null = null
  let width: number | null = null
  let height: number | null = null

  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
    try {
      const metadata = await sharp(buffer).metadata()
      width = metadata.width ?? null
      height = metadata.height ?? null

      // Thumbnail (150px)
      const thumbKey = storageKey.replace(/(\.[^.]+)$/, "_thumb$1")
      const thumbBuffer = await sharp(buffer)
        .resize(150, undefined, { withoutEnlargement: true })
        .toBuffer()
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: thumbKey, Body: thumbBuffer, ContentType: mimeType }))
      thumbnailUrl = buildUrl(thumbKey, publicUrl, isCustom)

      // Medium (600px)
      const medKey = storageKey.replace(/(\.[^.]+)$/, "_medium$1")
      const medBuffer = await sharp(buffer)
        .resize(600, undefined, { withoutEnlargement: true })
        .toBuffer()
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: medKey, Body: medBuffer, ContentType: mimeType }))
      mediumUrl = buildUrl(medKey, publicUrl, isCustom)
    } catch (e) {
      console.error("Thumbnail generation failed:", e)
    }
  }

  return { url: buildUrl(storageKey, publicUrl, isCustom), storageKey, thumbnailUrl, mediumUrl, width, height }
}

/**
 * Fallback: Upload to local disk.
 */
export async function uploadToLocal(
  tenantSlug: string,
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<UploadResult> {
  const storageKey = generateStorageKey(tenantSlug, filename)
  const fullPath = path.join(process.cwd(), "public", storageKey)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, buffer)

  let thumbnailUrl: string | null = null
  let width: number | null = null
  let height: number | null = null

  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
    try {
      const metadata = await sharp(buffer).metadata()
      width = metadata.width ?? null
      height = metadata.height ?? null
      const thumbKey = storageKey.replace(/(\.[^.]+)$/, "_thumb$1")
      const thumbPath = path.join(process.cwd(), "public", thumbKey)
      await sharp(buffer).resize(150, undefined, { withoutEnlargement: true }).toFile(thumbPath)
      thumbnailUrl = `/${thumbKey}`
    } catch (e) {
      console.error("Local thumbnail failed:", e)
    }
  }

  return { url: `/${storageKey}`, storageKey, thumbnailUrl, mediumUrl: null, width, height }
}

/**
 * Delete a single file from storage.
 */
export async function deleteFromStorage(storageKey: string): Promise<void> {
  const tenantSlug = extractTenantSlug(storageKey)
  const { s3, bucket, isCustom } = await getS3Client(tenantSlug || undefined)

  if (isCustom || (await isR2Configured())) {
    const keys = [
      storageKey,
      storageKey.replace(/(\.[^.]+)$/, "_thumb$1"),
      storageKey.replace(/(\.[^.]+)$/, "_medium$1"),
    ]
    await Promise.all(
      keys.map((key) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {}))
    )
  } else {
    try {
      const fullPath = path.join(process.cwd(), "public", storageKey)
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
      const thumbPath = path.join(process.cwd(), "public", storageKey.replace(/(\.[^.]+)$/, "_thumb$1"))
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath)
    } catch (e) {
      console.error("Local delete failed:", e)
    }
  }
}

/**
 * Delete all files associated with a tenant (full directory cleanup).
 */
export async function deleteTenantStorage(tenantSlug: string): Promise<void> {
  const prefix = `upload/${tenantSlug}/`
  const { s3, bucket, isCustom } = await getS3Client(tenantSlug)

  if (isCustom || (await isR2Configured())) {
    try {
      let continuationToken: string | undefined = undefined
      let totalDeleted = 0

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
        const list = await s3.send(listCommand)

        if (list.Contents && list.Contents.length > 0) {
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: list.Contents.map((obj) => ({ Key: obj.Key })),
              Quiet: true,
            },
          })
          await s3.send(deleteCommand)
          totalDeleted += list.Contents.length
        }

        continuationToken = (list as any).NextContinuationToken
      } while (continuationToken)

      if (totalDeleted > 0) {
        console.log(`[Storage] Deleted ${totalDeleted} objects for tenant: ${tenantSlug}`)
      }
    } catch (e) {
      console.error(`[Storage] R2/S3 cleanup failed for tenant ${tenantSlug}:`, e)
    }
  } else {
    try {
      const tenantPath = path.join(process.cwd(), "public", "upload", tenantSlug)
      if (fs.existsSync(tenantPath)) {
        fs.rmSync(tenantPath, { recursive: true, force: true })
        console.log(`[Storage] Deleted local directory for tenant: ${tenantSlug}`)
      }
    } catch (e) {
      console.error(`[Storage] Local cleanup failed for tenant ${tenantSlug}:`, e)
    }
  }
}

/**
 * Read a stored object's bytes, regardless of whether it lives in R2/S3 or
 * on local disk — used by /api/media/serve, which is the URL every upload
 * falls back to whenever no public bucket URL is configured (see
 * buildUrl()). Without this, a file actually stored in R2 but referenced
 * via the local-only serve route would 404 forever: the object exists in
 * the bucket, but /api/media/serve used to only ever look on local disk.
 */
export async function readFromStorage(storageKey: string): Promise<{ buffer: Buffer; contentType?: string } | null> {
  const tenantSlug = extractTenantSlug(storageKey)
  const { s3, bucket, isCustom } = await getS3Client(tenantSlug || undefined)

  if (isCustom || (await isR2Configured())) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }))
      if (!res.Body) return null
      const buffer = Buffer.from(await (res.Body as any).transformToByteArray())
      return { buffer, contentType: res.ContentType }
    } catch {
      return null
    }
  }

  const fullPath = path.join(process.cwd(), "public", storageKey)
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null
  return { buffer: fs.readFileSync(fullPath) }
}

/**
 * Generate a presigned URL for private R2 objects.
 */
export async function generatePresignedUrl(storageKey: string, expiresIn = 3600): Promise<string> {
  const tenantSlug = extractTenantSlug(storageKey)
  const { s3, bucket, isCustom } = await getS3Client(tenantSlug || undefined)
  
  if (isCustom || (await isR2Configured())) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    })
    return getSignedUrl(s3 as any, command as any, { expiresIn })
  }
  
  // Fallback for local storage: internal proxy route
  return `/api/media/serve?key=${storageKey}`
}

