import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).unique().notNull(),
  phone: varchar('phone', { length: 20 }).notNull().default(''),
  businessName: varchar('business_name', { length: 255 }).notNull().default(''),
  vatNumber: varchar('vat_number', { length: 20 }),
  logoUrl: text('logo_url'),
  addressLine1: varchar('address_line1', { length: 255 }),
  addressLine2: varchar('address_line2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  province: varchar('province', { length: 50 }),
  postalCode: varchar('postal_code', { length: 10 }),
  bankName: varchar('bank_name', { length: 100 }),
  bankAccountNumber: varchar('bank_account_number', { length: 50 }),
  bankBranchCode: varchar('bank_branch_code', { length: 20 }),
  languagePref: varchar('language_pref', { length: 10 }).default('en'),
  plan: varchar('plan', { length: 20 }).default('free'),
  invoiceCountThisMonth: integer('invoice_count_this_month').default(0),
  invoiceCountResetAt: timestamp('invoice_count_reset_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
})

// ─── magic_links ──────────────────────────────────────────────────────────────

export const magicLinks = pgTable('magic_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
})

// ─── refresh_tokens ───────────────────────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenId: varchar('token_id', { length: 40 }).notNull().unique(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
})

// ─── clients ──────────────────────────────────────────────────────────────────

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phoneWhatsapp: varchar('phone_whatsapp', { length: 20 }).notNull(),
    address: text('address'),
    notes: text('notes'),
    isDeleted: boolean('is_deleted').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
  },
  (table) => [
    // Partial unique: (user_id, phone_whatsapp) where is_deleted = false
    // Drizzle doesn't support partial unique natively, so we enforce it in application logic
    // and add a regular index for query performance
    index('clients_user_phone_idx').on(table.userId, table.phoneWhatsapp),
  ],
)

// ─── invoices ─────────────────────────────────────────────────────────────────

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    invoiceNumber: varchar('invoice_number', { length: 20 }).notNull(),
    type: varchar('type', { length: 10 }).notNull().default('invoice'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).default('15.00'),
    vatAmount: numeric('vat_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: varchar('currency', { length: 3 }).default('ZAR'),
    dueDate: date('due_date'),
    notes: text('notes'),
    paymentLinkUrl: text('payment_link_url'),
    paymentReference: varchar('payment_reference', { length: 255 }),
    sentVia: varchar('sent_via', { length: 20 }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    convertedToInvoiceId: uuid('converted_to_invoice_id').references((): any => invoices.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
  },
  (table) => [
    unique('invoices_user_number_unique').on(table.userId, table.invoiceNumber),
    index('invoices_user_status_idx').on(table.userId, table.status),
    index('invoices_user_created_idx').on(table.userId, table.createdAt),
  ],
)

// ─── line_items ───────────────────────────────────────────────────────────────

export const lineItems = pgTable('line_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 500 }).notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
})

// ─── webhook_events ───────────────────────────────────────────────────────────

export const webhookEvents = pgTable('webhook_events', {
  id: varchar('id', { length: 255 }).primaryKey(), // webhook-id header from Yoco
  processedAt: timestamp('processed_at', { withTimezone: true }).default(sql`now()`),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type MagicLink = typeof magicLinks.$inferSelect
export type RefreshToken = typeof refreshTokens.$inferSelect
export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type LineItem = typeof lineItems.$inferSelect
export type NewLineItem = typeof lineItems.$inferInsert
