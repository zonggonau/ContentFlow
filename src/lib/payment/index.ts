import { registerPaymentProvider, getPaymentProvider, getAvailableProviders } from "./provider"
import { MidtransProvider } from "./midtrans"
import { MockPaymentProvider } from "./mock"
import { isMockAllowed } from "../dev-mode"

export type { PaymentProvider, CreatePaymentRequest, CreatePaymentResult, VerifyWebhookRequest, VerifyWebhookResult, TransactionStatusResult } from "./provider"
export { getPaymentProvider, getAvailableProviders }
export { __mockMarkTransactionPaid } from "./mock"

// ==================== AUTO-REGISTER PROVIDERS ====================
//
// This module-level registration runs once at import time, so it can only
// see synchronous, already-loaded config (env vars) — not the async,
// DB-backed Platform Settings that getResolvedMidtransConfig() also checks.
// A server key set only via the admin Settings UI (not the environment)
// still works correctly at call time against the real provider, but this
// startup check only has the env var to decide whether to register the
// real provider or fall back to the mock.

const hasMidtransCredential = Boolean(process.env.MIDTRANS_SERVER_KEY?.trim())

if (hasMidtransCredential) {
  registerPaymentProvider(new MidtransProvider())
} else if (isMockAllowed("midtrans", hasMidtransCredential)) {
  // Registered under the SAME name ("midtrans") every call site already
  // asks for (directly, or via the PAYMENT_PROVIDER env default) — so no
  // route needs its own mock-specific branch. Never reaches this branch
  // in production (isMockAllowed returns false there), so a production
  // deploy with no credential leaves "midtrans" unregistered and
  // getPaymentProvider() throws loudly instead of taking fake payments.
  console.warn(
    "[payment] MIDTRANS_SERVER_KEY not set — using the mock payment provider. " +
    "This is expected in development/test; it is never used in production."
  )
  registerPaymentProvider(new MockPaymentProvider("midtrans"))
}
