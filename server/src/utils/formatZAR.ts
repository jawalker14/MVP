/**
 * Format a number as South African Rand.
 * Returns "R 1 250.00" format (SA convention: space as thousands separator, R prefix).
 */
export function formatZAR(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2)
  const [integer, cents] = fixed.split('.')
  const withThousands = (integer ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const formatted = `R ${withThousands}.${cents ?? '00'}`
  return amount < 0 ? `-${formatted}` : formatted
}
