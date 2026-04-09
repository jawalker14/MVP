import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  MoreVertical,
  MessageCircle,
  Mail,
  Download,
  CheckCircle,
  Loader2,
  ChevronLeft,
} from 'lucide-react'
import api from '../api/client'
import { useToast } from '../contexts/ToastContext'
import StatusBadge from '../components/StatusBadge'
import type { InvoiceStatus } from '../components/StatusBadge'
import ConfirmModal from '../components/ConfirmModal'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { formatZAR } from '../utils/formatZAR'

// ─── Config ───────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${formatDate(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItemData {
  id: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
  sortOrder: number
}

interface InvoiceData {
  id: string
  invoiceNumber: string
  type: string
  status: string
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  dueDate: string | null
  notes: string | null
  paymentLinkUrl: string | null
  sentVia: string | null
  sentAt: string | null
  viewedAt: string | null
  paidAt: string | null
  createdAt: string
  clientId: string | null
  lineItems: LineItemData[]
  client: {
    id: string
    name: string
    email: string | null
    phoneWhatsapp: string
  } | null
  business: {
    businessName: string | null
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    province: string | null
    postalCode: string | null
    vatNumber: string | null
    bankName: string | null
    bankAccountNumber: string | null
    bankBranchCode: string | null
  } | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [invoice, setInvoice] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchInvoice()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchInvoice() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<InvoiceData>(`/api/invoices/${id}`)
      setInvoice(data)
    } catch {
      setError('Invoice not found')
    } finally {
      setLoading(false)
    }
  }

  async function handleSend(via: 'whatsapp' | 'email') {
    if (!id || actionLoading) return

    // Email delivery is not yet configured — surface a clear message instead of
    // silently marking the invoice "sent" with no email ever dispatched.
    if (via === 'email') {
      setMenuOpen(false)
      showToast('Email delivery coming soon — use WhatsApp for now.', 'error')
      return
    }

    setActionLoading(true)
    setMenuOpen(false)
    try {
      const { data } = await api.post<{ whatsapp_url?: string }>(`/api/invoices/${id}/send`, { via })
      if (data.whatsapp_url) {
        window.open(data.whatsapp_url, '_blank')
      }
      await fetchInvoice()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      showToast(e?.response?.data?.error ?? 'Failed to send invoice', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleMarkPaid() {
    if (!id || actionLoading) return
    setActionLoading(true)
    setMenuOpen(false)
    try {
      await api.post(`/api/invoices/${id}/mark-paid`)
      showToast('Invoice marked as paid', 'success')
      await fetchInvoice()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      showToast(e?.response?.data?.error ?? 'Failed to mark as paid', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleConvert() {
    if (!id || actionLoading) return
    setActionLoading(true)
    setMenuOpen(false)
    try {
      const { data } = await api.post<{ invoiceNumber: string }>(`/api/invoices/${id}/convert`)
      showToast(`Converted to Invoice ${data.invoiceNumber}`, 'success')
      await fetchInvoice()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      showToast(e?.response?.data?.error ?? 'Failed to convert', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete() {
    if (!id || actionLoading) return
    setActionLoading(true)
    try {
      await api.delete(`/api/invoices/${id}`)
      showToast('Invoice deleted', 'success')
      navigate('/invoices')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      showToast(e?.response?.data?.error ?? 'Failed to delete', 'error')
      setActionLoading(false)
    }
  }

  async function handleDuplicate() {
    if (!invoice || actionLoading) return
    setActionLoading(true)
    setMenuOpen(false)

    const dueDate =
      invoice.type === 'invoice'
        ? (() => {
            const d = new Date()
            d.setDate(d.getDate() + 14)
            return d.toISOString().split('T')[0]!
          })()
        : null

    try {
      const { data } = await api.post<{ id: string; invoiceNumber: string }>('/api/invoices', {
        clientId: invoice.clientId,
        type: invoice.type,
        vatEnabled: invoice.vatRate > 0,
        dueDate,
        notes: invoice.notes ?? null,
        lineItems: invoice.lineItems.map((item, idx) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sortOrder: idx,
        })),
      })
      showToast('Invoice duplicated', 'success')
      navigate(`/invoices/${data.id}`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      showToast(e?.response?.data?.error ?? 'Failed to duplicate', 'error')
      setActionLoading(false)
    }
  }

  function handleDownloadPdf() {
    window.open(`${API_URL}/api/invoices/${id}/public/pdf`, '_blank')
  }

  // ── Loading / error states ──

  if (loading) {
    return (
      <div className="px-4 pt-4 flex flex-col gap-3">
        <LoadingSkeleton height="h-10" />
        <LoadingSkeleton height="h-[320px]" />
        <LoadingSkeleton height="h-40" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 px-8 text-center">
        <p className="text-text-primary font-bold">Invoice not found</p>
        <button
          onClick={() => navigate('/invoices')}
          className="text-accent text-sm underline"
        >
          Back to Invoices
        </button>
      </div>
    )
  }

  const status = invoice.status as InvoiceStatus
  const isQuote = invoice.type === 'quote'

  // ── Menu items ──

  const menuItems: { label: string; onClick: () => void; danger?: boolean }[] = []

  if (status === 'draft') {
    menuItems.push(
      { label: 'Edit', onClick: () => navigate(`/invoices/${id}/edit`) },
      { label: 'Send via WhatsApp', onClick: () => handleSend('whatsapp') },
      { label: 'Email (coming soon)', onClick: () => handleSend('email') },
    )
  } else if (status === 'sent' || status === 'viewed' || status === 'overdue') {
    menuItems.push(
      { label: 'Resend via WhatsApp', onClick: () => handleSend('whatsapp') },
      { label: 'Mark as Paid', onClick: handleMarkPaid },
      { label: 'Download PDF', onClick: handleDownloadPdf },
    )
  } else if (status === 'paid') {
    menuItems.push({ label: 'Download PDF', onClick: handleDownloadPdf })
  }

  if (isQuote) {
    menuItems.push({ label: 'Convert to Invoice', onClick: handleConvert })
  }
  menuItems.push({ label: 'Duplicate', onClick: handleDuplicate })

  if (status === 'draft') {
    menuItems.push({
      label: 'Delete',
      onClick: () => { setMenuOpen(false); setShowDeleteModal(true) },
      danger: true,
    })
  }

  // ── Address + timeline ──

  const addressParts = [
    invoice.business?.addressLine1,
    invoice.business?.addressLine2,
    invoice.business?.city,
    invoice.business?.province,
    invoice.business?.postalCode,
  ].filter(Boolean)
  const address = addressParts.join(', ')

  const timelineEvents: { label: string; time: string | null; color: string }[] = [
    { label: 'Created', time: invoice.createdAt, color: 'bg-gray-400' },
    ...(invoice.sentAt
      ? [{ label: `Sent via ${invoice.sentVia ?? 'unknown'}`, time: invoice.sentAt, color: 'bg-blue-400' }]
      : []),
    ...(invoice.viewedAt
      ? [{ label: 'Viewed by client', time: invoice.viewedAt, color: 'bg-amber-400' }]
      : []),
    ...(invoice.paidAt
      ? [{ label: 'Paid', time: invoice.paidAt, color: 'bg-green-400' }]
      : []),
  ]

  // ── Render ──

  return (
    <div className="pb-[260px]">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-4">
        <button
          onClick={() => navigate('/invoices')}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-raised text-text-secondary active:opacity-70 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          <h1 className="font-bold text-xl text-text-primary truncate">{invoice.invoiceNumber}</h1>
          <StatusBadge status={status} />
        </div>

        {/* Three-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-raised text-text-secondary active:opacity-70 shrink-0"
            aria-label="More options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-40 bg-surface-raised rounded-xl shadow-xl overflow-hidden min-w-[210px] animate-slide-down">
                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    className={`w-full px-4 py-3.5 text-left text-sm font-medium border-b border-border last:border-0 active:opacity-70 ${
                      item.danger ? 'text-danger' : 'text-text-primary'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Overdue banner ── */}
      {status === 'overdue' && (
        <div className="mx-4 mb-3 rounded-xl px-4 py-3 bg-danger/10 border border-danger/30">
          <p className="text-danger text-sm font-semibold">This invoice is overdue</p>
        </div>
      )}

      {/* ── Action in-progress indicator ── */}
      {actionLoading && (
        <div className="flex justify-center py-2">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        </div>
      )}

      {/* ── Invoice content card ── */}
      <div className="mx-4 bg-surface rounded-xl p-5 mb-4">
        {/* From */}
        <p className="text-xs uppercase tracking-wider text-text-muted mb-2">From</p>
        <p className="font-semibold text-text-primary">{invoice.business?.businessName ?? '—'}</p>
        {address && <p className="text-sm text-text-secondary mt-0.5">{address}</p>}
        {invoice.business?.vatNumber && (
          <p className="text-sm text-text-muted mt-0.5">VAT: {invoice.business.vatNumber}</p>
        )}

        <div className="border-t border-border my-4" />

        {/* To */}
        <p className="text-xs uppercase tracking-wider text-text-muted mb-2">To</p>
        {invoice.client ? (
          <>
            <p className="font-semibold text-text-primary">{invoice.client.name}</p>
            {invoice.client.phoneWhatsapp && (
              <p className="text-sm text-text-secondary mt-0.5">{invoice.client.phoneWhatsapp}</p>
            )}
            {invoice.client.email && (
              <p className="text-sm text-text-muted mt-0.5">{invoice.client.email}</p>
            )}
          </>
        ) : (
          <p className="text-text-muted text-sm">—</p>
        )}

        <div className="border-t border-border my-4" />

        {/* Line items */}
        <div className="flex flex-col gap-3">
          {invoice.lineItems.map((item) => (
            <div key={item.id} className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <p className="text-text-primary text-sm font-medium">{item.description}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {item.quantity} × {formatZAR(item.unitPrice)}
                </p>
              </div>
              <p className="text-text-primary text-sm font-medium shrink-0">
                {formatZAR(item.lineTotal)}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border my-4" />

        {/* Totals */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Subtotal</span>
            <span className="text-text-secondary">{formatZAR(invoice.subtotal)}</span>
          </div>
          {invoice.vatRate > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">VAT (15%)</span>
              <span className="text-text-secondary">{formatZAR(invoice.vatAmount)}</span>
            </div>
          )}
          <div className="flex justify-between mt-1">
            <span className="font-bold text-text-primary text-base">Total</span>
            <span className="font-bold text-accent text-lg">{formatZAR(invoice.total)}</span>
          </div>
        </div>

        {/* Due date + notes */}
        {(invoice.dueDate || invoice.notes) && (
          <div className="border-t border-border mt-4 pt-4 flex flex-col gap-2">
            {invoice.dueDate && (
              <p className="text-sm text-text-secondary">
                <span className="text-text-muted">Due: </span>
                {formatDate(invoice.dueDate)}
              </p>
            )}
            {invoice.notes && (
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{invoice.notes}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Status timeline ── */}
      <div className="mx-4 mb-4">
        <p className="text-xs uppercase tracking-wider text-text-muted mb-3">Timeline</p>
        <div className="flex flex-col">
          {timelineEvents.map((event, idx) => (
            <div key={idx} className="flex gap-3 items-start">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${event.color}`} />
                {idx < timelineEvents.length - 1 && (
                  <div className="w-0.5 bg-border min-h-[32px]" />
                )}
              </div>
              <div className="pb-4">
                <p className="text-sm text-text-primary font-medium leading-tight">{event.label}</p>
                {event.time && (
                  <p className="text-xs text-text-muted mt-0.5">{formatDateTime(event.time)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fixed bottom actions ── */}
      <div
        className="fixed bottom-16 left-0 right-0 bg-primary border-t border-border px-4 pt-4 flex flex-col gap-2"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {status === 'draft' && (
          <>
            <button
              onClick={() => handleSend('whatsapp')}
              disabled={actionLoading}
              className="w-full h-[52px] bg-[#25D366] text-white font-bold rounded-xl flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-60"
            >
              <MessageCircle className="w-5 h-5" />
              Send via WhatsApp
            </button>
            <button
              onClick={() => handleSend('email')}
              className="w-full h-12 bg-transparent border border-border text-text-muted rounded-xl flex items-center justify-center gap-2 active:opacity-70"
            >
              <Mail className="w-4 h-4" />
              Email (coming soon)
            </button>
          </>
        )}

        {(status === 'sent' || status === 'viewed' || status === 'overdue') && (
          <>
            <button
              onClick={() => handleSend('whatsapp')}
              disabled={actionLoading}
              className="w-full h-12 bg-[#25D366] text-white font-bold rounded-xl flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-60"
            >
              <MessageCircle className="w-4 h-4" />
              Resend via WhatsApp
            </button>
            <button
              onClick={handleMarkPaid}
              disabled={actionLoading}
              className="w-full h-12 bg-success text-white font-bold rounded-xl flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-60"
            >
              <CheckCircle className="w-4 h-4" />
              Mark as Paid
            </button>
          </>
        )}

        {status === 'paid' && (
          <button
            onClick={handleDownloadPdf}
            className="w-full h-12 bg-transparent border border-border text-text-primary font-medium rounded-xl flex items-center justify-center gap-2 active:opacity-70"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        )}
      </div>

      {/* ── Delete confirm ── */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete this invoice?"
          message="This action cannot be undone."
          confirmLabel="Delete"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}