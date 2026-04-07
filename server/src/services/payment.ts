/**
 * Yoco payment integration — placeholder.
 * Yoco is SA's leading card payment provider (yoco.com).
 *
 * TODO: Implement when Yoco secret key is configured.
 * - POST /v1/checkouts to create a hosted checkout session
 * - Returns a payment URL to embed or redirect to
 */

export interface YocoCheckoutOptions {
  amountInCents: number
  currency: string
  metadata: {
    invoiceId: string
    invoiceNumber: string
    userId: string
  }
  successUrl: string
  cancelUrl: string
}

export interface YocoCheckoutResult {
  id: string
  redirectUrl: string
}

export async function createYocoCheckout(
  _options: YocoCheckoutOptions,
): Promise<YocoCheckoutResult> {
  // Placeholder — implement with Yoco API
  throw new Error('Yoco payment integration not yet configured')
}
