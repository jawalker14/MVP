export const VAT_RATE = 15 // percent

export const FREE_TIER_INVOICE_LIMIT = 10 // per month
export const FREE_TIER_CLIENT_LIMIT = 5

export const INVOICE_STATUSES = ['draft', 'sent', 'viewed', 'paid', 'overdue'] as const
export const INVOICE_TYPES = ['invoice', 'quote'] as const
export const CURRENCY = 'ZAR' as const
export const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const
