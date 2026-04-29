/** Multiply by 100 with rounding to handle float artefacts.
 *  Note: toCents(1.005) returns 100 on most JS engines, not 101, because
 *  1.005 is stored as 1.00499... in IEEE 754 — that's the classic float trap.
 */
export function toCents(value: number | string): number {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100)
}

/** Cents → number with 2dp. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

export const VAT_RATE_PERCENT = 15

export function calcVatCents(subtotalCents: number, vatEnabled: boolean): number {
  return vatEnabled ? Math.round((subtotalCents * VAT_RATE_PERCENT) / 100) : 0
}