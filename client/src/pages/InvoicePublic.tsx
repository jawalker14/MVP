import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Lock, CheckCircle, Download } from 'lucide-react'
import { formatZAR } from '@invoicekasi/shared'
import type { InvoiceResponse } from '@invoicekasi/shared'
import { API_URL } from '../api/config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvoicePublic() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t') ?? ''
  const paymentStatus = searchParams.get('payment') as 'success' | 'cancelled' | 'failed' | null

  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    if (!token) {
      setError('Invoice not found')
      setLoading(false)
      return
    }
    fetch(`${API_URL}/api/invoices/${id}/public?t=${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found')
        return r.json() as Promise<InvoiceResponse>
      })
      .then(setInvoice)
      .catch(() => setError('Invoice not found'))
      .finally(() => setLoading(false))
  }, [id, token])

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#f8fafc' }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#e8b931', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ backgroundColor: '#f8fafc' }}
      >
        <p className="text-gray-900 font-bold text-lg">Invoice not found</p>
        <p className="text-gray-500 text-sm">This invoice may have been deleted or the link is invalid.</p>
      </div>
    )
  }

  const isPaid = invoice.status === 'paid'
  const isQuote = invoice.type === 'quote'
  const showPayButton = invoice.paymentLinkUrl && !isPaid
  const businessName = invoice.business?.businessName ?? 'InvoiceKasi'

  const addressParts = [
    invoice.business?.addressLine1,
    invoice.business?.addressLine2,
    invoice.business?.city,
    invoice.business?.province,
    invoice.business?.postalCode,
  ].filter(Boolean)
  const address = addressParts.join(', ')

  const hasBankDetails =
    invoice.business?.bankName ||
    invoice.business?.bankAccountNumber ||
    invoice.business?.bankBranchCode

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: '#f8fafc' }}>

      {/* ── Payment status banners ── */}
      {paymentStatus === 'success' && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-green-700 text-sm font-medium">Payment successful! Thank you.</p>
        </div>
      )}
      {paymentStatus === 'cancelled' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <p className="text-amber-700 text-sm font-medium">
            Payment was cancelled. You can try again below.
          </p>
        </div>
      )}
      {paymentStatus === 'failed' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <p className="text-red-700 text-sm font-medium">
            Payment failed. Please try again or contact {businessName}.
          </p>
        </div>
      )}

      {/* ── Gold header bar ── */}
      <div className="flex items-center gap-3 px-4 py-4" style={{ backgroundColor: '#e8b931' }}>
        {invoice.business?.logoUrl ? (
          <img
            src={invoice.business.logoUrl}
            alt={businessName}
            className="w-8 h-8 rounded-lg object-cover shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }}
          >
            IK
          </div>
        )}
        <p className="font-bold text-gray-900 text-base truncate">{businessName}</p>
      </div>

      {/* ── Invoice content card ── */}
      <div
        className="mx-4 mt-4 rounded-xl p-6"
        style={{ backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
      >
        {/* Type label + number */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-gray-500 text-xs mb-1">{formatDate(invoice.createdAt)}</p>
            {invoice.dueDate && (
              <p className="text-gray-500 text-xs">
                Due: <span className="font-medium text-gray-700">{formatDate(invoice.dueDate)}</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <p
              className="text-xl font-bold uppercase tracking-wide"
              style={{ color: '#e8b931' }}
            >
              {isQuote ? 'QUOTE' : 'INVOICE'}
            </p>
            <p className="text-gray-500 text-sm">{invoice.invoiceNumber}</p>
          </div>
        </div>

        <div className="border-t border-gray-100 my-4" />

        {/* From */}
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">From</p>
          <p className="font-bold text-gray-900">{businessName}</p>
          {address && <p className="text-sm text-gray-600 mt-0.5">{address}</p>}
          {invoice.business?.vatNumber && (
            <p className="text-sm text-gray-400 mt-0.5">VAT: {invoice.business.vatNumber}</p>
          )}
        </div>

        {/* To */}
        {invoice.client && (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">To</p>
            <p className="font-bold text-gray-900">{invoice.client.name}</p>
            {invoice.client.phoneWhatsapp && (
              <p className="text-sm text-gray-600 mt-0.5">{invoice.client.phoneWhatsapp}</p>
            )}
            {invoice.client.email && (
              <p className="text-sm text-gray-400 mt-0.5">{invoice.client.email}</p>
            )}
          </div>
        )}

        <div className="border-t border-gray-100 my-4" />

        {/* Line items table */}
        <div className="overflow-x-auto -mx-1">
          {/* Header row */}
          <div
            className="grid text-xs font-semibold text-gray-500 uppercase tracking-wide rounded-lg px-3 py-2 mb-1"
            style={{ backgroundColor: '#f1f5f9', gridTemplateColumns: '1fr auto auto auto' }}
          >
            <span>Description</span>
            <span className="text-right px-3">Qty</span>
            <span className="text-right px-3">Price</span>
            <span className="text-right">Total</span>
          </div>

          {/* Item rows */}
          {invoice.lineItems.map((item) => (
            <div
              key={item.id}
              className="grid text-sm px-3 py-2.5 border-b border-gray-100 last:border-0"
              style={{ gridTemplateColumns: '1fr auto auto auto' }}
            >
              <span className="text-gray-800 font-medium pr-3">{item.description}</span>
              <span className="text-gray-600 text-right px-3">{item.quantity}</span>
              <span className="text-gray-600 text-right px-3">{formatZAR(item.unitPrice)}</span>
              <span className="text-gray-800 font-semibold text-right">{formatZAR(item.lineTotal)}</span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-4 flex flex-col gap-1.5 items-end">
          <div className="flex justify-between w-full max-w-[220px] text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-700">{formatZAR(invoice.subtotal)}</span>
          </div>
          {invoice.vatRate > 0 && (
            <div className="flex justify-between w-full max-w-[220px] text-sm">
              <span className="text-gray-500">VAT (15%)</span>
              <span className="text-gray-700">{formatZAR(invoice.vatAmount)}</span>
            </div>
          )}
          <div
            className="flex justify-between w-full max-w-[220px] mt-1 pt-2 border-t border-gray-200"
          >
            <span className="font-bold text-gray-900 text-base">Total</span>
            <span className="font-bold text-gray-900 text-lg">{formatZAR(invoice.total)}</span>
          </div>
        </div>

        {/* Bank details */}
        {hasBankDetails && (
          <>
            <div className="border-t border-gray-100 mt-5 pt-4">
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Banking Details</p>
              <div className="flex flex-col gap-1">
                {invoice.business?.bankName && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Bank</span>
                    <span className="text-gray-800 font-medium">{invoice.business.bankName}</span>
                  </div>
                )}
                {invoice.business?.bankAccountNumber && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Account</span>
                    <span className="text-gray-800 font-medium">{invoice.business.bankAccountNumber}</span>
                  </div>
                )}
                {invoice.business?.bankBranchCode && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Branch Code</span>
                    <span className="text-gray-800 font-medium">{invoice.business.bankBranchCode}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="border-t border-gray-100 mt-4 pt-4">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Notes</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* ── Pay button ── */}
      <div className="mx-4 mt-4">
        {isPaid ? (
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}
          >
            <CheckCircle className="w-5 h-5 shrink-0" style={{ color: '#16a34a' }} />
            <p className="text-sm font-medium" style={{ color: '#15803d' }}>
              This invoice has been paid. Thank you!
            </p>
          </div>
        ) : showPayButton ? (
          <>
            <a
              href={invoice.paymentLinkUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-full rounded-xl font-bold text-white text-base gap-2 active:opacity-90"
              style={{
                backgroundColor: '#27ae60',
                height: 56,
                textDecoration: 'none',
              }}
            >
              Pay Now — {formatZAR(invoice.total)}
            </a>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <Lock className="w-3 h-3 text-gray-400" />
              <p className="text-xs text-gray-400">Secure payment powered by Yoco</p>
            </div>
          </>
        ) : null}
      </div>

      {/* ── PDF download ── */}
      <div className="flex justify-center mt-5">
        <a
          href={`${API_URL}/api/invoices/${id}/public/pdf?t=${token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-gray-500 underline underline-offset-2"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </a>
      </div>

      {/* ── Marketing footer ── */}
      <div className="flex flex-col items-center py-8 gap-1">
        <p className="text-sm text-gray-400">Created with InvoiceKasi</p>
        <p className="text-xs text-gray-300">Send professional invoices from your phone</p>
        <a
          href="/login"
          className="text-sm font-medium mt-1"
          style={{ color: '#e8b931', textDecoration: 'none' }}
        >
          invoicekasi.co.za
        </a>
      </div>
    </div>
  )
}