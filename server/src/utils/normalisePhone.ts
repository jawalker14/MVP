export class InvalidPhoneError extends Error {
  constructor() { super('Invalid phone number — please use SA format like 0821234567 or +27821234567') }
}

export function normalisePhone(phone: string): string {
  const stripped = phone.replace(/[\s\-()]/g, '')

  // Already E.164
  if (stripped.startsWith('+')) {
    if (!/^\+[1-9][0-9]{7,14}$/.test(stripped)) throw new InvalidPhoneError()
    return stripped
  }

  // 0xx — SA local format. Mobile starts 06/07/08, landline 01-05, plus a few exceptions.
  if (stripped.startsWith('0')) {
    if (!/^0[1-8][0-9]{8}$/.test(stripped)) throw new InvalidPhoneError()
    return '+27' + stripped.slice(1)
  }

  // 27xxxxxxxxx without +
  if (stripped.startsWith('27') && stripped.length === 11 && /^27[1-8][0-9]{8}$/.test(stripped)) {
    return '+' + stripped
  }

  // Bare 9-digit (e.g. "821234567")
  if (/^[1-8][0-9]{8}$/.test(stripped)) {
    return '+27' + stripped
  }

  throw new InvalidPhoneError()
}