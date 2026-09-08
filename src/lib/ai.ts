import OpenAI from "openai"
import { db } from "./database"
import { getTenantPlanConfig } from "./tenant-plan"

// Menggunakan DeepSeek Chat model (DeepSeek-V3) sebagai default
const MODELS_TO_TRY = [
  "deepseek-chat", // Main DeepSeek V3 model
  "deepseek-reasoner" // Fallback to reasoning model if needed
]

async function getOpenAI(): Promise<{ client: OpenAI; defaultModel: string }> {
  const { getResolvedAiConfig } = await import("./settings")
  const config = await getResolvedAiConfig()

  // 1. OpenAI jika provider openai atau key openai tersedia
  if (config.openaiApiKey) {
    return {
      client: new OpenAI({ apiKey: config.openaiApiKey }),
      defaultModel: config.provider === "openai" ? (config.defaultModel || "gpt-4o-mini") : "gpt-4o-mini"
    }
  }

  // 2. DeepSeek jika key deepseek tersedia
  const deepseekKey = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY
  if (deepseekKey) {
    return {
      client: new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: deepseekKey
      }),
      defaultModel: config.defaultModel || "deepseek-chat"
    }
  }

  // 3. Gemini OpenAI-compatible endpoint jika gemini key tersedia
  const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (geminiKey) {
    return {
      client: new OpenAI({
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        apiKey: geminiKey,
      }),
      defaultModel: "gemini-1.5-flash"
    }
  }

  throw new Error("Tidak ada API Key AI (OpenAI, DeepSeek, atau Gemini) yang terkonfigurasi di Platform Settings atau .env.")
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface AIConfig {
  maxTokens?: number
  temperature?: number
  responseFormat?: "text" | "json_object"
  tenantId?: string
  userId?: string
  creditsCost?: number
  action?: string
  overrideModel?: string
}

/**
 * Executes a generative AI request with automatic model fallback and basic retry logic.
 */
export async function safeGenerateContent(
  systemPrompt: string,
  userPrompt: string,
  config: AIConfig | number = {}
): Promise<{ text: string; model: string; usage: any }> {
  const finalConfig: AIConfig = typeof config === 'number' ? { maxTokens: config } : config
  let lastError: any = null

  // 1. Check user-level AI credits if userId is present
  if (finalConfig.userId) {
    const { enforceUserAiCredits } = await import("./plan-enforcement")
    const creditCheck = await enforceUserAiCredits(finalConfig.userId, finalConfig.creditsCost || 1)
    if (!creditCheck.allowed) {
      const error: any = new Error(creditCheck.message)
      error.status = 429
      throw error
    }
  }
  
  if (finalConfig.tenantId) {
    const tenant = await db.tenant.findUnique({
      where: { id: finalConfig.tenantId },
      select: { aiTokensUsed: true, aiCreditsExtra: true } as any
    })
    
    if (tenant) {
      const planConfig = await getTenantPlanConfig(finalConfig.tenantId)
      let maxAiTokens = planConfig.max_ai_tokens || 0
      
      const override = await db.customPlanOverride.findUnique({ where: { tenantId: finalConfig.tenantId } })
      if (override && override.maxAiTokens !== null) {
        maxAiTokens = override.maxAiTokens
      }

      // Add one-time top-up extra tokens
      const extraTokens = Number((tenant as any).aiCreditsExtra || 0)
      maxAiTokens += extraTokens
      
      const usedTokens = Number((tenant as any).aiTokensUsed || 0)
      if (maxAiTokens > 0 && usedTokens >= maxAiTokens) {
        const error: any = new Error(`AI Quota Exceeded. Used: ${usedTokens}, Limit: ${maxAiTokens}`)
        error.status = 429
        throw error
      }
    }
  }
  
  const modelsToTry = finalConfig.overrideModel ? [finalConfig.overrideModel] : MODELS_TO_TRY
  for (const modelName of modelsToTry) {
    let attempts = 0
    const maxAttempts = 3
    
    while (attempts < maxAttempts) {
      try {
        console.log(`[AI] Attempting with model: ${modelName} (Attempt ${attempts + 1}/${maxAttempts})`)
        
        const { client: openai } = await getOpenAI()
        
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
        if (systemPrompt) {
          messages.push({ role: "system", content: systemPrompt })
        }
        messages.push({ role: "user", content: userPrompt })

        const completion = await openai.chat.completions.create({
          model: modelName,
          messages,
          max_tokens: finalConfig.maxTokens || 4000,
          temperature: finalConfig.temperature ?? 0.7,
          response_format: finalConfig.responseFormat ? { type: finalConfig.responseFormat } : undefined,
        })
        
        const text = completion.choices[0]?.message?.content
        
        if (text) {
          const usage = {
            promptTokens: completion.usage?.prompt_tokens ?? 0,
            completionTokens: completion.usage?.completion_tokens ?? 0,
            totalTokens: completion.usage?.total_tokens ?? 0,
          }
          
          // Deduct user credits if userId is set
          if (finalConfig.userId) {
            const { deductUserAiCredits } = await import("./plan-enforcement")
            deductUserAiCredits(
              finalConfig.userId,
              finalConfig.creditsCost || 1,
              finalConfig.action || "generate",
              finalConfig.tenantId,
              modelName
            ).catch(err => console.error("[User AI Credit Deduction Error]", err))
          } else if (finalConfig.tenantId && usage.totalTokens > 0) {
            // Update ledger and tenant in background to avoid blocking response
            db.$transaction([
              db.tenant.update({
                where: { id: finalConfig.tenantId },
                data: { aiTokensUsed: { increment: usage.totalTokens } }
              }),
              db.aiQuotaLedger.create({
                data: {
                  tenantId: finalConfig.tenantId,
                  action: finalConfig.action || "generate",
                  tokens: usage.totalTokens,
                  words: text.split(/\s+/).length,
                  model: modelName
                }
              })
            ]).catch(err => console.error("[AI Quota Ledger Error]", err))
          }
          
          return { 
            text, 
            model: modelName,
            usage
          }
        }
      } catch (error: any) {
        lastError = error
        attempts++
        
        const status = error.status || (error.message?.includes("429") ? 429 : error.message?.includes("503") ? 503 : 500)
        const isConnectionError = error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.message?.includes("fetch failed") || error.message?.includes("Connection error")
        console.warn(`[AI] Model ${modelName} failed (Status: ${status}):`, error.message)
        
        if (status === 429 || status === 503 || status === 500 || isConnectionError) {
          // Exponential backoff: 2s, 4s, 8s...
          const waitTime = Math.pow(2, attempts) * 1000
          console.log(`[AI] Rate limited or connection error. Retrying in ${waitTime}ms...`)
          await sleep(waitTime)
          continue // Try again with same model
        }
        
        // For other errors (like 400/404), break and try next model
        break
      }
    }
  }

  throw lastError || new Error("All AI models failed to respond")
}

export interface GenerateContentParams {
  prompt: string
  contentType?: string
  fieldName?: string
  locale?: string
  maxTokens?: number
  tone?: "formal" | "casual" | "professional" | "creative" | "technical"
  mode?: "generate" | "correct"
  tenantId?: string
}

export interface GenerateContentResult {
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Generate content using DeepSeek with fallback
 */
export async function generateContent(
  params: GenerateContentParams
): Promise<GenerateContentResult> {
  const { prompt, contentType, fieldName, locale = "en", tone = "professional", maxTokens, mode = "generate", tenantId } = params
  const systemPrompt = buildSystemPrompt({ contentType, fieldName, locale, tone, mode })
  
  const result = await safeGenerateContent(systemPrompt, prompt, { maxTokens, tenantId, action: "generate" })
  
  return {
    content: result.text,
    usage: result.usage
  }
}

export interface SummarizeParams {
  text: string
  maxLength?: number
  locale?: string
  tenantId?: string
}

/**
 * Summarize existing content
 */
export async function summarizeContent(
  params: SummarizeParams
): Promise<GenerateContentResult> {
  const { text, maxLength = 200, locale = "en", tenantId } = params
  const prompt = `You are a content summarizer. Summarize the given text concisely in ${maxLength} characters or less. Output in locale: ${locale}. Return only the summary, no extra commentary.`
  
  const result = await safeGenerateContent("", `${prompt}\n\nText to summarize:\n${text}`, { maxTokens: Math.max(maxLength, 500), tenantId, action: "summarize" })
  
  return {
    content: result.text,
    usage: result.usage
  }
}

export interface TranslateParams {
  text: string
  targetLocale: string
  sourceLocale?: string
  tenantId?: string
}

/**
 * Translate content to a target locale
 */
export async function translateContent(
  params: TranslateParams
): Promise<GenerateContentResult> {
  const { text, targetLocale, sourceLocale = "auto", tenantId } = params
  const prompt = `You are a professional translator. Translate the given text${sourceLocale !== "auto" ? ` from ${sourceLocale}` : ""} to ${targetLocale}. Preserve formatting (Markdown, HTML). Return only the translation, no extra commentary.`
  
  const result = await safeGenerateContent("", `${prompt}\n\nText to translate:\n${text}`, { tenantId, action: "translate" })
  
  return {
    content: result.text,
    usage: result.usage
  }
}

function buildSystemPrompt(opts: {
  contentType?: string
  fieldName?: string
  locale?: string
  tone?: string
  mode?: "generate" | "correct"
}): string {
  if (opts.mode === "correct") {
    const toneText = opts.tone ? ` in a ${opts.tone} tone` : ""
    return `You are a professional editor. Correct and polish the user's content${toneText}. Fix any grammar issues, spelling mistakes, typos, or punctuation errors. Rewrite it to be more clear, engaging, and professional while keeping its original meaning. If the text contains HTML tags or Markdown formatting, preserve that structure exactly. Return only the corrected/polished text with no extra commentary, explanations, or quotes.`
  }

  const parts = [
    "You are an AI content writing assistant for a headless CMS.",
    `Write in a ${opts.tone || "professional"} tone.`,
  ]

  if (opts.contentType) {
    parts.push(`The content type is "${opts.contentType}".`)
  }
  if (opts.fieldName) {
    parts.push(`You are generating content for the "${opts.fieldName}" field.`)
  }
  if (opts.locale && opts.locale !== "en") {
    parts.push(`Write in locale: ${opts.locale}.`)
  }

  parts.push("Return only the generated content. No extra commentary or labels. Do not include markdown blocks like ```json unless explicitly asked.")

  return parts.join(" ")
}
