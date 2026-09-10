import { getRedis } from '../redis'
import { isMockAllowed, requireCredentialOutsideMock } from '../dev-mode'

export interface ContaboPlanDefinition {
  id: string
  name: string
  productId: string
  type: 'VPS' | 'VDS' | 'Storage'
  series: 'Cloud VPS' | 'Cloud VPS Plus' | 'VPS Storage' | 'Cloud VDS'
  cpuCores: number
  isDedicatedCpu: boolean
  ramMb: number
  diskGb: number
  diskType: 'SSD' | 'NVMe'
  bandwidthMbps: number
  monthlyPriceEur: number
  monthlyPriceIdr: number
  description: string
  regions: string[]
}

export const CONTABO_PLANS: Record<string, ContaboPlanDefinition> = {
  // ─── 1. Cloud VPS Series (Cost-Effective SSD: 12jt - 52jt / thn) ───
  "vps-4": {
    id: "vps-4",
    name: "Cloud VPS 4",
    productId: "V153",
    type: "VPS",
    series: "Cloud VPS",
    cpuCores: 4,
    isDedicatedCpu: false,
    ramMb: 8192,
    diskGb: 100,
    diskType: "SSD",
    bandwidthMbps: 200,
    monthlyPriceEur: 4.50,
    monthlyPriceIdr: 1200000,
    description: "4 vCPU, 8 GB RAM, 100 GB SSD (Entry Level Dedicated DB & Storage)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-6": {
    id: "vps-6",
    name: "Cloud VPS 6",
    productId: "V154",
    type: "VPS",
    series: "Cloud VPS",
    cpuCores: 6,
    isDedicatedCpu: false,
    ramMb: 12288,
    diskGb: 200,
    diskType: "SSD",
    bandwidthMbps: 400,
    monthlyPriceEur: 8.50,
    monthlyPriceIdr: 1800000,
    description: "6 vCPU, 12 GB RAM, 200 GB SSD (Mid-range Dedicated DB)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-8": {
    id: "vps-8",
    name: "Cloud VPS 8",
    productId: "V155",
    type: "VPS",
    series: "Cloud VPS",
    cpuCores: 8,
    isDedicatedCpu: false,
    ramMb: 16384,
    diskGb: 300,
    diskType: "SSD",
    bandwidthMbps: 600,
    monthlyPriceEur: 14.50,
    monthlyPriceIdr: 2500000,
    description: "8 vCPU, 16 GB RAM, 300 GB SSD (High Content DB)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-12": {
    id: "vps-12",
    name: "Cloud VPS 12",
    productId: "V156",
    type: "VPS",
    series: "Cloud VPS",
    cpuCores: 12,
    isDedicatedCpu: false,
    ramMb: 24576,
    diskGb: 400,
    diskType: "SSD",
    bandwidthMbps: 800,
    monthlyPriceEur: 22.50,
    monthlyPriceIdr: 3400000,
    description: "12 vCPU, 24 GB RAM, 400 GB SSD (Scale-out Production)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-16": {
    id: "vps-16",
    name: "Cloud VPS 16",
    productId: "V157",
    type: "VPS",
    series: "Cloud VPS",
    cpuCores: 16,
    isDedicatedCpu: false,
    ramMb: 32768,
    diskGb: 500,
    diskType: "SSD",
    bandwidthMbps: 1000,
    monthlyPriceEur: 32.50,
    monthlyPriceIdr: 4300000,
    description: "16 vCPU, 32 GB RAM, 500 GB SSD (Enterprise Traffic)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-18": {
    id: "vps-18",
    name: "Cloud VPS 18",
    productId: "V158",
    type: "VPS",
    series: "Cloud VPS",
    cpuCores: 18,
    isDedicatedCpu: false,
    ramMb: 49152,
    diskGb: 600,
    diskType: "SSD",
    bandwidthMbps: 1000,
    monthlyPriceEur: 45.00,
    monthlyPriceIdr: 5200000,
    description: "18 vCPU, 48 GB RAM, 600 GB SSD (Maximum Capacity VPS)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },

  // ─── 2. Cloud VPS Plus Series (Extreme Performance NVMe: 15jt - 80jt / thn) ───
  "vps-plus-4": {
    id: "vps-plus-4",
    name: "Cloud VPS Plus 4",
    productId: "V159",
    type: "VPS",
    series: "Cloud VPS Plus",
    cpuCores: 4,
    isDedicatedCpu: false,
    ramMb: 8192,
    diskGb: 150,
    diskType: "NVMe",
    bandwidthMbps: 250,
    monthlyPriceEur: 6.50,
    monthlyPriceIdr: 1500000,
    description: "4 vCPU, 8 GB RAM, 150 GB NVMe (High IOPS Database)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-plus-6": {
    id: "vps-plus-6",
    name: "Cloud VPS Plus 6",
    productId: "V160",
    type: "VPS",
    series: "Cloud VPS Plus",
    cpuCores: 6,
    isDedicatedCpu: false,
    ramMb: 16384,
    diskGb: 300,
    diskType: "NVMe",
    bandwidthMbps: 500,
    monthlyPriceEur: 11.50,
    monthlyPriceIdr: 2200000,
    description: "6 vCPU, 16 GB RAM, 300 GB NVMe (High-traffic Portal)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-plus-8": {
    id: "vps-plus-8",
    name: "Cloud VPS Plus 8",
    productId: "V161",
    type: "VPS",
    series: "Cloud VPS Plus",
    cpuCores: 8,
    isDedicatedCpu: false,
    ramMb: 24576,
    diskGb: 450,
    diskType: "NVMe",
    bandwidthMbps: 750,
    monthlyPriceEur: 18.50,
    monthlyPriceIdr: 3200000,
    description: "8 vCPU, 24 GB RAM, 450 GB NVMe (E-Commerce & High Read/Write)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-plus-12": {
    id: "vps-plus-12",
    name: "Cloud VPS Plus 12",
    productId: "V162",
    type: "VPS",
    series: "Cloud VPS Plus",
    cpuCores: 12,
    isDedicatedCpu: false,
    ramMb: 32768,
    diskGb: 600,
    diskType: "NVMe",
    bandwidthMbps: 1000,
    monthlyPriceEur: 29.50,
    monthlyPriceIdr: 4500000,
    description: "12 vCPU, 32 GB RAM, 600 GB NVMe (Massive Read/Write Engine)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-plus-16": {
    id: "vps-plus-16",
    name: "Cloud VPS Plus 16",
    productId: "V163",
    type: "VPS",
    series: "Cloud VPS Plus",
    cpuCores: 16,
    isDedicatedCpu: false,
    ramMb: 49152,
    diskGb: 750,
    diskType: "NVMe",
    bandwidthMbps: 1000,
    monthlyPriceEur: 42.50,
    monthlyPriceIdr: 6200000,
    description: "16 vCPU, 48 GB RAM, 750 GB NVMe (Extreme Throughput)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },
  "vps-plus-18": {
    id: "vps-plus-18",
    name: "Cloud VPS Plus 18",
    productId: "V164",
    type: "VPS",
    series: "Cloud VPS Plus",
    cpuCores: 18,
    isDedicatedCpu: false,
    ramMb: 65536,
    diskGb: 900,
    diskType: "NVMe",
    bandwidthMbps: 1000,
    monthlyPriceEur: 59.50,
    monthlyPriceIdr: 8000000,
    description: "18 vCPU, 64 GB RAM, 900 GB NVMe (Top-tier High IOPS)",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "US-west", "UK", "JPN", "AUS"],
  },

  // ─── 3. VPS Storage Series (Large Media & Archive: 15jt - 58jt / thn) ───
  "vps-storage-10": {
    id: "vps-storage-10",
    name: "VPS 10 Storage",
    productId: "V93",
    type: "Storage",
    series: "VPS Storage",
    cpuCores: 4,
    isDedicatedCpu: false,
    ramMb: 8192,
    diskGb: 300,
    diskType: "SSD",
    bandwidthMbps: 200,
    monthlyPriceEur: 7.50,
    monthlyPriceIdr: 1500000,
    description: "4 vCPU, 8 GB RAM, 300 GB SSD (Document & Media Storage)",
    regions: ["EU (Germany)", "US-central", "SIN (Singapore)"],
  },
  "vps-storage-20": {
    id: "vps-storage-20",
    name: "VPS 20 Storage",
    productId: "V94",
    type: "Storage",
    series: "VPS Storage",
    cpuCores: 6,
    isDedicatedCpu: false,
    ramMb: 16384,
    diskGb: 600,
    diskType: "SSD",
    bandwidthMbps: 400,
    monthlyPriceEur: 13.50,
    monthlyPriceIdr: 2400000,
    description: "6 vCPU, 16 GB RAM, 600 GB SSD (High Content Archiving)",
    regions: ["EU (Germany)", "US-central", "SIN (Singapore)"],
  },
  "vps-storage-30": {
    id: "vps-storage-30",
    name: "VPS 30 Storage",
    productId: "V95",
    type: "Storage",
    series: "VPS Storage",
    cpuCores: 8,
    isDedicatedCpu: false,
    ramMb: 24576,
    diskGb: 900,
    diskType: "SSD",
    bandwidthMbps: 600,
    monthlyPriceEur: 22.50,
    monthlyPriceIdr: 3500000,
    description: "8 vCPU, 24 GB RAM, 900 GB SSD (Big Data Portal Storage)",
    regions: ["EU (Germany)", "US-central", "SIN (Singapore)"],
  },
  "vps-storage-40": {
    id: "vps-storage-40",
    name: "VPS 40 Storage",
    productId: "V96",
    type: "Storage",
    series: "VPS Storage",
    cpuCores: 10,
    isDedicatedCpu: false,
    ramMb: 32768,
    diskGb: 1200,
    diskType: "SSD",
    bandwidthMbps: 800,
    monthlyPriceEur: 32.50,
    monthlyPriceIdr: 4600000,
    description: "10 vCPU, 32 GB RAM, 1.2 TB SSD (Enterprise Backup & Storage)",
    regions: ["EU (Germany)", "US-central", "SIN (Singapore)"],
  },
  "vps-storage-50": {
    id: "vps-storage-50",
    name: "VPS 50 Storage",
    productId: "V97",
    type: "Storage",
    series: "VPS Storage",
    cpuCores: 12,
    isDedicatedCpu: false,
    ramMb: 49152,
    diskGb: 1500,
    diskType: "SSD",
    bandwidthMbps: 1000,
    monthlyPriceEur: 42.50,
    monthlyPriceIdr: 5800000,
    description: "12 vCPU, 48 GB RAM, 1.5 TB SSD (Massive Archive Storage)",
    regions: ["EU (Germany)", "US-central", "SIN (Singapore)"],
  },

  // ─── 4. Cloud VDS Series (100% Dedicated Physical Cores: 100jt - 250jt / thn) ───
  "vds-s": {
    id: "vds-s",
    name: "Cloud VDS S (Dedicated CPU)",
    productId: "V8",
    type: "VDS",
    series: "Cloud VDS",
    cpuCores: 3,
    isDedicatedCpu: true,
    ramMb: 24576,
    diskGb: 180,
    diskType: "NVMe",
    bandwidthMbps: 250,
    monthlyPriceEur: 37.00,
    monthlyPriceIdr: 10000000,
    description: "3 Dedicated Physical Cores (No Noisy Neighbor), 24 GB RAM, 180 GB NVMe, 250 Mbps",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "UK"],
  },
  "vds-m": {
    id: "vds-m",
    name: "Cloud VDS M (Dedicated CPU)",
    productId: "V9",
    type: "VDS",
    series: "Cloud VDS",
    cpuCores: 4,
    isDedicatedCpu: true,
    ramMb: 32768,
    diskGb: 240,
    diskType: "NVMe",
    bandwidthMbps: 500,
    monthlyPriceEur: 49.00,
    monthlyPriceIdr: 13500000,
    description: "4 Dedicated Physical Cores (100% CPU lock), 32 GB RAM, 240 GB NVMe, 500 Mbps",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "UK"],
  },
  "vds-l": {
    id: "vds-l",
    name: "Cloud VDS L (Dedicated CPU)",
    productId: "V10",
    type: "VDS",
    series: "Cloud VDS",
    cpuCores: 6,
    isDedicatedCpu: true,
    ramMb: 49152,
    diskGb: 360,
    diskType: "NVMe",
    bandwidthMbps: 750,
    monthlyPriceEur: 69.00,
    monthlyPriceIdr: 17500000,
    description: "6 Dedicated Physical Cores, 48 GB RAM, 360 GB NVMe, 750 Mbps Port",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "UK"],
  },
  "vds-xl": {
    id: "vds-xl",
    name: "Cloud VDS XL (Dedicated CPU)",
    productId: "V11",
    type: "VDS",
    series: "Cloud VDS",
    cpuCores: 8,
    isDedicatedCpu: true,
    ramMb: 65536,
    diskGb: 480,
    diskType: "NVMe",
    bandwidthMbps: 1000,
    monthlyPriceEur: 89.00,
    monthlyPriceIdr: 21500000,
    description: "8 Dedicated Physical Cores, 64 GB RAM, 480 GB NVMe, 1 Gbps Port",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "UK"],
  },
  "vds-xxl": {
    id: "vds-xxl",
    name: "Cloud VDS XXL (Dedicated CPU)",
    productId: "V16",
    type: "VDS",
    series: "Cloud VDS",
    cpuCores: 12,
    isDedicatedCpu: true,
    ramMb: 98304,
    diskGb: 720,
    diskType: "NVMe",
    bandwidthMbps: 1000,
    monthlyPriceEur: 149.00,
    monthlyPriceIdr: 25000000,
    description: "12 Dedicated Physical Cores, 96 GB RAM, 720 GB NVMe, 1 Gbps Port",
    regions: ["EU (Germany)", "SIN (Singapore)", "US-central", "US-east", "UK"],
  },
}

// Backward-compatibility aliases
CONTABO_PLANS["vps-s"] = CONTABO_PLANS["vps-plus-4"]
CONTABO_PLANS["vps-m"] = CONTABO_PLANS["vps-plus-6"]
CONTABO_PLANS["vps-l"] = CONTABO_PLANS["vps-plus-8"]
CONTABO_PLANS["vps-xl"] = CONTABO_PLANS["vps-plus-12"]
CONTABO_PLANS["vps-xxl"] = CONTABO_PLANS["vps-plus-18"]

/**
 * Get full list of available Contabo VPS & VDS plans
 */
export function getContaboPlansList(): ContaboPlanDefinition[] {
  return Object.values(CONTABO_PLANS)
}

/**
 * Standard Available Contabo Regions
 */
export interface ContaboRegionOption {
  id: string
  name: string
  code: string
  flag: string
  isDefault?: boolean
}

export const CONTABO_REGIONS: ContaboRegionOption[] = [
  { id: "SIN", code: "SIN", name: "Singapore (Asia Pacific)", flag: "🇸🇬", isDefault: true },
  { id: "JPN", code: "JPN", name: "Tokyo (Japan / East Asia)", flag: "🇯🇵" },
  { id: "EU", code: "EU", name: "Frankfurt (Germany / Europe)", flag: "🇩🇪" },
  { id: "US-central", code: "US-central", name: "St. Louis (US Central)", flag: "🇺🇸" },
  { id: "US-east", code: "US-east", name: "New York (US East)", flag: "🇺🇸" },
  { id: "US-west", code: "US-west", name: "Seattle (US West)", flag: "🇺🇸" },
  { id: "UK", code: "UK", name: "London (United Kingdom)", flag: "🇬🇧" },
  { id: "AUS", code: "AUS", name: "Sydney (Australia)", flag: "🇦🇺" },
]

export const DEFAULT_CONTABO_REGION = "SIN"
export const DEFAULT_CONTABO_IMAGE = "ubuntu-24.04"

export const CONTABO_STANDARD_IMAGES: Record<string, string> = {
  'ubuntu-24.04': 'd64d5c6c-9dda-4e38-8174-0ee282474d8a',
  'ubuntu-22.04': 'afecbb85-e2fc-46f0-9684-b46b1faf00bb',
  'ubuntu-20.04': '7445024d-c44f-4f8a-a6c6-f5913274cb13',
  'debian-12': '4efbc0ba-2313-4fe1-842a-516f8652e729',
  'debian-11': '66abf39a-ba8b-425e-a385-8eb347ceac10',
}

export interface ContaboConfig {
  clientId: string
  clientSecret: string
  apiUser: string
  apiPassword: string
  authUrl: string
  apiUrl: string
  baseApiUrl: string
}

export interface CreateInstanceParams {
  displayName: string
  userData: string // Cloud-init script
  productId?: string // e.g. "V153" for Cloud VPS 4
  region?: string // "SIN", "JPN", "EU", "US-central", etc. Default "SIN" (Asia)
  imageId?: string // "ubuntu-24.04" (Default)
  period?: number // 1 month
}

export interface ContaboInstanceResponse {
  instanceId: string | number
  name: string
  status: string
  ipv4: string
  ipv6?: string
  cpuCores: number
  ramMb: number
  diskGb: number
  region: string
}

// ─── Contabo Cloud Firewall Types & Models ───

export interface ContaboFirewallRule {
  protocol: 'tcp' | 'udp' | 'icmp' | ''
  destPorts: string[]
  srcCidr: {
    ipv4?: string[]
    ipv6?: string[]
  }
  action: 'accept' | 'drop'
  status: 'active' | 'inactive'
  displayName?: string
}

export interface CreateFirewallParams {
  name: string
  description?: string
  status?: 'active' | 'inactive'
  rules: ContaboFirewallRule[]
}

export interface ContaboFirewallResponse {
  firewallId: string
  name: string
  description?: string
  status: string
  rules?: {
    inbound: ContaboFirewallRule[]
  }
  createdDate?: string
  updatedDate?: string
}

let cachedToken: { token: string; expiresAt: number } | null = null

function getContaboCredentials(): ContaboConfig {
  const baseApiUrl = process.env.CONTABO_BASE_API_URL || 'https://api.contabo.com/v1'
  return {
    clientId: process.env.CONTABO_CLIENT_ID || '',
    clientSecret: process.env.CONTABO_CLIENT_SECRET || '',
    apiUser: process.env.CONTABO_API_USER || '',
    apiPassword: process.env.CONTABO_API_PASSWORD || '',
    authUrl: process.env.CONTABO_AUTH_URL || 'https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token',
    apiUrl: process.env.CONTABO_API_URL || `${baseApiUrl}/compute/instances`,
    baseApiUrl,
  }
}

/**
 * Check if live Contabo credentials are configured
 */
export function isContaboConfigured(): boolean {
  const creds = getContaboCredentials()
  return !!(creds.clientId && creds.clientSecret && creds.apiUser && creds.apiPassword)
}

/**
 * Retrieve or refresh Contabo OAuth2 access token with Upstash Redis cache (TTL 25m) and in-memory fallback.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now()
  const creds = getContaboCredentials()

  if (!isContaboConfigured()) {
    throw new Error('Contabo API credentials are not configured in environment variables.')
  }

  // 1. Try Redis cache first (if available)
  const redis = getRedis()
  const redisKey = `contabo:oauth_token:${creds.clientId}`
  
  if (redis) {
    try {
      const cached = await redis.get<string>(redisKey)
      if (cached) {
        return cached
      }
    } catch (err) {
      console.warn('[Contabo API] Redis token read error, falling back to in-memory cache:', err)
    }
  }

  // 2. Fallback to in-memory cache
  if (cachedToken && cachedToken.expiresAt > now + 30000) {
    return cachedToken.token
  }

  // 3. Fetch new token from Contabo OAuth2 Server
  const bodyParams = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    username: creds.apiUser,
    password: creds.apiPassword,
    grant_type: 'password',
  })

  const res = await fetch(creds.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Contabo OAuth2 authentication failed (${res.status}): ${errText}`)
  }

  const data = await res.json()
  const token = data.access_token as string
  const expiresInSeconds = Number(data.expires_in) || 300

  // Update in-memory cache
  cachedToken = {
    token,
    expiresAt: now + expiresInSeconds * 1000,
  }

  // Update Redis cache (with safety margin: expire 30s before token expiration, max 25 mins)
  if (redis) {
    try {
      const ttl = Math.max(60, Math.min(expiresInSeconds - 30, 1500))
      await redis.set(redisKey, token, { ex: ttl })
    } catch (err) {
      console.warn('[Contabo API] Redis token write error:', err)
    }
  }

  return token
}

function getRequestHeaders(token: string) {
  const requestId = crypto.randomUUID()
  return {
    Authorization: `Bearer ${token}`,
    'x-request-id': requestId,
    'x-trace-id': requestId,
    'Content-Type': 'application/json',
  }
}

// ══════════════════════════════════════════════════════════════════════
// ─── COMPUTE INSTANCES API (Contabo openapi.json: /v1/compute/*) ───
// ══════════════════════════════════════════════════════════════════════

export type ContaboInstanceKind = "VPS" | "VDS" | "Storage"

export interface ContaboInstanceListItem {
  instanceId: string
  name: string
  displayName: string
  status: string
  ipv4: string
  ipv6: string
  region: string
  regionName: string
  productId: string
  productName: string
  /** Derived VPS / VDS / Storage bucket — from productId (authoritative,
   *  via CONTABO_PLANS) with a productName heuristic fallback for plans we
   *  don't have a definition for (older/legacy Contabo products). */
  kind: ContaboInstanceKind
  cpuCores: number
  ramMb: number
  diskGb: number
  createdDate: string | null
}

/** productId → VPS/VDS/Storage, built once from the plan catalogue. */
const CONTABO_PRODUCT_TYPE_BY_ID: Record<string, ContaboInstanceKind> = Object.values(CONTABO_PLANS).reduce(
  (acc, plan) => {
    acc[plan.productId] = plan.type
    return acc
  },
  {} as Record<string, ContaboInstanceKind>,
)

function deriveContaboKind(productId?: string, productName?: string): ContaboInstanceKind {
  if (productId && CONTABO_PRODUCT_TYPE_BY_ID[productId]) return CONTABO_PRODUCT_TYPE_BY_ID[productId]
  const haystack = `${productName || ""}`.toLowerCase()
  if (haystack.includes("vds")) return "VDS"
  if (haystack.includes("storage")) return "Storage"
  return "VPS"
}

/**
 * List every compute instance on the Contabo account (all pages), normalised
 * and bucketed into VPS / VDS / Storage. Read-only; used by the admin
 * infrastructure dashboard to show the full provider-side picture, not just
 * the instances SaCMS provisioned itself.
 *
 * Returns an empty array (never throws) when Contabo isn't configured or the
 * API call fails — the caller surfaces "not configured" / "unavailable"
 * separately via isContaboConfigured().
 */
export async function listContaboInstances(): Promise<ContaboInstanceListItem[]> {
  if (!isContaboConfigured()) return []

  try {
    const token = await getAccessToken()
    const creds = getContaboCredentials()
    const items: ContaboInstanceListItem[] = []
    let page = 1
    const size = 100

    // Hard cap at 20 pages (2000 instances) so a malformed pagination
    // response can't spin this forever.
    while (page <= 20) {
      const res = await fetch(`${creds.apiUrl}?page=${page}&size=${size}`, {
        method: "GET",
        headers: getRequestHeaders(token),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        console.warn(`[Contabo API] listContaboInstances page ${page} failed (${res.status}): ${errText}`)
        break
      }
      const body = await res.json()
      const data: any[] = Array.isArray(body?.data) ? body.data : []
      for (const inst of data) {
        const productId = inst.productId || ""
        const productName = inst.productName || inst.productType || ""
        items.push({
          instanceId: String(inst.instanceId ?? inst.id ?? ""),
          name: inst.name || inst.displayName || `instance-${inst.instanceId}`,
          displayName: inst.displayName || inst.name || "",
          status: inst.status || "unknown",
          ipv4: inst.ipConfig?.v4?.ip || inst.ipv4 || "",
          ipv6: inst.ipConfig?.v6?.ip || inst.ipv6 || "",
          region: inst.region || "",
          regionName: inst.regionName || inst.region || "",
          productId,
          productName: productName || productId,
          kind: deriveContaboKind(productId, productName),
          cpuCores: inst.cpuCores || 0,
          ramMb: inst.ramMb || 0,
          diskGb: inst.diskMb ? Math.round(inst.diskMb / 1024) : 0,
          createdDate: inst.createdDate || null,
        })
      }

      const totalPages = Number(body?._pagination?.totalPages ?? body?.pagination?.totalPages ?? 1)
      if (!Number.isFinite(totalPages) || page >= totalPages || data.length === 0) break
      page += 1
    }

    return items
  } catch (err: any) {
    console.warn("[Contabo API] listContaboInstances error:", err?.message || err)
    return []
  }
}

/**
 * Order & Create a new VPS instance on Contabo
 */
export async function createContaboInstance(params: CreateInstanceParams): Promise<ContaboInstanceResponse> {
  // If not configured (e.g. local dev / test), return a deterministic simulated instance
  if (!isContaboConfigured()) {
    if (!isMockAllowed("contabo", false)) requireCredentialOutsideMock("contabo", "CONTABO_CLIENT_ID / CONTABO_CLIENT_SECRET / CONTABO_API_USER / CONTABO_API_PASSWORD")
    console.warn('[Contabo API] Running in SIMULATION mode (missing credentials).')
    const mockId = Math.floor(100000 + Math.random() * 900000)
    const mockIp = `161.97.${Math.floor(Math.random() * 250)}.${Math.floor(1 + Math.random() * 250)}`
    const planObj = Object.values(CONTABO_PLANS).find(p => p.productId === params.productId || p.id === params.productId)
    return {
      instanceId: `sim-${mockId}`,
      name: params.displayName,
      status: 'provisioning',
      ipv4: mockIp,
      cpuCores: planObj ? planObj.cpuCores : 4,
      ramMb: planObj ? planObj.ramMb : 8192,
      diskGb: planObj ? planObj.diskGb : 75,
      region: params.region || DEFAULT_CONTABO_REGION,
    }
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const resolvedImageId =
    (params.imageId && CONTABO_STANDARD_IMAGES[params.imageId.toLowerCase()]) ||
    params.imageId ||
    CONTABO_STANDARD_IMAGES[DEFAULT_CONTABO_IMAGE]

  const sanitizedDisplayName = (params.displayName || 'sacms-vps')
    .replace(/[^a-zA-Z0-9 -]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 255)

  const payload = {
    imageId: resolvedImageId,
    productId: params.productId || 'V153', // Default to Cloud VPS 4 (V153)
    region: params.region || DEFAULT_CONTABO_REGION,
    period: params.period || 1,
    displayName: sanitizedDisplayName,
    userData: Buffer.from(params.userData).toString('base64'),
  }

  const res = await fetch(creds.apiUrl, {
    method: 'POST',
    headers: getRequestHeaders(token),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Contabo instance creation failed (${res.status}): ${errText}`)
  }

  const result = await res.json()
  const instance = result.data?.[0] || result.data || result

  return {
    instanceId: instance.instanceId || instance.id,
    name: instance.displayName || instance.name || params.displayName,
    status: instance.status || 'provisioning',
    ipv4: instance.ipConfig?.v4?.ip || instance.ipv4 || '',
    ipv6: instance.ipConfig?.v6?.ip || instance.ipv6 || '',
    cpuCores: instance.cpuCores || 4,
    ramMb: instance.ramMb || 8192,
    diskGb: Math.round((instance.diskMb || 76800) / 1024),
    region: instance.region || params.region || DEFAULT_CONTABO_REGION,
  }
}

/**
 * Fetch instance details and IP status from Contabo
 */
export async function getContaboInstance(instanceId: string | number): Promise<ContaboInstanceResponse> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return {
      instanceId,
      name: 'Simulated VPS',
      status: 'ok',
      ipv4: '127.0.0.1',
      cpuCores: 4,
      ramMb: 8192,
      diskGb: 75,
      region: DEFAULT_CONTABO_REGION,
    }
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.apiUrl}/${instanceId}`, {
    method: 'GET',
    headers: getRequestHeaders(token),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to fetch Contabo instance ${instanceId} (${res.status}): ${errText}`)
  }

  const result = await res.json()
  const instance = result.data?.[0] || result.data || result

  return {
    instanceId: instance.instanceId || instance.id,
    name: instance.displayName || instance.name,
    status: instance.status || 'unknown',
    ipv4: instance.ipConfig?.v4?.ip || instance.ipv4 || '',
    ipv6: instance.ipConfig?.v6?.ip || instance.ipv6 || '',
    cpuCores: instance.cpuCores || 4,
    ramMb: instance.ramMb || 8192,
    diskGb: Math.round((instance.diskMb || 76800) / 1024),
    region: instance.region || DEFAULT_CONTABO_REGION,
  }
}

export interface ContaboInstanceDetail {
  instanceId: string
  name: string
  displayName: string
  status: string
  productId: string
  productName: string
  imageId: string
  region: string
  regionName: string
  ipv4: string
  ipv6: string
  cpuCores: number
  ramMb: number
  diskGb: number
  osType: string
  defaultUser: string
  sshKeyCount: number
  dataCenter: string
  createdDate: string | null
  cancelDate: string | null
}

/**
 * Fetch the full detail record for one instance (richer than
 * getContaboInstance) — used by the admin management panel.
 */
export async function getContaboInstanceDetail(instanceId: string | number): Promise<ContaboInstanceDetail | null> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return {
      instanceId: String(instanceId),
      name: 'Simulated VPS',
      displayName: 'Simulated VPS',
      status: 'running',
      productId: 'V153',
      productName: 'Cloud VPS 4 SSD',
      imageId: CONTABO_STANDARD_IMAGES[DEFAULT_CONTABO_IMAGE],
      region: DEFAULT_CONTABO_REGION,
      regionName: 'Singapore',
      ipv4: '127.0.0.1',
      ipv6: '',
      cpuCores: 4,
      ramMb: 8192,
      diskGb: 75,
      osType: 'Linux',
      defaultUser: 'root',
      sshKeyCount: 0,
      dataCenter: 'SIN-1',
      createdDate: new Date().toISOString(),
      cancelDate: null,
    }
  }

  if (!isContaboConfigured()) return null

  try {
    const token = await getAccessToken()
    const creds = getContaboCredentials()
    const res = await fetch(`${creds.apiUrl}/${instanceId}`, { method: 'GET', headers: getRequestHeaders(token) })
    if (!res.ok) return null
    const result = await res.json()
    const i = result.data?.[0] || result.data || result
    return {
      instanceId: String(i.instanceId ?? i.id ?? instanceId),
      name: i.name || i.displayName || '',
      displayName: i.displayName || i.name || '',
      status: i.status || 'unknown',
      productId: i.productId || '',
      productName: i.productName || i.productType || i.productId || '',
      imageId: i.imageId || '',
      region: i.region || '',
      regionName: i.regionName || i.region || '',
      ipv4: i.ipConfig?.v4?.ip || i.ipv4 || '',
      ipv6: i.ipConfig?.v6?.ip || i.ipv6 || '',
      cpuCores: i.cpuCores || 0,
      ramMb: i.ramMb || 0,
      diskGb: i.diskMb ? Math.round(i.diskMb / 1024) : 0,
      osType: i.osType || '',
      defaultUser: i.defaultUser || 'root',
      sshKeyCount: Array.isArray(i.sshKeys) ? i.sshKeys.length : 0,
      dataCenter: i.dataCenter || '',
      createdDate: i.createdDate || null,
      cancelDate: i.cancelDate || null,
    }
  } catch (err: any) {
    console.warn(`[Contabo API] getContaboInstanceDetail(${instanceId}) failed:`, err?.message || err)
    return null
  }
}

/**
 * Graceful ACPI shutdown (vs. stopContaboInstance's hard power-off).
 */
export async function shutdownContaboInstance(instanceId: string | number): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) return true
  const token = await getAccessToken()
  const creds = getContaboCredentials()
  const res = await fetch(`${creds.apiUrl}/${instanceId}/actions/shutdown`, {
    method: 'POST',
    headers: getRequestHeaders(token),
  })
  return res.ok
}

/**
 * Rename an instance's display name (PATCH — does not touch the OS).
 */
export async function updateContaboInstanceName(instanceId: string | number, displayName: string): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) return true
  const token = await getAccessToken()
  const creds = getContaboCredentials()
  const res = await fetch(`${creds.apiUrl}/${instanceId}`, {
    method: 'PATCH',
    headers: getRequestHeaders(token),
    body: JSON.stringify({ displayName: displayName.slice(0, 255) }),
  })
  return res.ok
}

/**
 * Reinstall the OS on an instance (PUT). DESTRUCTIVE — wipes all data on the
 * instance's disk. `imageId` is a Contabo image UUID (see
 * CONTABO_STANDARD_IMAGES).
 */
export async function reinstallContaboInstance(
  instanceId: string | number,
  imageId: string,
  opts: { userData?: string; rootPassword?: number; sshKeys?: number[]; defaultUser?: string } = {},
): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) return true
  const token = await getAccessToken()
  const creds = getContaboCredentials()
  const payload: Record<string, unknown> = { imageId }
  if (opts.userData) payload.userData = Buffer.from(opts.userData).toString('base64')
  if (opts.rootPassword) payload.rootPassword = opts.rootPassword
  if (opts.sshKeys?.length) payload.sshKeys = opts.sshKeys
  if (opts.defaultUser) payload.defaultUser = opts.defaultUser
  const res = await fetch(`${creds.apiUrl}/${instanceId}`, {
    method: 'PUT',
    headers: getRequestHeaders(token),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Contabo reinstall failed for instance ${instanceId} (${res.status}): ${errText}`)
  }
  return res.ok
}

/**
 * Restart a Contabo VPS instance
 */
export async function restartContaboInstance(instanceId: string | number): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.apiUrl}/${instanceId}/actions/restart`, {
    method: 'POST',
    headers: getRequestHeaders(token),
  })

  return res.ok
}

/**
 * Start a stopped Contabo VPS instance
 */
export async function startContaboInstance(instanceId: string | number): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.apiUrl}/${instanceId}/actions/start`, {
    method: 'POST',
    headers: getRequestHeaders(token),
  })

  return res.ok
}

/**
 * Stop/Suspend a Contabo VPS instance
 */
export async function stopContaboInstance(instanceId: string | number): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.apiUrl}/${instanceId}/actions/stop`, {
    method: 'POST',
    headers: getRequestHeaders(token),
  })

  return res.ok
}

/**
 * Terminate/Delete a Contabo VPS instance
 */
export async function deleteContaboInstance(instanceId: string | number): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.apiUrl}/${instanceId}`, {
    method: 'DELETE',
    headers: getRequestHeaders(token),
  })

  return res.ok
}

// ══════════════════════════════════════════════════════════════════════
// ─── CLOUD FIREWALL API (Contabo openapi.json: /v1/firewalls/*) ─────
// ══════════════════════════════════════════════════════════════════════

/**
 * Build standard SaCMS hardened firewall rules:
 * 1. Port 5432 (PostgreSQL): Whitelisted only for SaCMS server IP addresses.
 * 2. Ports 443 & 80 (HTTPS/HTTP): Open for Caddy / Media reverse proxy.
 * 3. Port 22 (SSH): Restricted to management IPs (or localhost if none provided).
 */
export function buildSacmsDefaultFirewallRules(allowedManagementIps: string[] = []): ContaboFirewallRule[] {
  const sacmsServerIps = (process.env.SACMS_SERVER_IPS || process.env.SERVER_IPV4 || '')
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean)

  const managementIpv4s = Array.from(new Set([...sacmsServerIps, ...allowedManagementIps]))
  
  const postgresSrcIps = managementIpv4s.length > 0 
    ? managementIpv4s.map(ip => ip.includes('/') ? ip : `${ip}/32`)
    : ['127.0.0.1/32']

  return [
    // 1. PostgreSQL 5432 — Strict SaCMS Whitelist
    {
      protocol: 'tcp',
      destPorts: ['5432'],
      srcCidr: {
        ipv4: postgresSrcIps,
      },
      action: 'accept',
      status: 'active',
      displayName: 'Allow PostgreSQL from SaCMS App Servers',
    },
    // 2. HTTPS & HTTP (443, 80) — Public Web & Media CDN
    {
      protocol: 'tcp',
      destPorts: ['80', '443'],
      srcCidr: {
        ipv4: ['AnyIPv4'],
        ipv6: ['AnyIPv6'],
      },
      action: 'accept',
      status: 'active',
      displayName: 'Allow HTTPS & HTTP for Caddy Reverse Proxy',
    },
    // 3. SSH (22) — Restricted to SaCMS Management
    {
      protocol: 'tcp',
      destPorts: ['22'],
      srcCidr: {
        ipv4: postgresSrcIps,
      },
      action: 'accept',
      status: 'active',
      displayName: 'Allow SSH Management from SaCMS',
    },
  ]
}

/**
 * Create a new Cloud Firewall in Contabo
 */
export async function createContaboFirewall(params: CreateFirewallParams): Promise<ContaboFirewallResponse> {
  if (!isContaboConfigured()) {
    if (!isMockAllowed("contabo", false)) requireCredentialOutsideMock("contabo", "CONTABO_CLIENT_ID / CONTABO_CLIENT_SECRET / CONTABO_API_USER / CONTABO_API_PASSWORD")
    console.warn('[Contabo API] createContaboFirewall running in SIMULATION mode.')
    return {
      firewallId: `sim-fw-${Math.floor(10000 + Math.random() * 90000)}`,
      name: params.name,
      description: params.description,
      status: params.status || 'active',
      rules: { inbound: params.rules },
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    }
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const payload = {
    name: params.name,
    description: params.description || 'Managed Cloud Firewall for SaCMS Dedicated Instance',
    status: params.status || 'active',
    rules: {
      inbound: params.rules,
    },
  }

  const res = await fetch(`${creds.baseApiUrl}/firewalls`, {
    method: 'POST',
    headers: getRequestHeaders(token),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Contabo firewall creation failed (${res.status}): ${errText}`)
  }

  const result = await res.json()
  const fw = result.data?.[0] || result.data || result

  return {
    firewallId: fw.firewallId || fw.id,
    name: fw.name,
    description: fw.description,
    status: fw.status || 'active',
    rules: fw.rules,
    createdDate: fw.createdDate,
    updatedDate: fw.updatedDate,
  }
}

/**
 * List all Cloud Firewalls in Contabo
 */
export async function listContaboFirewalls(nameFilter?: string): Promise<ContaboFirewallResponse[]> {
  if (!isContaboConfigured()) {
    if (!isMockAllowed("contabo", false)) requireCredentialOutsideMock("contabo", "CONTABO_CLIENT_ID / CONTABO_CLIENT_SECRET / CONTABO_API_USER / CONTABO_API_PASSWORD")
    return [
      {
        firewallId: 'sim-fw-default',
        name: nameFilter || 'sacms-default-firewall',
        description: 'Simulated SaCMS Firewall',
        status: 'active',
      }
    ]
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const url = new URL(`${creds.baseApiUrl}/firewalls`)
  if (nameFilter) {
    url.searchParams.set('name', nameFilter)
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: getRequestHeaders(token),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to list Contabo firewalls (${res.status}): ${errText}`)
  }

  const result = await res.json()
  const data = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])

  return data.map((fw: any) => ({
    firewallId: fw.firewallId || fw.id,
    name: fw.name,
    description: fw.description,
    status: fw.status,
    rules: fw.rules,
    createdDate: fw.createdDate,
    updatedDate: fw.updatedDate,
  }))
}

/**
 * Retrieve firewall details by ID
 */
export async function getContaboFirewall(firewallId: string): Promise<ContaboFirewallResponse> {
  if (firewallId.startsWith('sim-')) {
    return {
      firewallId,
      name: 'Simulated Firewall',
      status: 'active',
    }
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.baseApiUrl}/firewalls/${firewallId}`, {
    method: 'GET',
    headers: getRequestHeaders(token),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to get Contabo firewall ${firewallId} (${res.status}): ${errText}`)
  }

  const result = await res.json()
  const fw = result.data?.[0] || result.data || result

  return {
    firewallId: fw.firewallId || fw.id,
    name: fw.name,
    description: fw.description,
    status: fw.status,
    rules: fw.rules,
    createdDate: fw.createdDate,
    updatedDate: fw.updatedDate,
  }
}

/**
 * Assign a Cloud Firewall to a Compute Instance (POST /v1/firewalls/{firewallId}/instances/{instanceId})
 */
export async function assignFirewallToInstance(
  firewallId: string,
  instanceId: string | number
): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.baseApiUrl}/firewalls/${firewallId}/instances/${instanceId}`, {
    method: 'POST',
    headers: getRequestHeaders(token),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[Contabo API] Failed to assign firewall ${firewallId} to instance ${instanceId}:`, errText)
    throw new Error(`Failed to assign Contabo firewall to instance (${res.status}): ${errText}`)
  }

  return res.ok
}

/**
 * Remove a Cloud Firewall from a Compute Instance (DELETE /v1/firewalls/{firewallId}/instances/{instanceId})
 */
export async function removeFirewallFromInstance(
  firewallId: string,
  instanceId: string | number
): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.baseApiUrl}/firewalls/${firewallId}/instances/${instanceId}`, {
    method: 'DELETE',
    headers: getRequestHeaders(token),
  })

  return res.ok
}

/**
 * Delete a Cloud Firewall
 */
export async function deleteContaboFirewall(firewallId: string): Promise<boolean> {
  if (firewallId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.baseApiUrl}/firewalls/${firewallId}`, {
    method: 'DELETE',
    headers: getRequestHeaders(token),
  })

  return res.ok
}

/**
 * Helper to find an existing SaCMS default firewall or create a new one automatically
 */
export async function findOrCreateSacmsFirewall(
  name: string = 'sacms-enterprise-firewall',
  allowedManagementIps: string[] = []
): Promise<string> {
  try {
    const existing = await listContaboFirewalls()
    const matched = existing.find(f => f.name === name)
    if (matched && matched.firewallId) {
      return matched.firewallId
    }
  } catch (err) {
    console.warn('[Contabo API] listFirewalls error in findOrCreate, attempting creation:', err)
  }

  try {
    const rules = buildSacmsDefaultFirewallRules(allowedManagementIps)
    const created = await createContaboFirewall({
      name,
      description: 'Automated hardened firewall rule for SaCMS dedicated instances',
      status: 'active',
      rules,
    })
    return created.firewallId
  } catch (err: any) {
    // If conflict (e.g. 409 already exists), try to find the existing firewall ID
    if (err?.message?.includes('409') || err?.message?.includes('not unique')) {
      const allFirewalls = await listContaboFirewalls().catch(() => [])
      const matched = allFirewalls.find(f => f.name === name)
      if (matched && matched.firewallId) {
        return matched.firewallId
      }
    }
    throw err
  }
}

// ══════════════════════════════════════════════════════════════════════
// ─── SNAPSHOTS & DISASTER RECOVERY (openapi.json: /v1/compute/instances/{id}/snapshots) ───
// ══════════════════════════════════════════════════════════════════════

export interface ContaboSnapshotResponse {
  snapshotId: string
  name: string
  description?: string
  instanceId: string | number
  createdDate?: string
  autoDeleteDate?: string
  imageId?: string
}

/**
 * Create a new Snapshot for a VPS/VDS instance
 */
export async function createContaboSnapshot(
  instanceId: string | number,
  name: string,
  description?: string
): Promise<ContaboSnapshotResponse> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    const mockSnapId = `snap-${Date.now()}`
    return {
      snapshotId: mockSnapId,
      name,
      description: description || 'Simulated snapshot',
      instanceId,
      createdDate: new Date().toISOString(),
    }
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const payload = {
    name,
    description: description || `SaCMS Automated Snapshot for instance ${instanceId}`,
  }

  const res = await fetch(`${creds.baseApiUrl}/compute/instances/${instanceId}/snapshots`, {
    method: 'POST',
    headers: getRequestHeaders(token),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to create Contabo snapshot on instance ${instanceId} (${res.status}): ${errText}`)
  }

  const result = await res.json()
  const snap = result.data?.[0] || result.data || result

  return {
    snapshotId: snap.snapshotId || snap.id,
    name: snap.name || name,
    description: snap.description || description,
    instanceId: snap.instanceId || instanceId,
    createdDate: snap.createdDate || new Date().toISOString(),
    autoDeleteDate: snap.autoDeleteDate,
    imageId: snap.imageId,
  }
}

/**
 * List all snapshots for an instance
 */
export async function listContaboSnapshots(
  instanceId: string | number
): Promise<ContaboSnapshotResponse[]> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return [
      {
        snapshotId: 'sim-snap-initial',
        name: 'Initial Golden Snapshot',
        description: 'Simulated initial snapshot',
        instanceId,
        createdDate: new Date().toISOString(),
      },
    ]
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.baseApiUrl}/compute/instances/${instanceId}/snapshots`, {
    method: 'GET',
    headers: getRequestHeaders(token),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to list Contabo snapshots for instance ${instanceId} (${res.status}): ${errText}`)
  }

  const result = await res.json()
  const data = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : [])

  return data.map((snap: any) => ({
    snapshotId: snap.snapshotId || snap.id,
    name: snap.name,
    description: snap.description,
    instanceId: snap.instanceId || instanceId,
    createdDate: snap.createdDate,
    autoDeleteDate: snap.autoDeleteDate,
    imageId: snap.imageId,
  }))
}

/**
 * Get snapshot details by ID
 */
export async function getContaboSnapshot(
  instanceId: string | number,
  snapshotId: string
): Promise<ContaboSnapshotResponse> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return {
      snapshotId,
      name: 'Simulated Snapshot',
      instanceId,
      createdDate: new Date().toISOString(),
    }
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.baseApiUrl}/compute/instances/${instanceId}/snapshots/${snapshotId}`, {
    method: 'GET',
    headers: getRequestHeaders(token),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to get Contabo snapshot ${snapshotId} (${res.status}): ${errText}`)
  }

  const result = await res.json()
  const snap = result.data?.[0] || result.data || result

  return {
    snapshotId: snap.snapshotId || snap.id,
    name: snap.name,
    description: snap.description,
    instanceId: snap.instanceId || instanceId,
    createdDate: snap.createdDate,
    autoDeleteDate: snap.autoDeleteDate,
    imageId: snap.imageId,
  }
}

/**
 * 1-Click Rollback: Revert instance state to a specific snapshot
 */
export async function rollbackContaboSnapshot(
  instanceId: string | number,
  snapshotId: string
): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.baseApiUrl}/compute/instances/${instanceId}/snapshots/${snapshotId}/rollback`, {
    method: 'POST',
    headers: getRequestHeaders(token),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Contabo snapshot rollback failed for ${snapshotId} on instance ${instanceId} (${res.status}): ${errText}`)
  }

  return res.ok
}

/**
 * Delete a snapshot from Contabo
 */
export async function deleteContaboSnapshot(
  instanceId: string | number,
  snapshotId: string
): Promise<boolean> {
  if (typeof instanceId === 'string' && instanceId.startsWith('sim-')) {
    return true
  }

  const token = await getAccessToken()
  const creds = getContaboCredentials()

  const res = await fetch(`${creds.baseApiUrl}/compute/instances/${instanceId}/snapshots/${snapshotId}`, {
    method: 'DELETE',
    headers: getRequestHeaders(token),
  })

  return res.ok
}

