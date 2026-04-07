/**
 * Generate a WhatsApp deep link to share an invoice.
 * Opens WhatsApp with a pre-filled message on the recipient's number.
 */
export function buildWhatsAppShareUrl(
  phoneWhatsapp: string,
  invoiceNumber: string,
  businessName: string,
  total: string,
  viewUrl: string,
): string {
  // Normalise phone: strip spaces, dashes, parentheses; ensure it starts without '+'
  const phone = phoneWhatsapp.replace(/[\s\-()]/g, '').replace(/^\+/, '')

  const message = encodeURIComponent(
    `Hi! Please find ${invoiceNumber} from ${businessName} for ${total}.\n\nView & pay here: ${viewUrl}`,
  )

  return `https://wa.me/${phone}?text=${message}`
}
