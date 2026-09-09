"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  Plug,
  Terminal,
  Key,
  Database,
  Search,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Server,
  Zap,
  Code2,
  AlertTriangle,
  Globe,
  Layers,
  FileCode,
  Laptop,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  BookOpen,
  Cpu,
  Share2,
  Box,
  Radio,
  FileText
} from "lucide-react"

interface ToolDefinition {
  name: string
  title: string
  description: string
  inputs: {
    name: string
    type: string
    required: boolean
    default?: string
    description: string
  }[]
  sampleResponse: any
}

const MCP_TOOLS: ToolDefinition[] = [
  {
    name: "get_full_schema",
    title: "Get Full Schema",
    description:
      "Get the complete database schema of a SaCMS workspace — all Content Types, Single Types, and Components with their fields and relationships. Call this FIRST before building any frontend or generating types.",
    inputs: [],
    sampleResponse: {
      workspace: { id: "cmsx45pyb0015ujloxp9f4r6v", name: "My Workspace", slug: "my-workspace" },
      contentTypes: [
        {
          id: "ct_articles",
          name: "Articles",
          slug: "articles",
          description: "Blog posts and news articles",
          fields: [
            { name: "Title", slug: "title", type: "text", required: true, unique: false },
            { name: "Slug", slug: "slug", type: "slug", required: true, unique: true },
            { name: "Content", slug: "content", type: "richText", required: true },
            { name: "Author", slug: "author", type: "relation", required: false, relationSlug: "authors" }
          ]
        }
      ],
      singleTypes: [
        {
          id: "st_homepage",
          name: "Homepage Config",
          slug: "homepage-config",
          description: "Hero banner and featured layout config",
          fields: [
            { name: "Site Title", slug: "siteTitle", type: "text", required: true },
            { name: "Hero Heading", slug: "heroHeading", type: "text", required: false }
          ]
        }
      ],
      components: [
        {
          id: "comp_seo",
          name: "SEO Metadata",
          slug: "seo-metadata",
          category: "SEO",
          fields: [
            { name: "Meta Title", slug: "metaTitle", type: "text", required: true },
            { name: "Meta Description", slug: "metaDescription", type: "text", required: false }
          ]
        }
      ]
    }
  },
  {
    name: "list_content_types",
    title: "List Content Types",
    description:
      "List all Content Types (collections like articles, products, authors) with their field definitions and entry counts.",
    inputs: [],
    sampleResponse: [
      {
        id: "ct_articles",
        name: "Articles",
        slug: "articles",
        description: "Blog posts and news articles",
        entryCount: 15,
        fields: [
          { name: "Title", slug: "title", type: "text", required: true },
          { name: "Slug", slug: "slug", type: "slug", required: true },
          { name: "Content", slug: "content", type: "richText", required: true }
        ]
      }
    ]
  },
  {
    name: "get_content_type",
    title: "Get Content Type Schema",
    description: "Get detailed field schema and metadata for a specific Content Type by its slug or ID.",
    inputs: [
      { name: "slug", type: "string", required: true, description: "Slug or ID of the Content Type (e.g. 'articles')" }
    ],
    sampleResponse: {
      id: "ct_articles",
      name: "Articles",
      slug: "articles",
      description: "Blog posts and news articles",
      fields: [
        { name: "Title", slug: "title", type: "text", required: true },
        { name: "Content", slug: "content", type: "richText", required: true }
      ]
    }
  },
  {
    name: "create_content_type",
    title: "Create Content Type",
    description: "Create a new Content Type (collection) in the workspace with field definitions.",
    inputs: [
      { name: "name", type: "string", required: true, description: "Display name (e.g. 'Products')" },
      { name: "slug", type: "string", required: true, description: "Unique slug identifier (e.g. 'products')" },
      { name: "description", type: "string", required: false, description: "Optional description" },
      { name: "fields", type: "array", required: true, description: "Array of field definitions" }
    ],
    sampleResponse: {
      success: true,
      contentType: { id: "ct_products", name: "Products", slug: "products" }
    }
  },
  {
    name: "list_entries",
    title: "List / Query Entries",
    description:
      "Query published content entries with Strapi-compatible filters, search, sort, pagination, and relational populate.",
    inputs: [
      { name: "contentTypeSlug", type: "string", required: true, description: "Slug of the Content Type (e.g. 'articles')" },
      { name: "page", type: "number", required: false, default: "1", description: "Page number" },
      { name: "pageSize", type: "number", required: false, default: "25", description: "Number of entries per page (max 100)" },
      { name: "search", type: "string", required: false, description: "Search keyword across text fields" },
      { name: "filters", type: "object", required: false, description: "Strapi-style filter object (e.g. { category: { $eq: 'tech' } })" },
      { name: "sort", type: "string", required: false, description: "Sort string (e.g. 'createdAt:desc')" },
      { name: "populate", type: "array", required: false, description: "Relation field slugs to populate" }
    ],
    sampleResponse: {
      data: [
        {
          id: "cmt191h9s000nujikfe9o533b",
          title: "Building Modern Web Apps with Next.js 16 and SaCMS",
          author: "Admin",
          status: "PUBLISHED",
          createdAt: "2026-08-20T08:19:09.615Z"
        }
      ],
      meta: {
        pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 }
      }
    }
  },
  {
    name: "get_entry",
    title: "Get Single Entry",
    description: "Get a specific content entry by its ID with populated relational data.",
    inputs: [
      { name: "contentTypeSlug", type: "string", required: true, description: "Content Type slug" },
      { name: "id", type: "string", required: true, description: "Entry ID" },
      { name: "locale", type: "string", required: false, default: "en", description: "Language locale code" },
      { name: "populate", type: "array", required: false, description: "Relations to populate" }
    ],
    sampleResponse: {
      id: "cmt191h9s000nujikfe9o533b",
      title: "Building Modern Web Apps with Next.js 16 and SaCMS",
      author: "Admin",
      content: "<p>Complete guide on headless CMS...</p>",
      status: "PUBLISHED"
    }
  },
  {
    name: "create_entry",
    title: "Create Content Entry",
    description: "Create a new content entry in a collection (DRAFT or PUBLISHED).",
    inputs: [
      { name: "contentTypeSlug", type: "string", required: true, description: "Content Type slug" },
      { name: "data", type: "object", required: true, description: "JSON object with field values" },
      { name: "status", type: "string", required: false, default: "DRAFT", description: "DRAFT | PUBLISHED" },
      { name: "locale", type: "string", required: false, default: "en", description: "Language locale" }
    ],
    sampleResponse: {
      success: true,
      entry: { id: "cmt_new_entry_id", status: "PUBLISHED" }
    }
  },
  {
    name: "update_entry",
    title: "Update Content Entry",
    description: "Update field values or workflow status of an existing entry.",
    inputs: [
      { name: "contentTypeSlug", type: "string", required: true, description: "Content Type slug" },
      { name: "id", type: "string", required: true, description: "Entry ID to update" },
      { name: "data", type: "object", required: true, description: "Updated field values" },
      { name: "status", type: "string", required: false, description: "New workflow status" }
    ],
    sampleResponse: {
      success: true,
      entry: { id: "cmt191h9s000nujikfe9o533b", updatedAt: "2026-08-20T18:47:12.000Z" }
    }
  },
  {
    name: "delete_entry",
    title: "Delete Content Entry",
    description: "Delete an entry from the collection permanently.",
    inputs: [
      { name: "contentTypeSlug", type: "string", required: true, description: "Content Type slug" },
      { name: "id", type: "string", required: true, description: "Entry ID" }
    ],
    sampleResponse: {
      success: true,
      message: "Entry deleted successfully"
    }
  },
  {
    name: "get_single_type",
    title: "Get Single Type Content",
    description: "Fetch content stored in a Single Type (e.g. homepage config, site settings).",
    inputs: [
      { name: "slug", type: "string", required: true, description: "Slug of the Single Type (e.g. 'homepage-config')" },
      { name: "locale", type: "string", required: false, default: "en", description: "Locale code" }
    ],
    sampleResponse: {
      siteTitle: "My Awesome Website",
      heroHeading: "Welcome to our portal",
      heroDescription: "Powered by SaCMS"
    }
  },
  {
    name: "update_single_type",
    title: "Update Single Type Content",
    description: "Update and optionally publish data for a Single Type.",
    inputs: [
      { name: "slug", type: "string", required: true, description: "Single Type slug" },
      { name: "data", type: "object", required: true, description: "Updated JSON data" },
      { name: "publish", type: "boolean", required: false, default: "true", description: "Whether to publish immediately" }
    ],
    sampleResponse: {
      success: true,
      updatedAt: "2026-08-20T18:50:00.000Z"
    }
  },
  {
    name: "list_components",
    title: "List Components",
    description: "List all reusable schema components (e.g. SEO block, CTA banner, Author card).",
    inputs: [],
    sampleResponse: [
      {
        id: "comp_seo",
        name: "SEO Block",
        slug: "seo-block",
        category: "SEO",
        fields: [{ name: "Meta Title", slug: "metaTitle", type: "text", required: true }]
      }
    ]
  },
  {
    name: "list_webhooks",
    title: "List Webhooks",
    description: "List all webhook endpoints configured in the workspace.",
    inputs: [],
    sampleResponse: [
      {
        id: "wh_vercel_deploy",
        name: "Vercel Deploy Hook",
        url: "https://api.vercel.com/v1/integrations/deploy/...",
        events: ["content.publish", "content.update"],
        enabled: true
      }
    ]
  },
  {
    name: "get_api_docs",
    title: "Get API Docs & Reference",
    description: "Get the complete REST and GraphQL API guide with live endpoints for this workspace.",
    inputs: [],
    sampleResponse: {
      workspace: "my-workspace",
      baseUrl: "http://localhost:3000/api/public/my-workspace",
      authHeader: "Authorization: Bearer <API_TOKEN>",
      endpoints: [
        "GET /content/{contentTypeSlug}",
        "GET /content/{contentTypeSlug}/{id}",
        "POST /content/{contentTypeSlug}",
        "PUT /content/{contentTypeSlug}/{id}",
        "DELETE /content/{contentTypeSlug}/{id}",
        "GET /single/{singleTypeSlug}",
        "PUT /single/{singleTypeSlug}"
      ]
    }
  }
]

interface PlatformConfig {
  id: string
  name: string
  icon: string
  badge: string
  badgeColor: string
  configPath: string
  transport: string
  steps: string[]
  notes?: string[]
  getConfig: (mcpUrl: string) => string
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "antigravity",
    name: "Antigravity / AGY",
    icon: "⚡",
    badge: "Google DeepMind",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    configPath: ".agents/mcp_config.json",
    transport: "Streamable HTTP",
    steps: [
      "Create or open .agents/mcp_config.json in your workspace root",
      "Paste the JSON snippet below with your SaCMS URL and API token",
      "AGY will automatically connect to the MCP server upon startup or task execution",
      "Prompt: 'Check my SaCMS schema and build the corresponding Next.js pages'"
    ],
    getConfig: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            sacms: {
              url: url,
              headers: {
                Authorization: "Bearer YOUR_API_TOKEN"
              }
            }
          }
        },
        null,
        2
      )
  },
  {
    id: "vscode",
    name: "VS Code (Copilot)",
    icon: "🐙",
    badge: "GitHub Copilot",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    configPath: ".vscode/mcp.json",
    transport: "Streamable HTTP",
    steps: [
      "Create a file named .vscode/mcp.json in the root of your project workspace",
      "Paste the configuration JSON shown below",
      "Ensure VS Code 1.99+ is installed and GitHub Copilot Chat extension is enabled",
      "Open Copilot Chat and switch to Agent Mode",
      "Copilot will detect the 'sacms' MCP tools automatically"
    ],
    notes: [
      "Make sure 'chat.mcp.enabled' is checked in VS Code Settings if you are on an experimental build."
    ],
    getConfig: (url) =>
      JSON.stringify(
        {
          servers: {
            sacms: {
              type: "http",
              url: url,
              headers: {
                Authorization: "Bearer YOUR_API_TOKEN"
              }
            }
          }
        },
        null,
        2
      )
  },
  {
    id: "inspector",
    name: "MCP Inspector",
    icon: "🔬",
    badge: "Official Testing Tool",
    badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    configPath: "Terminal Command",
    transport: "CLI / Interactive UI",
    steps: [
      "Run the command below in your terminal",
      "The MCP Inspector will launch a local web UI at http://localhost:5173",
      "You can execute every tool directly, view JSON schemas, inspect parameters, and debug live responses"
    ],
    getConfig: (url) => `npx @modelcontextprotocol/inspector "${url}"`
  },
  {
    id: "curl",
    name: "cURL / HTTP",
    icon: "💻",
    badge: "Raw JSON-RPC",
    badgeColor: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    configPath: "HTTP POST",
    transport: "JSON-RPC 2.0",
    steps: [
      "Send a standard JSON-RPC 2.0 POST request to /api/mcp",
      "Include the Authorization header with Bearer YOUR_API_TOKEN",
      "Call 'tools/call' with the desired tool name and arguments"
    ],
    getConfig: (url) =>
      `curl -X POST "${url}" \\\n  -H "Authorization: Bearer YOUR_API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "jsonrpc": "2.0",\n    "id": 1,\n    "method": "tools/call",\n    "params": {\n      "name": "get_full_schema",\n      "arguments": {}\n    }\n  }'`
  }
]

const PROMPT_RECIPES = [
  {
    title: "Generate TypeScript Interfaces from CMS Schema",
    category: "Code Generation",
    prompt:
      "Please call the SaCMS MCP tool `get_full_schema`. Based on the returned Content Types, Single Types, and Components, generate strongly-typed TypeScript interfaces with JSDoc comments for my frontend application."
  },
  {
    title: "Build a Next.js 16 Server Component for Articles",
    category: "Full-Stack Development",
    prompt:
      "Use the SaCMS MCP server to inspect the `articles` content type schema and query 5 recent published articles. Then, build a Next.js 16 Server Component with responsive Tailwind CSS styling, ISR caching (`revalidate: 60`), and proper SEO metadata."
  },
  {
    title: "Construct Landing Page from Homepage Single Type",
    category: "UI / UX Design",
    prompt:
      "Call the `get_single_type_content` tool with `singleTypeSlug: 'homepage'`. Using the returned hero title, subtitles, and CTA buttons, build a modern, high-converting React landing page component."
  },
  {
    title: "E-Commerce Product Catalog with Live Search",
    category: "Interactive Component",
    prompt:
      "Use `query_content` with `contentTypeSlug: 'products'` to fetch product items. Create a Client Component featuring instant keyword search, category filtering, and price sorting wired to the SaCMS REST API."
  },
  {
    title: "REST API Integration Guide & Fetch Helper",
    category: "Architecture",
    prompt:
      "Execute `get_api_info` from the SaCMS MCP server. Write a reusable API client utility module (`lib/cms.ts`) with custom error handling, pagination helpers, and TypeScript return types."
  },
  {
    title: "Analyze CMS Schema & Suggest SEO Improvements",
    category: "SEO & Strategy",
    prompt:
      "Query all content types and components using `get_full_schema`. Analyze the schema fields and recommend missing SEO, OpenGraph, or accessibility metadata fields for each collection."
  }
]

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy", err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
        copied
          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
          : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60"
      } ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? "Copied!" : "Copy"}</span>
    </button>
  )
}

function CodeBlock({ code, language = "bash", filename }: { code: string; language?: string; filename?: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-border/80 bg-zinc-950 text-zinc-100 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 text-xs font-mono text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          {filename && <span className="ml-2 text-zinc-300 font-semibold">{filename}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{language}</span>
          <CopyButton text={code} />
        </div>
      </div>
      <pre className="p-4 text-xs sm:text-sm font-mono overflow-x-auto leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function DocsClient() {
  const [origin, setOrigin] = useState("http://localhost:3000")
  const [selectedPlatform, setSelectedPlatform] = useState("antigravity")
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({
    get_full_schema: true,
    query_content: true
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSection, setActiveSection] = useState("introduction")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
    }
  }, [])

  const mcpServerUrl = `${origin}/api/mcp`

  const toggleTool = (toolName: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [toolName]: !prev[toolName]
    }))
  }

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return MCP_TOOLS
    const q = searchQuery.toLowerCase()
    return MCP_TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const activePlatformData = useMemo(() => {
    return PLATFORMS.find((p) => p.id === selectedPlatform) || PLATFORMS[0]
  }, [selectedPlatform])

  return (
    <div className="min-h-screen bg-muted/40 text-foreground font-sans selection:bg-orange-500/20 selection:text-orange-500">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/20 group-hover:scale-105 transition-transform">
                <Layers className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">SaCMS Docs</span>
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-900/50">
              <Sparkles className="w-3 h-3" /> v1.2.0
            </span>
          </div>

          {/* Quick links & Status */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              MCP Server Active
            </div>
            <a
              href="#mcp-overview"
              className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 transition-colors flex items-center gap-1"
            >
              <Plug className="w-3.5 h-3.5 text-violet-500" />
              MCP Server
            </a>
            <a
              href="#content-api"
              className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 transition-colors hidden sm:block"
            >
              REST API
            </a>
            <Link
              href="/login"
              className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 shadow-sm transition-all hover:scale-102"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-24 flex flex-col lg:flex-row gap-10">
        {/* Sticky Sidebar Navigation */}
        <aside className="lg:w-64 shrink-0">
          <div className="lg:sticky lg:top-24 space-y-6">
            {/* Search filter input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search docs & tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all placeholder:text-muted-foreground"
              />
            </div>

            {/* Model Context Protocol (MCP) Section - Highlighted */}
            <div className="p-3 rounded-xl border border-violet-200 dark:border-violet-900/60 bg-gradient-to-b from-violet-50/70 to-blue-50/40 dark:from-violet-950/20 dark:to-blue-950/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300">
                  <Plug className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  Model Context Protocol
                </span>
                <span className="text-[10px] bg-violet-200/80 dark:bg-violet-900/80 text-violet-800 dark:text-violet-200 px-1.5 py-0.5 rounded font-mono font-bold">
                  AI Tools
                </span>
              </div>
              <ul className="space-y-1 text-xs">
                <li>
                  <a
                    href="#mcp-overview"
                    className="block px-2 py-1 rounded text-foreground/80 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors font-medium"
                  >
                    ✦ Overview & Architecture
                  </a>
                </li>
                <li>
                  <a
                    href="#mcp-endpoint"
                    className="block px-2 py-1 rounded text-foreground/80 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors"
                  >
                    ✦ Endpoint & Auth
                  </a>
                </li>
                <li>
                  <a
                    href="#mcp-tools"
                    className="block px-2 py-1 rounded text-foreground/80 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors font-medium flex items-center justify-between"
                  >
                    <span>✦ Tool Reference (7 Tools)</span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-1 rounded">7</span>
                  </a>
                </li>
                <li>
                  <a
                    href="#mcp-ide-setup"
                    className="block px-2 py-1 rounded text-foreground/80 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors"
                  >
                    ✦ Antigravity & VS Code Setup
                  </a>
                </li>
                <li>
                  <a
                    href="#mcp-tunneling"
                    className="block px-2 py-1 rounded text-foreground/80 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors"
                  >
                    ✦ Localhost Tunneling
                  </a>
                </li>
                <li>
                  <a
                    href="#mcp-recipes"
                    className="block px-2 py-1 rounded text-foreground/80 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors"
                  >
                    ✦ AI Prompt Recipes
                  </a>
                </li>
              </ul>
            </div>

            {/* Getting Started Nav */}
            <div>
              <h4 className="font-bold text-xs tracking-wider text-muted-foreground uppercase mb-2.5 px-2">
                Getting Started
              </h4>
              <ul className="space-y-1 text-sm">
                <li>
                  <a
                    href="#introduction"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    Introduction
                  </a>
                </li>
                <li>
                  <a
                    href="#authentication"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    Authentication & Keys
                  </a>
                </li>
                <li>
                  <a
                    href="#sdk"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    TypeScript SDK
                  </a>
                </li>
              </ul>
            </div>

            {/* REST API Nav */}
            <div>
              <h4 className="font-bold text-xs tracking-wider text-muted-foreground uppercase mb-2.5 px-2">
                REST API Reference
              </h4>
              <ul className="space-y-1 text-sm">
                <li>
                  <a
                    href="#content-api"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    Content API (Collections)
                  </a>
                </li>
                <li>
                  <a
                    href="#filtering"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    Advanced Filtering Operators
                  </a>
                </li>
                <li>
                  <a
                    href="#single-types"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    Single Types API
                  </a>
                </li>
                <li>
                  <a
                    href="#graphql"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    GraphQL API Reference
                  </a>
                </li>
              </ul>
            </div>

            {/* Enterprise & Infrastructure Nav */}
            <div>
              <h4 className="font-bold text-xs tracking-wider text-muted-foreground uppercase mb-2.5 px-2">
                Infrastructure & DB
              </h4>
              <ul className="space-y-1 text-sm">
                <li>
                  <a
                    href="#byodb"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    Bring Your Own DB (BYODB)
                  </a>
                </li>
                <li>
                  <a
                    href="#domains"
                    className="block px-2 py-1.5 rounded text-muted-foreground hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 hover:bg-muted font-medium transition-colors"
                  >
                    Custom Domains & DNS
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </aside>

        {/* Documentation Content Area */}
        <main className="flex-1 min-w-0 space-y-20">
          {/* ================================================================= */}
          {/* MODEL CONTEXT PROTOCOL (MCP) — MAIN SPOTLIGHT SECTION */}
          {/* ================================================================= */}
          <section id="mcp-overview" className="scroll-mt-24 space-y-8">
            {/* Spotlight Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-violet-200 dark:border-violet-900/60 bg-gradient-to-br from-violet-600/10 via-blue-600/5 to-transparent p-6 sm:p-8 backdrop-blur-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25 text-white">
                    <Plug className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                        Model Context Protocol (MCP) Server
                      </h1>
                      <span className="px-2 py-0.5 text-xs font-bold bg-violet-100 text-violet-800 dark:bg-violet-900/80 dark:text-violet-200 rounded-full border border-violet-300 dark:border-violet-700">
                        v1.0
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Live AI Tooling integration for Antigravity and VS Code (GitHub Copilot)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    MCP Spec Docs
                  </a>
                </div>
              </div>

              <p className="text-foreground/80 leading-relaxed text-sm sm:text-base mb-6">
                SaCMS includes a native <strong>Model Context Protocol (MCP) Server</strong> that bridges your headless CMS content and database schemas directly with modern AI programming assistants.
                Instead of manually copying schemas, endpoints, or mock JSON into prompt windows, AI agents can dynamically query your schema definitions, inspect content entries, and generate pixel-perfect frontends or TypeScript interfaces autonomously.
              </p>

              {/* Architecture Diagram Box */}
              <div className="rounded-xl bg-white/70 dark:bg-zinc-900/80 border border-violet-200/80 dark:border-violet-900/40 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-3">
                  <Cpu className="w-4 h-4 text-violet-500" />
                  How SaCMS MCP Works
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-muted/40/60 border border-border">
                    <span className="font-bold text-violet-600 dark:text-violet-400 block mb-1">1. AI Client (Antigravity / VS Code)</span>
                    <p className="text-muted-foreground">Issues tool calls over Streamable HTTP or SSE to query content or inspect schemas.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40/60 border border-border">
                    <span className="font-bold text-blue-600 dark:text-blue-400 block mb-1">2. SaCMS MCP Server (`/api/mcp`)</span>
                    <p className="text-muted-foreground">Authenticates via Bearer Token, resolves tenant workspace, and executes secure database operations.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40/60 border border-border">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-1">3. Live CMS Context</span>
                    <p className="text-muted-foreground">AI receives structured schema fields, single type data, or published records to build complete codebases.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* MCP Endpoint & Auth */}
            <div id="mcp-endpoint" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                  <Server className="w-4 h-4" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">MCP Server Endpoint & Transports</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                The SaCMS MCP Server supports standard <strong>Streamable HTTP</strong> and <strong>Server-Sent Events (SSE)</strong> transports, compatible with all modern MCP-compliant clients.
              </p>

              {/* Endpoint card */}
              <div className="p-4 rounded-xl border border-border bg-zinc-100/70 dark:bg-zinc-900/60 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-violet-600 text-white font-mono">POST / GET</span>
                    <code className="text-sm font-mono font-bold text-foreground">
                      {mcpServerUrl}
                    </code>
                  </div>
                  <CopyButton text={mcpServerUrl} />
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• <strong>Transport:</strong> Streamable HTTP (JSON-RPC 2.0) with SSE fallback</p>
                  <p>• <strong>Protocol Version:</strong> MCP Specification 2024-11-05</p>
                  <p>• <strong>Workspace Isolation:</strong> Automatically scoped to the tenant workspace bound to the API token</p>
                </div>
              </div>

              {/* Authentication */}
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Key className="w-4 h-4 text-orange-500" />
                  MCP Authentication
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  All requests to the MCP server must include a valid <strong>SaCMS API Token</strong>. You can generate a Read-Only API Token in your dashboard under <code>Dashboard → [Tenant] → Developer → API Keys</code>.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-border bg-white dark:bg-zinc-900">
                    <span className="text-xs font-bold text-foreground block mb-1">1. HTTP Header (Recommended)</span>
                    <pre className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-muted p-2 rounded">
                      Authorization: Bearer YOUR_API_TOKEN
                    </pre>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-white dark:bg-zinc-900">
                    <span className="text-xs font-bold text-foreground block mb-1">2. Query Parameter (For SSE / Web clients)</span>
                    <pre className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-muted p-2 rounded">
                      /api/mcp?token=YOUR_API_TOKEN
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================= */}
            {/* TOOL REFERENCE (7 TOOLS) */}
            {/* ============================================================= */}
            <div id="mcp-tools" className="scroll-mt-24 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">MCP Tool Reference</h2>
                    <p className="text-xs text-muted-foreground">Complete catalogue of available AI tools and callable methods</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {filteredTools.length} Tools Available
                </span>
              </div>

              {/* Tools List */}
              <div className="space-y-4">
                {filteredTools.map((tool) => {
                  const isExpanded = !!expandedTools[tool.name]
                  return (
                    <div
                      key={tool.name}
                      className="rounded-xl border border-border/80 bg-white dark:bg-zinc-900/90 shadow-sm overflow-hidden transition-all"
                    >
                      {/* Header bar */}
                      <button
                        type="button"
                        onClick={() => toggleTool(tool.name)}
                        className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0">
                            <Code2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-sm sm:text-base font-mono font-bold text-violet-600 dark:text-violet-400">
                                {tool.name}
                              </code>
                              <span className="text-xs text-muted-foreground font-medium hidden sm:inline">— {tool.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate max-w-xl">
                              {tool.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground hidden sm:inline-block">
                            {tool.inputs.length === 0 ? "No arguments" : `${tool.inputs.length} arg${tool.inputs.length > 1 ? "s" : ""}`}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {/* Expanded tool details */}
                      {isExpanded && (
                        <div className="p-4 sm:p-5 pt-0 border-t border-border/60 space-y-4 text-xs sm:text-sm bg-zinc-50/50 dark:bg-zinc-950/40">
                          <p className="text-muted-foreground pt-3">
                            {tool.description}
                          </p>

                          {/* Inputs Table */}
                          {tool.inputs.length > 0 ? (
                            <div className="space-y-2">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Parameters / Arguments
                              </h4>
                              <div className="overflow-x-auto rounded-lg border border-border bg-white dark:bg-zinc-900">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-muted/80 text-foreground/80 font-semibold border-b border-border">
                                    <tr>
                                      <th className="p-2.5">Field</th>
                                      <th className="p-2.5">Type</th>
                                      <th className="p-2.5">Required</th>
                                      <th className="p-2.5">Default</th>
                                      <th className="p-2.5">Description</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border font-mono">
                                    {tool.inputs.map((input) => (
                                      <tr key={input.name}>
                                        <td className="p-2.5 font-bold text-violet-600 dark:text-violet-400">{input.name}</td>
                                        <td className="p-2.5 text-muted-foreground">{input.type}</td>
                                        <td className="p-2.5">
                                          {input.required ? (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Yes</span>
                                          ) : (
                                            <span className="text-muted-foreground text-[10px]">No</span>
                                          )}
                                        </td>
                                        <td className="p-2.5 text-muted-foreground">{input.default || "—"}</td>
                                        <td className="p-2.5 font-sans text-muted-foreground">{input.description}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-lg bg-zinc-100/80 dark:bg-zinc-900/80 text-xs text-muted-foreground flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              This tool takes no arguments. Simply call <code>{tool.name}()</code>.
                            </div>
                          )}

                          {/* Sample response */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                              <span>SAMPLE RESPONSE PAYLOAD (JSON)</span>
                              <CopyButton text={JSON.stringify(tool.sampleResponse, null, 2)} />
                            </div>
                            <pre className="p-3 rounded-lg bg-zinc-950 text-zinc-200 text-xs font-mono overflow-x-auto max-h-64 border border-zinc-800">
                              <code>{JSON.stringify(tool.sampleResponse, null, 2)}</code>
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ============================================================= */}
            {/* IDE & AI CLIENT SETUP GUIDES (TABBED) */}
            {/* ============================================================= */}
            <div id="mcp-ide-setup" className="scroll-mt-24 space-y-6">
              <div className="flex items-center gap-2.5 border-b border-border pb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">AI Client & IDE Setup Guides</h2>
                  <p className="text-xs text-muted-foreground">Step-by-step configuration files and connection instructions for every platform</p>
                </div>
              </div>

              {/* Platform selector buttons */}
              <div className="flex flex-wrap gap-2 p-1.5 rounded-xl bg-muted border border-border">
                {PLATFORMS.map((p) => {
                  const isActive = selectedPlatform === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlatform(p.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                        isActive
                          ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm border border-zinc-200/80 dark:border-zinc-700"
                          : "text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100"
                      }`}
                    >
                      <span>{p.icon}</span>
                      <span>{p.name}</span>
                    </button>
                  )
                })}
              </div>

              {/* Selected Platform Guide Card */}
              <div className="p-6 rounded-2xl border border-border bg-white dark:bg-zinc-900/80 shadow-sm space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{activePlatformData.icon}</span>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">
                        {activePlatformData.name} Integration
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${activePlatformData.badgeColor}`}>
                          {activePlatformData.badge}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {activePlatformData.transport}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground font-mono bg-muted px-3 py-1 rounded-md">
                    Config: <span className="text-foreground font-semibold">{activePlatformData.configPath}</span>
                  </div>
                </div>

                {/* Step by step */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Setup Steps
                  </h4>
                  <ol className="space-y-2 text-xs sm:text-sm text-foreground/80 ml-4 list-decimal marker:font-bold marker:text-violet-600">
                    {activePlatformData.steps.map((step, idx) => (
                      <li key={idx} className="pl-1 leading-relaxed">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Configuration snippet */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                    <span>CONFIGURATION FILE CONTENT</span>
                  </div>
                  <CodeBlock
                    code={activePlatformData.getConfig(mcpServerUrl)}
                    language={activePlatformData.id === "curl" || activePlatformData.id === "inspector" ? "bash" : "json"}
                    filename={activePlatformData.configPath}
                  />
                </div>

                {/* Platform notes */}
                {activePlatformData.notes && (
                  <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Helpful Tips for {activePlatformData.name}:
                    </div>
                    {activePlatformData.notes.map((note, i) => (
                      <p key={i}>• {note}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ============================================================= */}
            {/* TUNNELING GUIDE (LOCALHOST VS PRODUCTION) */}
            {/* ============================================================= */}
            <div id="mcp-tunneling" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Tunneling for Local Development</h2>
                  <p className="text-xs text-muted-foreground">Connecting cloud AI assistants (v0, Claude Web, etc.) to your local machine</p>
                </div>
              </div>

              <div className="p-5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-xs sm:text-sm text-foreground/80 space-y-4">
                <div className="flex gap-2.5 items-start">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    <strong>Antigravity</strong> and <strong>VS Code</strong> running on your local machine can directly connect to <code className="font-mono bg-muted px-1 py-0.5 rounded">http://localhost:3000/api/mcp</code>.
                    Remote/cloud-hosted IDE instances cannot reach your private localhost directly without a secure public tunnel.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      Option A: Cloudflare Tunnel (Free & Fast)
                    </span>
                    <CodeBlock
                      code="cloudflared tunnel --url http://localhost:3000"
                      language="bash"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Copy the generated <code className="font-mono">https://*.trycloudflare.com/api/mcp</code> URL into your AI agent.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      Option B: ngrok Tunnel
                    </span>
                    <CodeBlock
                      code="ngrok http 3000"
                      language="bash"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Copy the resulting forwarding HTTPS address + <code className="font-mono">/api/mcp</code>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================= */}
            {/* AI PROMPT RECIPES & WORKFLOWS */}
            {/* ============================================================= */}
            <div id="mcp-recipes" className="scroll-mt-24 space-y-6">
              <div className="flex items-center gap-2.5 border-b border-border pb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">AI Prompt Recipes & Workflows</h2>
                  <p className="text-xs text-muted-foreground">Ready-to-use prompt templates to supercharge your development in Antigravity & VS Code</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PROMPT_RECIPES.map((recipe, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl border border-border bg-white dark:bg-zinc-900/90 shadow-sm flex flex-col justify-between gap-3 hover:border-violet-500/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
                          {recipe.category}
                        </span>
                        <CopyButton text={recipe.prompt} />
                      </div>
                      <h3 className="font-bold text-sm text-foreground mb-1.5">
                        {recipe.title}
                      </h3>
                      <p className="text-xs text-muted-foreground italic bg-muted/40 p-2.5 rounded-lg border border-border/60 leading-relaxed font-mono">
                        "{recipe.prompt}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <hr className="border-border" />

          {/* ================================================================= */}
          {/* GETTING STARTED: INTRODUCTION */}
          {/* ================================================================= */}
          <section id="introduction" className="scroll-mt-24 space-y-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              REST API Documentation
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              SaCMS provides a powerful, high-performance public REST API to fetch your managed content securely. Built with Next.js 16 App Router, PostgreSQL JSONB, and edge rate-limiting, it supports flexible query parameters, Strapi-compatible filtering, deep population, and full-text search.
            </p>
            <div className="bg-muted rounded-xl p-4 border border-border flex items-center gap-3 font-mono text-xs sm:text-sm">
              <Terminal className="w-5 h-5 text-muted-foreground shrink-0" />
              <code className="text-foreground">
                Base URL: {origin}/api/public/[tenant-slug]
              </code>
            </div>
          </section>

          {/* AUTHENTICATION */}
          <section id="authentication" className="scroll-mt-24 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-orange-100 dark:bg-orange-500/20 p-2 rounded-lg text-orange-600 dark:text-orange-400">
                <Key className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">REST Authentication</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              All public REST API requests must include your API key in the headers. You can generate read-only or full-access API keys from your SaCMS Dashboard under <strong>Developer Settings → API Keys</strong>.
            </p>
            <CodeBlock
              code="x-api-key: your_api_key_here\n# Or Authorization header:\nAuthorization: Bearer your_api_key_here"
              language="http"
              filename="Headers"
            />
          </section>

          {/* TYPESCRIPT SDK */}
          <section id="sdk" className="scroll-mt-24 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-emerald-100 dark:bg-emerald-500/20 p-2 rounded-lg text-emerald-600 dark:text-emerald-400">
                <Terminal className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">TypeScript SDK (@sacms/sdk)</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              The official SaCMS TypeScript SDK provides a fluent query builder, built-in rate-limit retries, and strongly-typed content models for Next.js 16 (App Router), React, and Node.js.
            </p>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground">1. Install Package</h3>
              <CodeBlock
                code="npm install @sacms/sdk\n# or with Bun:\nbun add @sacms/sdk"
                language="bash"
                filename="Terminal"
              />
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-bold text-foreground">2. Generate TypeScript Definitions CLI</h3>
              <p className="text-xs text-muted-foreground">Download your workspace schema and generate strongly-typed interfaces automatically:</p>
              <CodeBlock
                code={`npx @sacms/sdk generate --url ${origin} --tenant my-workspace --token YOUR_API_KEY --out src/types/sacms.d.ts`}
                language="bash"
                filename="Terminal CLI"
              />
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-bold text-foreground">3. Next.js 16 App Router Server Component Example</h3>
              <CodeBlock
                code={`import { SaCMS } from '@sacms/sdk'

// Initialize client (lib/cms.ts)
export const sacms = new SaCMS({
  baseUrl: process.env.NEXT_PUBLIC_CMS_URL || '${origin}',
  tenant: process.env.CMS_TENANT || 'my-workspace',
  token: process.env.CMS_API_KEY || 'YOUR_API_KEY'
})

// app/articles/page.tsx (Server Component)
export default async function ArticlesPage() {
  const { data: articles } = await sacms.collection('articles').findMany({
    page: 1,
    pageSize: 10,
    sort: 'createdAt:desc',
  })

  return (
    <main className="max-w-4xl mx-auto py-12">
      <h1 className="text-3xl font-bold mb-6">Latest Articles</h1>
      <div className="grid gap-4">
        {articles.map((article: any) => (
          <article key={article.id} className="p-4 border rounded-xl">
            <h2 className="text-xl font-bold">{article.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{new Date(article.createdAt).toLocaleDateString()}</p>
          </article>
        ))}
      </div>
    </main>
  )
}`}
                language="typescript"
                filename="app/articles/page.tsx"
              />
            </div>
          </section>

          {/* CONTENT API */}
          <section id="content-api" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-100 dark:bg-blue-500/20 p-2 rounded-lg text-blue-600 dark:text-blue-400">
                <Database className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Content API (Collections)</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Fetch multiple entries of a specific Content Type. Supports pagination, full-text search, field selection, and multi-relational population.
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 rounded">
                  GET
                </span>
                <code className="text-sm font-semibold font-mono">
                  /api/public/[tenant]/content/[contentTypeSlug]
                </code>
              </div>

              <CodeBlock
                code={`fetch('${origin}/api/public/my-tenant/content/articles?filters[title][$contains]=Next.js&limit=10', {
  headers: {
    'x-api-key': 'YOUR_API_KEY'
  }
})`}
                language="typescript"
                filename="Example Request"
              />
            </div>
          </section>

          {/* ADVANCED FILTERING */}
          <section id="filtering" className="scroll-mt-24 space-y-6">
            <h3 className="text-xl font-bold tracking-tight">Advanced Filtering Operators</h3>
            <p className="text-sm text-muted-foreground">
              SaCMS uses Strapi-compatible filtering syntax: <code>?filters[field][$operator]=value</code>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg border border-border bg-white dark:bg-zinc-900 flex justify-between items-center">
                <span className="text-pink-600 dark:text-pink-400 font-bold">$eq, $ne</span>
                <span className="text-muted-foreground uppercase">Equal / Not Equal</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-white dark:bg-zinc-900 flex justify-between items-center">
                <span className="text-pink-600 dark:text-pink-400 font-bold">$gt, $gte, $lt, $lte</span>
                <span className="text-muted-foreground uppercase">Comparisons</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-white dark:bg-zinc-900 flex justify-between items-center">
                <span className="text-pink-600 dark:text-pink-400 font-bold">$contains, $startsWith</span>
                <span className="text-muted-foreground uppercase">Case-insensitive text match</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-white dark:bg-zinc-900 flex justify-between items-center">
                <span className="text-pink-600 dark:text-pink-400 font-bold">$in, $notIn</span>
                <span className="text-muted-foreground uppercase">Array inclusion (comma separated)</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-white dark:bg-zinc-900 flex justify-between items-center">
                <span className="text-pink-600 dark:text-pink-400 font-bold">$null, $notNull</span>
                <span className="text-muted-foreground uppercase">Nullability check</span>
              </div>
            </div>
          </section>

          {/* SINGLE TYPES API */}
          <section id="single-types" className="scroll-mt-24 space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Single Types API</h2>
            <p className="text-sm text-muted-foreground">
              Fetch singleton data structures such as Global Navigation, Homepage Hero, or Site Settings.
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 rounded">
                  GET
                </span>
                <code className="text-sm font-semibold font-mono">
                  /api/public/[tenant]/single/[singleTypeSlug]
                </code>
              </div>

              <CodeBlock
                code={`fetch('${origin}/api/public/my-tenant/single/homepage-settings', {
  headers: {
    'x-api-key': 'YOUR_API_KEY'
  }
})`}
                language="typescript"
                filename="Example Request"
              />
            </div>
          </section>

          {/* GRAPHQL API */}
          <section id="graphql" className="scroll-mt-24 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-pink-100 dark:bg-pink-500/20 p-2 rounded-lg text-pink-600 dark:text-pink-400">
                <Code2 className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">GraphQL API Reference</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Execute dynamic GraphQL queries and mutations with full field selection, pagination, and relational populate.
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 rounded">
                  POST
                </span>
                <code className="text-sm font-semibold font-mono">
                  /api/public/[tenant]/graphql
                </code>
              </div>

              <CodeBlock
                code={`query GetArticles {
  articles(limit: 5, sort: "createdAt:desc") {
    data {
      id
      title
      slug
      publishedAt
    }
    meta {
      pagination {
        total
        page
        pageSize
      }
    }
  }
}`}
                language="graphql"
                filename="Query Example"
              />
            </div>
          </section>

          {/* BRING YOUR OWN DATABASE (BYODB) */}
          <section id="byodb" className="scroll-mt-24 space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="bg-amber-100 dark:bg-amber-500/20 p-2 rounded-lg text-amber-600 dark:text-amber-400">
                <Database className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Bring Your Own Database (BYODB)</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Enterprise and Pro workspaces can connect dedicated external PostgreSQL databases and S3 object storage buckets for absolute data isolation and compliance.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl border bg-card space-y-2">
                <div className="font-bold text-sm text-emerald-600">⚡ Supabase</div>
                <p className="text-muted-foreground">Gunakan Connection Pooling URI pada port 6543 atau 5432 direct connection.</p>
                <code className="block p-2 bg-muted rounded font-mono text-[11px] break-all">
                  postgresql://postgres.xxx:[PASS]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
                </code>
              </div>

              <div className="p-4 rounded-xl border bg-card space-y-2">
                <div className="font-bold text-sm text-blue-600">🌊 Neon DB</div>
                <p className="text-muted-foreground">Serverless Postgres URL dengan SSL mode require.</p>
                <code className="block p-2 bg-muted rounded font-mono text-[11px] break-all">
                  postgresql://[USER]:[PASS]@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
                </code>
              </div>

              <div className="p-4 rounded-xl border bg-card space-y-2">
                <div className="font-bold text-sm text-amber-600">📦 AWS RDS / S3</div>
                <p className="text-muted-foreground">PostgreSQL RDS instance dan S3 bucket dengan AWS Access Keys.</p>
                <code className="block p-2 bg-muted rounded font-mono text-[11px] break-all">
                  postgresql://root:[PASS]@mydb.c123.ap-southeast-1.rds.amazonaws.com:5432/sacms
                </code>
              </div>
            </div>
          </section>

          {/* CUSTOM DOMAINS & DNS */}
          <section id="domains" className="scroll-mt-24 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-cyan-100 dark:bg-cyan-500/20 p-2 rounded-lg text-cyan-600 dark:text-cyan-400">
                <Globe className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Custom Domains & Cloudflare DNS</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Arahkan domain atau subdomain kustom Anda (misal: <code>cms.perusahaan.com</code>) ke SaCMS Cloud untuk white-labeling dashboard dan API endpoint.
            </p>

            <div className="p-4 rounded-xl border bg-muted/40 space-y-3 text-xs">
              <div className="font-bold text-foreground">Langkah Konfigurasi DNS:</div>
              <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
                <li>Buka DNS Management di registrar atau Cloudflare Anda.</li>
                <li>Tambahkan record <strong>CNAME</strong> dengan nama subdomain (misal: <code>cms</code>) dan arahkan target ke <code>sacms.cloud</code>.</li>
                <li>Masuk ke <strong>Dashboard Workspace → Settings → Domains</strong> dan klik <strong>"Verify Domain"</strong>.</li>
                <li>Sertifikat SSL Let's Encrypt / Cloudflare SSL akan otomatis aktif dalam 1-2 menit.</li>
              </ol>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
