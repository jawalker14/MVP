import { z } from 'zod'
import { INVOICE_STATUSES, INVOICE_TYPES } from './constants.js'

// ─── Auth ────────────────────────────────────────────────────────────────────

export const RequestMagicLinkSchema = z.object({
  email: z.string().email(),
})

// Server's verify-magic-link body includes both token and email
export const VerifyMagicLinkSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
})

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

// ─── User / Profile ───────────────────────────────────────────────────────────

// Shape of GET /api/auth/me (and the user payload in verify-magic-link response)
export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  businessName: z.string().nullable(),
  phone: z.string().nullable(),
  vatNumber: z.string().nullable(),
  logoUrl: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  postalCode: z.string().nullable(),
  bankName: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  bankBranchCode: z.string().nullable(),
  languagePref: z.string().nullable(),
  plan: z.string().nullable(),
  invoiceCountThisMonth: z.number().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

// verify-magic-link returns user only when isNewUser is false
export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  isNewUser: z.boolean(),
  user: UserResponseSchema.optional(),
})

export const UpdateProfileSchema = z.object({
  businessName: z.string().min(1).max(255).optional(),
  phone: z.string().max(20).optional(),
  vatNumber: z.string().max(20).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  addressLine1: z.string().max(255).nullable().optional(),
  addressLine2: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  province: z.string().max(50).nullable().optional(),
  postalCode: z.string().max(10).nullable().optional(),
  bankName: z.string().max(100).nullable().optional(),
  bankAccountNumber: z.string().max(50).nullable().optional(),
  bankBranchCode: z.string().max(20).nullable().optional(),
  languagePref: z.string().max(10).optional(),
})

// ─── Clients ─────────────────────────────────────────────────────────────────

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  phoneWhatsapp: z.string().min(7).max(20),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const UpdateClientSchema = CreateClientSchema.partial()

export const ClientResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phoneWhatsapp: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

// ─── Line Items ───────────────────────────────────────────────────────────────

export const LineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  sortOrder: z.number().int().nonnegative().optional(),
})

// ─── Invoices — business sub-object ──────────────────────────────────────────

export const BusinessResponseSchema = z.object({
  businessName: z.string().nullable(),
  logoUrl: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  postalCode: z.string().nullable(),
  vatNumber: z.string().nullable(),
  bankName: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  bankBranchCode: z.string().nullable(),
})

// ─── Invoices ─────────────────────────────────────────────────────────────────

// numericInvoice() in server parses subtotal/vatRate/vatAmount/total to numbers.
// numericLineItem() parses quantity/unitPrice/lineTotal to numbers.
export const InvoiceResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  clientId: z.string().uuid().nullable(),
  invoiceNumber: z.string(),
  type: z.enum(INVOICE_TYPES),
  status: z.enum(INVOICE_STATUSES),
  subtotal: z.number(),
  vatRate: z.number(),
  vatAmount: z.number(),
  total: z.number(),
  currency: z.string().nullable(),
  dueDate: z.string().nullable(),
  notes: z.string().nullable(),
  publicToken: z.string().nullable().optional(),
  paymentLinkUrl: z.string().nullable(),
  paymentReference: z.string().nullable(),
  sentVia: z.string().nullable(),
  sentAt: z.string().nullable(),
  viewedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  convertedToInvoiceId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  lineItems: z.array(
    z.object({
      id: z.string().uuid(),
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      lineTotal: z.number(),
      sortOrder: z.number(),
    }),
  ),
  client: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().nullable(),
    phoneWhatsapp: z.string(),
  }).nullable().optional(),
  business: BusinessResponseSchema.nullable().optional(),
})

// Flat shape returned by GET /api/invoices (list endpoint) — no nested client/business objects
export const InvoiceListItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  clientId: z.string().uuid().nullable(),
  invoiceNumber: z.string(),
  type: z.enum(INVOICE_TYPES),
  status: z.enum(INVOICE_STATUSES),
  subtotal: z.number(),
  vatRate: z.number(),
  vatAmount: z.number(),
  total: z.number(),
  currency: z.string().nullable(),
  dueDate: z.string().nullable(),
  notes: z.string().nullable(),
  paymentLinkUrl: z.string().nullable(),
  paymentReference: z.string().nullable(),
  sentVia: z.string().nullable(),
  sentAt: z.string().nullable(),
  viewedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  convertedToInvoiceId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  clientName: z.string().nullable(),
  clientPhoneWhatsapp: z.string().nullable(),
})

// Server uses { vatEnabled: boolean } — shared aligns to match
export const CreateInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(INVOICE_TYPES).default('invoice'),
  vatEnabled: z.boolean(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lineItems: z.array(LineItemSchema).min(1),
})

export const UpdateInvoiceSchema = z.object({
  clientId: z.string().uuid().optional(),
  type: z.enum(INVOICE_TYPES).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  vatEnabled: z.boolean().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lineItems: z.array(LineItemSchema).min(1).optional(),
})

export const SendInvoiceSchema = z.object({
  via: z.enum(['whatsapp', 'email', 'both']),
})

export const SendInvoiceResponseSchema = z.object({
  invoice: InvoiceResponseSchema,
  whatsapp_url: z.string().optional(),
  public_url: z.string(),
})

// ─── Dashboard ────────────────────────────────────────────────────────────────

// GET /api/dashboard/summary returns these snake_case fields
export const DashboardStatsSchema = z.object({
  total_outstanding: z.number(),
  paid_this_month: z.number(),
  overdue_count: z.number(),
  total_clients: z.number(),
})

// ─── Error Envelope ───────────────────────────────────────────────────────────

export interface ApiError {
  error: string
  code?: string
  details?: Array<{ path: string; message: string }>
}

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
})

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type RequestMagicLink = z.infer<typeof RequestMagicLinkSchema>
export type VerifyMagicLink = z.infer<typeof VerifyMagicLinkSchema>
export type RefreshToken = z.infer<typeof RefreshTokenSchema>
export type UserResponse = z.infer<typeof UserResponseSchema>
export type AuthResponse = z.infer<typeof AuthResponseSchema>
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>
export type CreateClient = z.infer<typeof CreateClientSchema>
export type UpdateClient = z.infer<typeof UpdateClientSchema>
export type ClientResponse = z.infer<typeof ClientResponseSchema>
export type LineItem = z.infer<typeof LineItemSchema>
export type BusinessResponse = z.infer<typeof BusinessResponseSchema>
export type InvoiceResponse = z.infer<typeof InvoiceResponseSchema>
export type InvoiceListItem = z.infer<typeof InvoiceListItemSchema>
export type CreateInvoice = z.infer<typeof CreateInvoiceSchema>
export type UpdateInvoice = z.infer<typeof UpdateInvoiceSchema>
export type SendInvoice = z.infer<typeof SendInvoiceSchema>
export type SendInvoiceResponse = z.infer<typeof SendInvoiceResponseSchema>
export type DashboardStats = z.infer<typeof DashboardStatsSchema>