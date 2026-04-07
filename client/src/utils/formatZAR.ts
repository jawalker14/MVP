export function formatZAR(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2)
  const [integer, cents] = fixed.split('.')
  const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const formatted = `R ${withThousands}.${cents}`
  return amount < 0 ? `-${formatted}` : formatted
}