import Midtrans from "midtrans-client"
import { createHash } from "crypto"
import type {
  PaymentProvider,
  CreatePaymentRequest,
  CreatePaymentResult,
  VerifyWebhookRequest,
  VerifyWebhookResult,
  TransactionStatusResult,
} from "./provider"

function mapMidtransStatus(
  transactionStatus: string
): VerifyWebhookResult["status"] {
  if (transactionStatus === "capture" || transactionStatus === "settlement") {
    return "success"
  }
  if (transactionStatus === "deny" || transactionStatus === "cancel") {
    return "cancelled"
  }
  if (transactionStatus === "expire") {
    return "expired"
  }
  return "pending"
}

export class MidtransProvider implements PaymentProvider {
  readonly name = "midtrans"

  private async getSnapClient() {
    const { getResolvedMidtransConfig } = await import("../settings")
    const config = await getResolvedMidtransConfig()
    return {
      snap: new Midtrans.Snap({
        isProduction: config.isProduction,
        serverKey: config.serverKey || process.env.MIDTRANS_SERVER_KEY || "",
        clientKey: config.clientKey || process.env.MIDTRANS_CLIENT_KEY || "",
      }),
      config
    }
  }

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const { snap } = await this.getSnapClient()

    const transaction = await snap.createTransaction({
      transaction_details: {
        order_id: req.orderId,
        gross_amount: req.amount,
      },
      customer_details: {
        email: req.customer.email,
        first_name: req.customer.firstName,
        last_name: req.customer.lastName || "",
        phone: req.customer.phone,
      },
      item_details: req.items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      enabled_payments: [
        "credit_card",
        "gopay",
        "shopeepay",
        "bca_va",
        "mandiri_bill",
        "bri_va",
        "permata_va",
        "bni_va",
        "qris",
        "cimb_clicks",
        "danamon_online",
      ],
      callbacks: {
        finish: req.returnUrl || `${appUrl}/dashboard/payment/success`,
        error: req.cancelUrl || `${appUrl}/dashboard/payment/failed`,
        pending: `${appUrl}/dashboard/payment/pending`,
      },
    })

    return {
      token: transaction.token,
      redirectUrl: transaction.redirect_url,
      raw: transaction,
    }
  }

  async verifyWebhook(req: VerifyWebhookRequest): Promise<VerifyWebhookResult> {
    const body = req.body as Record<string, string>
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      payment_type,
      transaction_id,
      transaction_time,
      fraud_status,
    } = body

    // Verify signature with dynamic config
    const { getResolvedMidtransConfig } = await import("../settings")
    const config = await getResolvedMidtransConfig()
    const serverKey = config.serverKey || process.env.MIDTRANS_SERVER_KEY || ""
    const expectedSignature = createHash("sha512")
      .update(order_id + status_code + gross_amount + serverKey)
      .digest("hex")

    const valid = expectedSignature === signature_key

    return {
      valid,
      orderId: order_id,
      status: mapMidtransStatus(transaction_status),
      paymentType: payment_type,
      transactionId: transaction_id,
      transactionTime: transaction_time
        ? new Date(transaction_time)
        : undefined,
      fraudStatus: fraud_status,
      raw: body,
    }
  }

  async getTransactionStatus(
    orderId: string
  ): Promise<TransactionStatusResult> {
    try {
      const { snap } = await this.getSnapClient()
      const result = await snap.transaction.status(orderId)
      return {
        orderId,
        status: mapMidtransStatus(result.transaction_status),
        paymentType: result.payment_type,
        transactionId: result.transaction_id,
        raw: result,
      }
    } catch (err: any) {
      // If 404 or "Transaction doesn't exist", the transaction is created on Snap token but not yet paid/processed by user
      if (
        err?.httpStatusCode === '404' || 
        err?.ApiResponse?.status_code === '404' || 
        err?.message?.includes("doesn't exist") || 
        err?.message?.includes('404')
      ) {
        return {
          orderId,
          status: 'pending',
          paymentType: 'unselected',
          transactionId: undefined,
          raw: err?.ApiResponse || { status_message: "Transaction not yet processed" },
        }
      }
      throw err
    }
  }

  async cancelTransaction(orderId: string): Promise<boolean> {
    try {
      const { snap } = await this.getSnapClient()
      await snap.transaction.cancel(orderId)
      return true
    } catch {
      return false
    }
  }

  async refundTransaction(orderId: string): Promise<boolean> {
    try {
      const { snap } = await this.getSnapClient()
      await snap.transaction.refund(orderId)
      return true
    } catch {
      return false
    }
  }
}
