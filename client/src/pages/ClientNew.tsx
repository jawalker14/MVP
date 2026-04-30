import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import api, { extractApiError } from '../api/client'
import PageHeader from '../components/PageHeader'
import { useToast } from '../contexts/ToastContext'

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

export default function ClientNew() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [form, setForm] = useState<FormData>({
    name: '',
    phoneWhatsapp: '',
    email: '',
    address: '',
    notes: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  function validate(): boolean {
    const errs: FieldErrors = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.phoneWhatsapp.trim()) errs.phoneWhatsapp = 'WhatsApp number is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      await api.post('/api/clients', {
        name: form.name.trim(),
        phoneWhatsapp: form.phoneWhatsapp.trim(),
        ...(form.email.trim() && { email: form.email.trim() }),
        ...(form.address.trim() && { address: form.address.trim() }),
        ...(form.notes.trim() && { notes: form.notes.trim() }),
      })
      showToast('Client added', 'success')
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

  return (
    <div className="pb-36">
      <PageHeader title="Add Client" showBack />

      <div className="px-4 flex flex-col gap-4">
        <div>
          <label className={LABEL}>Name</label>
          <input
            value={form.name}
            onChange={(e) => {
              setForm((p) => ({ ...p, name: e.target.value }))
              setErrors((p) => ({ ...p, name: undefined }))
            }}
            placeholder="Client or business name"
            autoComplete="name"
            disabled={saving}
            className={INPUT}
          />
          {errors.name && <p className="mt-1 text-sm text-danger">{errors.name}</p>}
        </div>

        <div>
          <label className={LABEL}>WhatsApp Number</label>
          <input
            value={form.phoneWhatsapp}
            onChange={(e) => {
              setForm((p) => ({ ...p, phoneWhatsapp: e.target.value }))
              setErrors((p) => ({ ...p, phoneWhatsapp: undefined }))
            }}
            placeholder="+27 XX XXX XXXX"
            type="tel"
            autoComplete="tel"
            disabled={saving}
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
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="client@email.com"
            type="email"
            autoComplete="email"
            disabled={saving}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL}>Address</label>
          <textarea
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="Street address"
            rows={3}
            disabled={saving}
            className={TEXTAREA}
          />
        </div>

        <div>
          <label className={LABEL}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Any notes about this client"
            rows={2}
            disabled={saving}
            className={TEXTAREA}
          />
        </div>
      </div>

      <div
        className="fixed bottom-16 left-0 right-0 px-4 pt-3 pb-3 bg-primary"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full h-12 bg-accent text-primary font-bold rounded-xl flex items-center justify-center active:scale-95 transition-transform duration-150 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Client'}
        </button>
      </div>
    </div>
  )
}