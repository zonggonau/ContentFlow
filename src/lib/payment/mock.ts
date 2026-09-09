/**
 * Mock payment provider — exercises the full checkout/webhook/status flow
 * with no real Midtrans (or any other gateway) credential, so the payment
 * test matrix never requires a live, billable subscription.
 *
 * Registered automatically by payment/index.ts only when no real provider
 * credential is configured AND we're outside production (see
 * lib/dev-mode.ts's isMockAllowed) — a misconfigured production deploy
 * still fails loudly instead of silently taking fake payments.
 *
 * Transactions are kept in memory only. A process restart loses all mock
 * state, which is fine — this provider only exists for local dev/tests,
 * never for anything a real user's money touches.
 */

import { createHash, randomUUID } from "crypto"
import type {
  PaymentProvider,
  CreatePaymentRequest,
  CreatePaymentResult,
  VerifyWebhookRequest,
  VerifyWebhookResult,
  TransactionStatusResult,
} from "./provider"

interface MockTransaction {
  orderId: string
  amount: number
  status: TransactionStatusResult["status"]
  paymentType: string
  transactionId: string
}

const mockTransactions = new Map<string, MockTransaction>()

/** Test-only helper: flips a mock transaction to "success" as if the
 *  gateway's webhook had fired — lets integration tests simulate a
 *  completed payment without a real webhook call. Not part of the
 *  PaymentProvider interface; import it directly in test code. */
export function __mockMarkTransactionPaid(orderId: string): void {
  const tx = mockTransactions.get(orderId)
  if (tx) tx.status = "success"
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name: string

  /**
   * @param registerAs The provider name this mock stands in for (e.g.
   *   "midtrans") — every existing call site asks for the real provider's
   *   name directly, so the mock registers under that same name rather
   *   than requiring a mock-specific code path anywhere that calls it.
   */
  constructor(registerAs: string = "mock") {
    this.name = registerAs
  }

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const transactionId = randomUUID()
    mockTransactions.set(req.orderId, {
      orderId: req.orderId,
      amount: req.amount,
      status: "pending",
      paymentType: "mock",
      transactionId,
    })

    // A fabricated Snap-style token/redirect — the mock checkout page
    // (see /dashboard/payment/mock) reads the orderId from this URL to
    // let a developer manually flip the transaction to paid/failed in the
    // UI, mirroring what a real Midtrans Snap popup would let a user do.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    return {
      token: `mock_token_${transactionId}`,
      redirectUrl: `${appUrl}/dashboard/payment/mock?orderId=${encodeURIComponent(req.orderId)}`,
      raw: { mock: true, orderId: req.orderId },
    }
  }

  async verifyWebhook(req: VerifyWebhookRequest): Promise<VerifyWebhookResult> {
    const body = req.body as Record<string, string>
    const orderId = body.order_id || ""
    const tx = mockTransactions.get(orderId)

    // Mock signature scheme mirrors Midtrans's shape (sha512 of order_id +
    // status_code + gross_amount + "serverKey") so existing webhook routes
    // that verify a signature don't need a mock-specific code path — they
    // just need MIDTRANS_SERVER_KEY unset, which this provider requires anyway.
    const expectedSignature = createHash("sha512")
      .update(`${orderId}${body.status_code || "200"}${body.gross_amount || ""}mock-server-key`)
      .digest("hex")

    return {
      valid: body.signature_key === expectedSignature || body.signature_key === "mock",
      orderId,
      status: tx?.status || "pending",
      paymentType: tx?.paymentType || "mock",
      transactionId: tx?.transactionId,
      raw: body,
    }
  }

  async getTransactionStatus(orderId: string): Promise<TransactionStatusResult> {
    const tx = mockTransactions.get(orderId)
    if (!tx) {
      return { orderId, status: "pending", paymentType: "unselected", transactionId: undefined, raw: { mock: true } }
    }
    return {
      orderId: tx.orderId,
      status: tx.status,
      paymentType: tx.paymentType,
      transactionId: tx.transactionId,
      raw: { mock: true, ...tx },
    }
  }

  async cancelTransaction(orderId: string): Promise<boolean> {
    const tx = mockTransactions.get(orderId)
    if (!tx) return false
    tx.status = "cancelled"
    return true
  }

  async refundTransaction(orderId: string): Promise<boolean> {
    const tx = mockTransactions.get(orderId)
    if (!tx || tx.status !== "success") return false
    tx.status = "failed" // no dedicated "refunded" status on TransactionStatusResult
    return true
  }
}
