const STYLES = {
  draft: 'bg-gray-700/50 text-gray-400',
  sent: 'bg-blue-500/20 text-blue-400',
  viewed: 'bg-amber-500/20 text-amber-400',
  paid: 'bg-green-500/20 text-green-400',
  overdue: 'bg-red-500/20 text-red-400',
} as const

export type InvoiceStatus = keyof typeof STYLES

export default function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STYLES[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
