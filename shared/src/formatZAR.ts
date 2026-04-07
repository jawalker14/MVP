/**
 * Format a number as South African Rand.
 * Convention: "R 1 250.00" — R prefix, space as thousands separator, 2 decimal places.
 */
export function formatZAR(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2)
  const [integer, cents] = fixed.split('.')
  // Insert space every 3 digits from the right
  const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const formatted = `R ${withThousands}.${cents}`
  return amount < 0 ? `-${formatted}` : formatted
}
