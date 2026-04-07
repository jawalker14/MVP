import { z } from 'zod'
import { INVOICE_STATUSES, INVOICE_TYPES } from './constants.js'

// ─── Auth ───────────────────────────────────────────────────────────────────

export const RequestMagicLinkSchema = z.object({
  email: z.string().email(),
})

export const VerifyMagicLinkSchema = z.object({
  token: z.string().min(1),
})

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    businessName: z.string(),
    phone: z.string(),
    plan: z.string(),
  }),
})

// ─── User / Profile ──────────────────────────────────────────────────────────

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
  email: z.string().email().nullable().optional(),
  phoneWhatsapp: z.string().min(7).max(20),
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
  createdAt: z.string(),
  updatedAt: z.string(),
})

// ─── Line Items ───────────────────────────────────────────────────────────────

export const LineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  sortOrder: z.number().int().nonnegative().optional(),
})

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const CreateInvoiceSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  type: z.enum(INVOICE_TYPES).default('invoice'),
  vatRate: z.number().min(0).max(100).default(15),
  dueDate: z.string().nullable().optional(), // ISO date string
  notes: z.string().nullable().optional(),
  lineItems: z.array(LineItemSchema).min(1),
})

export const UpdateInvoiceSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  type: z.enum(INVOICE_TYPES).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  vatRate: z.number().min(0).max(100).optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lineItems: z.array(LineItemSchema).min(1).optional(),
})

export const InvoiceResponseSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  type: z.enum(INVOICE_TYPES),
  status: z.enum(INVOICE_STATUSES),
  subtotal: z.string(),
  vatRate: z.string(),
  vatAmount: z.string(),
  total: z.string(),
  currency: z.string(),
  dueDate: z.string().nullable(),
  notes: z.string().nullable(),
  paymentLinkUrl: z.string().nullable(),
  sentAt: z.string().nullable(),
  viewedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  client: ClientResponseSchema.nullable(),
  lineItems: z.array(
    z.object({
      id: z.string().uuid(),
      description: z.string(),
      quantity: z.string(),
      unitPrice: z.string(),
      lineTotal: z.string(),
      sortOrder: z.number(),
    }),
  ),
})

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const DashboardStatsSchema = z.object({
  totalRevenue: z.number(),
  invoicesThisMonth: z.number(),
  invoiceLimit: z.number(),
  outstandingAmount: z.number(),
  recentInvoices: z.array(InvoiceResponseSchema),
})

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type RequestMagicLink = z.infer<typeof RequestMagicLinkSchema>
export type VerifyMagicLink = z.infer<typeof VerifyMagicLinkSchema>
export type AuthResponse = z.infer<typeof AuthResponseSchema>
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>
export type CreateClient = z.infer<typeof CreateClientSchema>
export type UpdateClient = z.infer<typeof UpdateClientSchema>
export type ClientResponse = z.infer<typeof ClientResponseSchema>
export type LineItem = z.infer<typeof LineItemSchema>
export type CreateInvoice = z.infer<typeof CreateInvoiceSchema>
export type UpdateInvoice = z.infer<typeof UpdateInvoiceSchema>
export type InvoiceResponse = z.infer<typeof InvoiceResponseSchema>
export type DashboardStats = z.infer<typeof DashboardStatsSchema>
