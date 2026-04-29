import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import PageHeader from '../components/PageHeader'
import LoadingSkeleton from '../components/LoadingSkeleton'
import EmptyState from '../components/EmptyState'

interface Client {
  id: string
  name: string
  phoneWhatsapp: string
}

interface ClientsResponse {
  clients: Client[]
  total: number
}

export default function Clients() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [clientTotal, setClientTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const atLimit = clientTotal >= 5 && user?.plan === 'free'

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const delay = query ? 300 : 0
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params: Record<string, string> = {}
        if (query) params['search'] = query
        const { data } = await api.get<ClientsResponse>('/api/clients', { params })
        setClients(data.clients ?? [])
        if (!query) setClientTotal(data.total)
      } catch {
        setClients([])
      } finally {
        setLoading(false)
      }
    }, delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  return (
    <div>
      <PageHeader
        title="Clients"
        rightAction={
          <Link
            to="/clients/new"
            className="h-9 px-4 bg-accent text-primary font-bold text-sm rounded-xl flex items-center active:bg-accent-hover"
          >
            Add
          </Link>
        }
      />

      {atLimit && (
        <div className="mx-4 mb-2 bg-accent/10 border border-accent/30 rounded-xl p-3">
          <p className="text-accent text-sm">
            You've reached your 5 client limit on the free plan.
          </p>
        </div>
      )}

      {/* Sticky search bar */}
      <div className="sticky top-0 z-10 px-4 pb-3 bg-primary">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients..."
            className="w-full h-12 bg-surface rounded-xl pl-10 pr-4 text-base text-text-primary placeholder:text-text-muted outline-none"
          />
        </div>
      </div>

      {/* Client list */}
      <div className="px-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <LoadingSkeleton key={i} height="h-[68px]" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your first client to start invoicing"
          />
        ) : (
          <div>
            {clients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => navigate(`/clients/${client.id}/edit`)}
                className="w-full text-left bg-surface rounded-xl p-4 mb-2 flex items-center justify-between active:opacity-70"
              >
                <div className="min-w-0 mr-3">
                  <p className="text-text-primary font-semibold truncate">{client.name}</p>
                  <p className="text-sm text-text-muted">{client.phoneWhatsapp}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}