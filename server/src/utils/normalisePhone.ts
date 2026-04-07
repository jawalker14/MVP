/**
 * Normalise a phone number to E.164 format for South African numbers.
 * - Strips spaces, dashes, and parentheses
 * - "0xx" → "+27xx"
 * - "27xx" (no plus) → "+27xx"
 * - Already "+..." → left as-is
 */
export function normalisePhone(phone: string): string {
  const stripped = phone.replace(/[\s\-()]/g, '')

  if (stripped.startsWith('0')) {
    return '+27' + stripped.slice(1)
  }
  if (stripped.startsWith('27')) {
    return '+' + stripped
  }
  return stripped
}
