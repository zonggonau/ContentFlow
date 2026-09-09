/**
 * Claude-powered frontend generation — mirrors the `v0-client.ts` contract
 * (createV0Chat / iterateV0Chat / getV0Preview / deleteV0Chat /
 * getV0ChatMessages) so the AI Website Builder route can pick either engine
 * behind the same interface with no changes to deploy/Site-sync/iteration
 * logic downstream.
 *
 * Unlike v0.dev, Claude has no hosted chat/project/sandbox of its own — a
 * "chat" here is purely a SaCMS-side concept: the generated files are
 * persisted to Site/SiteFile (same as a v0 build) and the chatId is a local
 * id prefixed `sacms_claude_` used only to identify this build across the
 * builder UI. There is no live server-rendered preview for Claude builds;
 * the preview route shows the generated code in an in-browser Sandpack
 * sandbox using mock data instead of a real Next.js server + live DB (see
 * the AI Website Builder's `getResolvedAiConfig().anthropicApiKey` — Claude
 * calls the same shared safeGenerateContent() pipeline as schema
 * generation, so it reuses that wiring directly).
 */

import { safeGenerateContent } from "./ai"

export interface ClaudeFile {
  name: string
  content: string
}

function makeChatId(): string {
  return `sacms_claude_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`
}

const FILE_SCHEMA_INSTRUCTION = `You must respond with ONLY a raw JSON object of this exact shape, with no markdown fences and no commentary:
{
  "files": [
    { "name": "app/page.tsx", "content": "...full file source..." },
    { "name": "app/layout.tsx", "content": "...full file source..." },
    { "name": "components/Navbar.tsx", "content": "...full file source..." }
  ]
}
Every "content" value must be the complete, valid file source as a single string (use \\n for newlines). Do not truncate files. Do not include package.json, tsconfig.json, or any config file — only app/ and components/ source files.`

function parseFilesResponse(rawText: string): ClaudeFile[] {
  let text = rawText.trim()
  if (text.startsWith("```json")) {
    text = text.replace(/^```json/, "").replace(/```\s*$/, "").trim()
  } else if (text.startsWith("```")) {
    text = text.replace(/^```/, "").replace(/```\s*$/, "").trim()
  }

  const parsed = JSON.parse(text)
  const rawFiles = Array.isArray(parsed?.files) ? parsed.files : []
  const files: ClaudeFile[] = rawFiles
    .filter((f: any) => f && typeof f.name === "string" && typeof f.content === "string")
    .map((f: any) => ({ name: f.name, content: f.content }))

  if (files.length === 0) {
    throw new Error("Claude's response did not contain any valid files")
  }
  return files
}

const GENERATION_SYSTEM_PROMPT = `You are an expert Next.js 16 App Router + TypeScript + Tailwind CSS frontend engineer building a production-quality website for a headless CMS platform called SaCMS.

${FILE_SCHEMA_INSTRUCTION}

Requirements for every build:
- Use "use client" only where interactivity (useState, onClick, forms) is needed; prefer server components otherwise.
- Fetch data from the SaCMS Public Content API endpoints given in the prompt — define a TypeScript interface for every response shape.
- Use valid, high-resolution Unsplash image URLs for any image field with no real media — never leave an <img src=""> empty.
- Build a complete, polished site: Navbar, Hero, a content/catalog section backed by real CMS data, a features or highlights section, and a Footer.
- Use Tailwind CSS utility classes only — no external CSS files, no CSS-in-JS libraries.
- Use lucide-react for icons.
- Keep every file syntactically complete and valid TypeScript/TSX — this code will be parsed and rendered directly.`

const ITERATION_SYSTEM_PROMPT = `You are iterating on an existing Next.js 16 App Router + TypeScript + Tailwind CSS website built for SaCMS, a headless CMS platform.

${FILE_SCHEMA_INSTRUCTION}

You will be given the current file set and a change request. Return the COMPLETE, updated file set — every file the site needs to keep working, not just the ones that changed. Preserve working parts of the existing code exactly where the request doesn't ask you to change them.`

export async function createClaudeChat(
  prompt: string,
  modelName: string = "claude-pro",
  tenantId?: string,
  userId?: string,
): Promise<{ chatId: string; files: ClaudeFile[]; previewUrl: string; generating?: boolean; claudeError?: string }> {
  try {
    const result = await safeGenerateContent(GENERATION_SYSTEM_PROMPT, prompt, {
      maxTokens: 8000,
      temperature: 0.5,
      responseFormat: "json_object",
      tenantId,
      userId,
      creditsCost: 0, // credit deduction is handled by the calling route, same as v0
      action: "ai_builder_generate_claude",
    })

    const files = parseFilesResponse(result.text)
    return {
      chatId: makeChatId(),
      files,
      previewUrl: "", // no hosted preview — the builder UI renders `files` in Sandpack directly
    }
  } catch (error: any) {
    console.warn("[claude-builder-client] Generation failed:", error.message)
    return {
      chatId: makeChatId(),
      files: [],
      previewUrl: "",
      claudeError: error.message,
    }
  }
}

export async function iterateClaudeChat(
  currentFiles: ClaudeFile[],
  message: string,
  tenantId?: string,
  userId?: string,
): Promise<{ files: ClaudeFile[] }> {
  const userPrompt = `Current files:\n${JSON.stringify({ files: currentFiles }, null, 2)}\n\nChange request: ${message}`

  const result = await safeGenerateContent(ITERATION_SYSTEM_PROMPT, userPrompt, {
    maxTokens: 8000,
    temperature: 0.5,
    responseFormat: "json_object",
    tenantId,
    userId,
    creditsCost: 0,
    action: "ai_builder_iterate_claude",
  })

  const files = parseFilesResponse(result.text)
  return { files }
}

/** Claude builds have no hosted preview — callers should render `files` in Sandpack instead. */
export async function getClaudePreview(_chatId: string): Promise<string> {
  return ""
}

/** Claude builds have nothing remote to delete — files live only in SaCMS's own Site/SiteFile tables. */
export async function deleteClaudeChat(_chatId: string): Promise<boolean> {
  return true
}
