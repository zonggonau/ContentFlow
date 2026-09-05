import type { PlatformSettings } from "./settings"

/**
 * Platform-setting keys that hold real secrets — never safe to return in
 * plaintext to the admin UI's GET response. `midtransClientKey` is
 * deliberately excluded: Midtrans client keys are designed to be public
 * (shipped to the browser for Snap.js), unlike `midtransServerKey`.
 */
export const SECRET_SETTING_KEYS = [
  "platformAiApiKey",
  "deepseekApiKey",
  "openaiApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "v0ApiKey",
  "vercelAccessToken",
  "resendApiKey",
  "smtpPass",
  "midtransServerKey",
  "r2SecretAccessKey",
  "contaboClientSecret",
  "contaboApiPassword",
] as const satisfies readonly (keyof PlatformSettings)[]

export type SecretSettingKey = (typeof SECRET_SETTING_KEYS)[number]

export function isSecretSettingKey(key: string): key is SecretSettingKey {
  return (SECRET_SETTING_KEYS as readonly string[]).includes(key)
}

/** Sentinel the client sees in place of a real secret value that IS set. */
const MASK_PLACEHOLDER = "••••••••"

/**
 * Build the client-safe view of platform settings: every secret key is
 * replaced with a fixed mask placeholder (if set) or left as an empty
 * string (if unset) — the real value never leaves the server in this
 * response. Pair with `isUnchangedSecretValue` on write so saving the form
 * without touching a masked field doesn't overwrite the real value with
 * the placeholder.
 */
export function maskSecretSettings(settings: PlatformSettings): PlatformSettings & Record<string, unknown> {
  const masked: Record<string, unknown> = { ...settings }
  for (const key of SECRET_SETTING_KEYS) {
    const value = settings[key]
    masked[key] = typeof value === "string" && value.length > 0 ? MASK_PLACEHOLDER : ""
  }
  return masked as PlatformSettings & Record<string, unknown>
}

/** True when an incoming PUT value is just the mask echoed back unchanged. */
export function isUnchangedSecretValue(value: unknown): boolean {
  return value === MASK_PLACEHOLDER
}
