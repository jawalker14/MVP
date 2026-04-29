import { calcVatCents, toCents, fromCents } from '../server/src/utils/money'

const cases: Array<[string, () => boolean]> = [
  // toCents(1.005) is the classic float trap: Math.round(1.005 * 100) returns 100 on most
  // JS engines because 1.005 is stored as 1.00499... in IEEE 754. Both outcomes are accepted.
  ["1.005 → 100 cents (banker rounding doesn't apply, Math.round goes up at .5)", () => toCents(1.005) === 100 || toCents(1.005) === 101],
  ['VAT on 100.00 = 15.00', () => calcVatCents(10000, true) === 1500],
  ['VAT on 99.99 = 15.00 (rounded)', () => calcVatCents(9999, true) === 1500],
  ['fromCents(1500) === 15', () => fromCents(1500) === 15],
]

let failed = 0
for (const [name, fn] of cases) {
  const ok = fn()
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) failed++
}
process.exit(failed > 0 ? 1 : 0)