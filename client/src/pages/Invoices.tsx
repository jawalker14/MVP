import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, CheckCircle } from 'lucide-react'
import api from '../api/client'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import type { InvoiceStatus } from '../components/StatusBadge'
import LoadingSkeleton from '../components/LoadingSkeleton'
import EmptyState from '../components/EmptyState'
import { formatZAR } from '@invoicekasi/shared'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceSummary {
  id: string
  invoiceNumber: string
  type: string
  status: string
  total: number
  dueDate: string | null
  createdAt: string
  clientName: string | null
}

type TabId = 'all' | 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'quotes'

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'viewed', label: 'Viewed' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
  { id: 'quotes', label: 'Quotes' },
]

function buildParams(tab: TabId, page: number): Record<string, string> {
  const p: Record<string, string> = { page: String(page), limit: '20' }
  if (tab === 'quotes') p['type'] = 'quote'
  else if (tab !== 'all') p['status'] = tab
  return p
}

interface EmptyMeta {
  title: string
  description: string
  showCta?: boolean
}

const EMPTY: Record<TabId, EmptyMeta> = {
  all: { title: 'No invoices yet', description: 'Create your first invoice to get paid.', showCta: true },
  draft: { title: 'No drafts', description: 'Incomplete invoices will appear here.' },
  sent: { title: 'No sent invoices', description: 'Invoices awaiting payment will appear here.' },
  viewed: { title: 'No viewed invoices', description: "You'll see when clients open your invoice." },
  overdue: { title: 'No overdue invoices — looking good!', description: 'All payments are up to date.' },
  paid: { title: 'No payments this month yet', description: 'Paid invoices will show up here.' },
  quotes: { title: 'No quotes yet', description: 'Create a quote to send to a client.', showCta: true },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Invoices() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [invoiceList, setInvoiceList] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadPage = useCallback(async (tab: TabId, pg: number, replace: boolean) => {
    if (replace) {
      setInvoiceList([])
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    try {
      const { data } = await api.get<{
        invoices: InvoiceSummary[]
        totalPages: number
        page: number
      }>('/api/invoices', { params: buildParams(tab, pg) })
      setInvoiceList((prev) => (replace ? data.invoices : [...prev, ...data.invoices]))
      setTotalPages(data.totalPages)
      setPage(pg)
    } catch {
      // keep existing state
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    loadPage(activeTab, 1, true)
  }, [activeTab, loadPage])

  const empty = EMPTY[activeTab]

  return (
    <div>
      <PageHeader title="Invoices" />

      {/* Filter tabs — horizontal scroll */}
      <div
        className="flex overflow-x-auto border-b border-border px-4"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 text-sm font-medium border-b-2 transition-colors ${
                active ? 'text-accent border-accent' : 'text-text-muted border-transparent'
              }`}
              style={{ minHeight: 44 }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Invoice list */}
      <div className="px-4 pt-3">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <LoadingSkeleton key={i} height="h-[76px]" />
            ))}
          </div>
        ) : invoiceList.length === 0 ? (
          activeTab === 'overdue' ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <CheckCircle className="w-12 h-12 text-success" />
              <p className="text-text-primary font-bold text-lg">{empty.title}</p>
              <p className="text-text-secondary text-sm">{empty.description}</p>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title={empty.title}
              description={empty.description}
              {...(empty.showCta
                ? {
                    cta: {
                      label: activeTab === 'quotes' ? 'Create Quote' : 'Create Invoice',
                      onClick: () => navigate('/invoices/new'),
                    },
                  }
                : {})}
            />
          )
        ) : (
          <>
            {invoiceList.map((inv) => (
              <button
                key={inv.id}
                onClick={() => navigate(`/invoices/${inv.id}`)}
                className="w-full bg-surface rounded-xl p-4 mb-2 flex items-start justify-between text-left active:opacity-70"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary truncate leading-tight">
                    {inv.clientName ?? 'Unknown Client'}
                  </p>
                  <p className="text-sm text-text-muted mt-0.5">{inv.invoiceNumber}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="font-semibold text-text-primary leading-tight">
                    {formatZAR(inv.total)}
                  </p>
                  <div className="mt-1">
                    <StatusBadge status={inv.status as InvoiceStatus} />
                  </div>
                  <p className="text-xs text-text-muted mt-1">{formatDate(inv.createdAt)}</p>
                </div>
              </button>
            ))}

            {page < totalPages && (
              <button
                onClick={() => loadPage(activeTab, page + 1, false)}
                disabled={loadingMore}
                className="w-full bg-surface rounded-xl p-3 mt-1 text-text-muted text-sm font-medium flex items-center justify-center active:opacity-70 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}