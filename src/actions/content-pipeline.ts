import { db } from "@/lib/database"
import { logAudit, AuditAction } from "@/lib/audit-log"
import { triggerWebhooks, WebhookEvents } from "@/lib/webhooks"
import { validateDynamicContent } from "@/lib/validations/dynamic-validator"
import type { WorkflowStatus } from "@/lib/content-workflow-rules"
import type { PrismaClient } from "../../prisma/generated-client"

/**
 * Normalizes schemaField options from JSON string or object
 */
export function parseSchemaFieldOptions(schemaFields: any[] = []) {
  return schemaFields.map((f) => {
    let parsedOptions = f.options
    if (typeof f.options === "string") {
      try {
        parsedOptions = JSON.parse(f.options)
      } catch {
        parsedOptions = {}
      }
    }
    const safeOpts = (typeof parsedOptions === "object" && parsedOptions !== null) ? { ...parsedOptions } : {}
    const showInCms = safeOpts.showInCms !== false && f.showInCms !== false
    safeOpts.showInCms = showInCms

    // Normalize relation options & relationSlug
    if (f.type === "relation") {
      const relSlug = f.relationSlug || safeOpts.targetSlug || safeOpts.relationSlug || null
      safeOpts.targetSlug = relSlug || ""
      safeOpts.relationType = safeOpts.relationType || "manyToOne"
      safeOpts.targetModel = safeOpts.targetModel || "content-type"
      if (safeOpts.multiple === undefined) {
        safeOpts.multiple = safeOpts.relationType === "oneToMany" || safeOpts.relationType === "manyToMany"
      }
      return { ...f, relationSlug: relSlug, showInCms, options: safeOpts }
    }

    // Normalize select & multiselect options so choices & options are always accessible
    if (f.type === "select" || f.type === "multiselect") {
      const rawChoices = safeOpts.choices || safeOpts.options || safeOpts.enum || []
      safeOpts.choices = rawChoices
      safeOpts.options = rawChoices
      return { ...f, showInCms, options: safeOpts }
    }

    return { ...f, showInCms, options: safeOpts }
  })
}

/**
 * Validates scheduled publication date
 */
export function validateScheduledPublicationDate(
  status: WorkflowStatus | string,
  scheduledAt?: Date | null
): string | null {
  if (status !== "SCHEDULED") return null
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return "A valid scheduled publication date is required"
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return "Scheduled publication date must be in the future"
  }
  return null
}

/**
 * Executes dynamic schema validation for entry data
 */
export async function executeContentValidation(params: {
  contentTypeId: string
  tenantId: string
  data: Record<string, any>
  entryId?: string
  isUpdate?: boolean
  client?: PrismaClient
}): Promise<{ success: boolean; errors?: Record<string, string> }> {
  return await validateDynamicContent(
    params.contentTypeId,
    params.tenantId,
    params.data,
    params.entryId,
    {
      enforceRequired: !params.isUpdate,
      client: params.client || db,
    }
  )
}

/**
 * Dispatches content webhooks safely in the background
 */
export function dispatchContentWebhook(params: {
  tenantId: string
  event: string
  payload: Record<string, any>
}) {
  triggerWebhooks(params.tenantId, params.event, params.payload).catch((err) => {
    console.error(`[Webhook Dispatch Error] ${params.event} on tenant ${params.tenantId}:`, err)
  })
}

/**
 * Standardized content audit logging
 */
export async function recordContentAuditLog(params: {
  tenantId?: string | null
  userId: string
  action: string
  entityId: string
  data: Record<string, any>
}) {
  try {
    await logAudit({
      tenantId: params.tenantId || undefined,
      userId: params.userId,
      action: params.action,
      entity: "ContentEntry",
      entityId: params.entityId,
      data: params.data,
    })
  } catch (err) {
    console.error("[Audit Log Error]:", err)
  }
}
