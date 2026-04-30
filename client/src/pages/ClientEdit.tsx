import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import api, { extractApiError } from '../api/client'
import { useApi } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ConfirmModal from '../components/ConfirmModal'
import { useToast } from '../contexts/ToastContext'

interface ClientData {
  id: string
  name: string
  phoneWhatsapp: string
  email?: string | null
  address?: string | null
  notes?: string | null
}

interface FormData {
  name: string
  phoneWhatsapp: string
  email: string
  address: string
  notes: string
}

interface FieldErrors {
  name?: string
  phoneWhatsapp?: string
}

const INPUT = 'w-full h-12 bg-surface rounded-xl px-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30 disabled:opacity-50'
const TEXTAREA = 'w-full bg-surface rounded-xl p-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30 disabled:opacity-50 resize-none'
const LABEL = 'block text-sm font-medium text-text-secondary mb-1'

export default function ClientEdit() {
  const { id } = useParams<{ id: string }>()
  const clientId = id ?? ''
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [form, setForm] = useState<FormData | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { data: client, loading } = useApi<ClientData>(
    `/api/clients/${clientId}`,
    { enabled: Boolean(clientId) },
  )

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name ?? '',
        phoneWhatsapp: client.phoneWhatsapp ?? '',
        email: client.email ?? '',
        address: client.address ?? '',
        notes: client.notes ?? '',
      })
    }
  }, [client])

  function validate(): boolean {
    if (!form) return false
    const errs: FieldErrors = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.phoneWhatsapp.trim()) errs.phoneWhatsapp = 'WhatsApp number is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!form || !validate()) return
    setSaving(true)
    try {
      await api.put(`/api/clients/${clientId}`, {
        name: form.name.trim(),
        phoneWhatsapp: form.phoneWhatsapp.trim(),
        ...(form.email.trim() && { email: form.email.trim() }),
        ...(form.address.trim() && { address: form.address.trim() }),
        ...(form.notes.trim() && { notes: form.notes.trim() }),
      })
      showToast('Client saved', 'success')
      navigate('/clients')
    } catch (err: unknown) {
      const { error: message } = extractApiError(err)
      const status = (err as any)?.response?.status
      if (status === 409) {
        setErrors({ phoneWhatsapp: message })
      } else {
        showToast(message, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setShowConfirm(false)
    setDeleting(true)
    try {
      await api.delete(`/api/clients/${clientId}`)
      showToast('Client deleted', 'success')
      navigate('/clients')
    } catch {
      showToast('Failed to delete client', 'error')
      setDeleting(false)
    }
  }

  if (loading || !form) {
    return (
      <div>
        <PageHeader title="Edit Client" showBack />
        <div className="px-4 flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <LoadingSkeleton key={i} height="h-12" />
          ))}
        </div>
      </div>
    )
  }

  const busy = saving || deleting

  return (
    <div className="pb-36">
      <PageHeader title="Edit Client" showBack />

      <div className="px-4 flex flex-col gap-4">
        <div>
          <label className={LABEL}>Name</label>
          <input
            value={form.name}
            onChange={(e) => {
              setForm((p) => p && { ...p, name: e.target.value })
              setErrors((p) => ({ ...p, name: undefined }))
            }}
            placeholder="Client or business name"
            autoComplete="name"
            disabled={busy}
            className={INPUT}
          />
          {errors.name && <p className="mt-1 text-sm text-danger">{errors.name}</p>}
        </div>

        <div>
          <label className={LABEL}>WhatsApp Number</label>
          <input
            value={form.phoneWhatsapp}
            onChange={(e) => {
              setForm((p) => p && { ...p, phoneWhatsapp: e.target.value })
              setErrors((p) => ({ ...p, phoneWhatsapp: undefined }))
            }}
            placeholder="+27 XX XXX XXXX"
            type="tel"
            autoComplete="tel"
            disabled={busy}
            className={INPUT}
          />
          {errors.phoneWhatsapp && (
            <p className="mt-1 text-sm text-danger">{errors.phoneWhatsapp}</p>
          )}
        </div>

        <div>
          <label className={LABEL}>Email</label>
          <input
            value={form.email}
            onChange={(e) => setForm((p) => p && { ...p, email: e.target.value })}
            placeholder="client@email.com"
            type="email"
            autoComplete="email"
            disabled={busy}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL}>Address</label>
          <textarea
            value={form.address}
            onChange={(e) => setForm((p) => p && { ...p, address: e.target.value })}
            placeholder="Street address"
            rows={3}
            disabled={busy}
            className={TEXTAREA}
          />
        </div>

        <div>
          <label className={LABEL}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => p && { ...p, notes: e.target.value })}
            placeholder="Any notes about this client"
            rows={2}
            disabled={busy}
            className={TEXTAREA}
          />
        </div>

        {/* Delete button */}
        <div className="pt-4 pb-2">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={busy}
            className="w-full py-3 text-danger text-sm font-medium active:opacity-70 disabled:opacity-40"
          >
            Delete Client
          </button>
        </div>
      </div>

      <div
        className="fixed bottom-16 left-0 right-0 px-4 pt-3 pb-3 bg-primary"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleSave}
          disabled={busy}
          className="w-full h-12 bg-accent text-primary font-bold rounded-xl flex items-center justify-center active:bg-accent-hover disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Changes'}
        </button>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Delete this client?"
          message="They won't appear in new invoices. Existing invoices won't be affected."
          confirmLabel="Delete"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}