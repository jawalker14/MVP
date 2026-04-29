import { Link, useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../hooks/useApi'
import LoadingSkeleton from '../components/LoadingSkeleton'
import EmptyState from '../components/EmptyState'
import StatusBadge from '../components/StatusBadge'
import { formatZAR } from '../utils/formatZAR'
import type { DashboardStats, InvoiceListItem } from '@invoicekasi/shared'

interface InvoicesResponse {
  invoices: InvoiceListItem[]
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const greeting = user?.businessName?.split(' ')[0] || 'there'

  const { data: summary, loading: summaryLoading } =
    useApi<DashboardStats>('/api/dashboard/summary')

  const { data: invoicesRes, loading: invoicesLoading } =
    useApi<InvoicesResponse>('/api/invoices?limit=5&page=1')

  const invoices = invoicesRes?.invoices ?? []

  return (
    <div className="pb-4">
      {/* Greeting */}
      <div className="px-4 pt-6 pb-4">
        <p className="text-text-muted text-sm mb-0.5">Welcome back</p>
        <h2 className="text-text-primary text-2xl font-bold">Hey, {greeting}</h2>
      </div>

      {/* Summary cards */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          {summaryLoading ? (
            <>
              <LoadingSkeleton height="h-24" />
              <LoadingSkeleton height="h-24" />
              <LoadingSkeleton height="h-24" />
              <LoadingSkeleton height="h-24" />
            </>
          ) : (
            <>
              <div className="bg-surface rounded-xl p-4 border-l-[3px] border-l-accent">
                <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Outstanding</p>
                <p className="text-2xl font-bold text-text-primary">
                  {formatZAR(summary?.total_outstanding ?? 0)}
                </p>
              </div>

              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Paid This Month</p>
                <p className="text-2xl font-bold text-success">
                  {formatZAR(summary?.paid_this_month ?? 0)}
                </p>
              </div>

              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Overdue</p>
                <p className="text-2xl font-bold text-danger">{summary?.overdue_count ?? 0}</p>
                <p className="text-xs text-text-muted mt-0.5">invoices</p>
              </div>

              <div className="bg-surface rounded-xl p-4">
                <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Clients</p>
                <p className="text-2xl font-bold text-text-primary">{summary?.total_clients ?? 0}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent invoices */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-text-primary font-bold text-base">Recent Invoices</h3>
          <Link to="/invoices" className="text-accent text-sm font-medium">
            View All
          </Link>
        </div>

        {invoicesLoading ? (
          <div className="flex flex-col gap-2">
            <LoadingSkeleton height="h-[72px]" />
            <LoadingSkeleton height="h-[72px]" />
            <LoadingSkeleton height="h-[72px]" />
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice and get paid faster"
            cta={{ label: 'Create Invoice', onClick: () => navigate('/invoices/new') }}
          />
        ) : (
          <div>
            {invoices.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => navigate(`/invoices/${inv.id}`)}
                className="w-full text-left bg-surface rounded-xl p-4 mb-2 flex items-center justify-between active:opacity-70"
              >
                <div className="min-w-0 mr-3">
                  <p className="text-text-primary font-semibold truncate">
                    {inv.clientName ?? 'No client'}
                  </p>
                  <p className="text-sm text-text-muted">{inv.invoiceNumber}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-text-primary font-semibold">{formatZAR(inv.total)}</p>
                  <div className="mt-1">
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}