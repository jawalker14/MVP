import React, { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  Trash2,
  MessageCircle,
  Check,
  Loader2,
  Mail,
} from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import PageHeader from '../components/PageHeader'
import ConfirmModal from '../components/ConfirmModal'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { formatZAR } from '../utils/formatZAR'

// ─── Style constants ──────────────────────────────────────────────────────────

const INPUT =
  'w-full h-12 bg-surface rounded-xl px-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30 disabled:opacity-50'
const INPUT_INNER =
  'w-full h-12 bg-primary rounded-xl px-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30 disabled:opacity-50'
const LABEL = 'block text-sm font-medium text-text-secondary mb-1'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string
  description: string
  quantity: string  // raw input — parse via parseFloat where math is needed
  unit_price: string  // raw input — parse via parseFloat where math is needed
}

interface WizardState {
  step: 1 | 2 | 3 | 4
  client_id: string | null
  client_name: string
  client_phone: string
  client_email: string
  type: 'invoice' | 'quote'
  line_items: LineItem[]
  vat_enabled: boolean
  due_date: string | null
  notes: string
  isSubmitting: boolean
}

type WizardAction =
  | { type: 'GO_TO_STEP'; step: 1 | 2 | 3 | 4 }
  | { type: 'SELECT_CLIENT'; client_id: string; client_name: string; client_phone: string; client_email: string }
  | { type: 'SET_TYPE'; invoiceType: 'invoice' | 'quote' }
  | { type: 'UPDATE_LINE_ITEM'; id: string; field: keyof Omit<LineItem, 'id'>; value: string | number }
  | { type: 'ADD_LINE_ITEM' }
  | { type: 'REMOVE_LINE_ITEM'; id: string }
  | { type: 'TOGGLE_VAT' }
  | { type: 'SET_DUE_DATE'; date: string | null }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'SET_SUBMITTING'; value: boolean }

interface ClientRow {
  id: string
  name: string
  phoneWhatsapp: string
  email: string | null
}

interface UserProfile {
  businessName: string | null
  phone: string | null
  vatNumber: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  province: string | null
  postalCode: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get14DaysFromNow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]!
}

function computeTotals(lineItems: LineItem[], vatEnabled: boolean) {
  const lineCents = lineItems.map((item) => {
    const q = parseFloat(item.quantity) || 0
    const p = parseFloat(item.unit_price) || 0
    const qtyHundredths = Math.round(q * 100)
    const priceCents = Math.round(p * 100)
    return Math.round((qtyHundredths * priceCents) / 100)
  })
  const subtotalCents = lineCents.reduce((s, c) => s + c, 0)
  const vatCents = vatEnabled ? Math.round((subtotalCents * 15) / 100) : 0
  const totalCents = subtotalCents + vatCents
  return {
    subtotal: Math.round(subtotalCents) / 100,
    vat: Math.round(vatCents) / 100,
    total: Math.round(totalCents) / 100,
  }
}

function hasDataEntered(state: WizardState): boolean {
  if (state.client_id) return true
  return state.line_items.some((item) => item.description.trim() !== '' || (parseFloat(item.unit_price) || 0) > 0)
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

const initialState: WizardState = {
  step: 1,
  client_id: null,
  client_name: '',
  client_phone: '',
  client_email: '',
  type: 'invoice',
  line_items: [{ id: crypto.randomUUID(), description: '', quantity: '1', unit_price: '' }],
  vat_enabled: false,
  due_date: get14DaysFromNow(),
  notes: '',
  isSubmitting: false,
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'GO_TO_STEP':
      return { ...state, step: action.step }
    case 'SELECT_CLIENT':
      return {
        ...state,
        client_id: action.client_id,
        client_name: action.client_name,
        client_phone: action.client_phone,
        client_email: action.client_email,
      }
    case 'SET_TYPE':
      return {
        ...state,
        type: action.invoiceType,
        due_date:
          action.invoiceType === 'quote'
            ? null
            : state.due_date || get14DaysFromNow(),
      }
    case 'UPDATE_LINE_ITEM':
      return {
        ...state,
        line_items: state.line_items.map((item) =>
          item.id === action.id ? { ...item, [action.field]: action.value } : item,
        ),
      }
    case 'ADD_LINE_ITEM':
      return {
        ...state,
        line_items: [
          ...state.line_items,
          { id: crypto.randomUUID(), description: '', quantity: '1', unit_price: '' },
        ],
      }
    case 'REMOVE_LINE_ITEM':
      return {
        ...state,
        line_items: state.line_items.filter((item) => item.id !== action.id),
      }
    case 'TOGGLE_VAT':
      return { ...state, vat_enabled: !state.vat_enabled }
    case 'SET_DUE_DATE':
      return { ...state, due_date: action.date }
    case 'SET_NOTES':
      return { ...state, notes: action.notes }
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.value }
    default:
      return state
  }
}

// ─── Progress indicator ───────────────────────────────────────────────────────

function WizardProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center h-8 px-4 gap-0">
      {[1, 2, 3, 4].map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && (
            <div
              className={`h-px w-8 transition-colors duration-200 ${
                s <= step ? 'bg-accent' : 'bg-surface-raised'
              }`}
            />
          )}
          <div
            className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${
              s <= step ? 'bg-accent' : 'bg-surface-raised'
            }`}
          />
        </React.Fragment>
      ))}
    </div>
  )
}

// ─── Step 1 — Select Client ───────────────────────────────────────────────────

function Step1SelectClient({
  state,
  dispatch,
}: {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
}) {
  const { showToast } = useToast()
  const [showNewForm, setShowNewForm] = useState(false)
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // New client form
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newErrors, setNewErrors] = useState<{ name?: string; phone?: string }>({})
  const [saving, setSaving] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // Auto-focus search on mount
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Focus name field when form opens
  useEffect(() => {
    if (showNewForm) {
      setTimeout(() => nameRef.current?.focus(), 50)
    }
  }, [showNewForm])

  // Load clients with debounce
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const delay = query ? 300 : 0
    timerRef.current = setTimeout(async () => {
      setClientsLoading(true)
      try {
        const params: Record<string, string> = {}
        if (query) params['search'] = query
        const { data } = await api.get<{ clients: ClientRow[] }>('/api/clients', { params })
        const loaded = data.clients ?? []
        setClients(loaded)
        if (!initialLoadDone) {
          setInitialLoadDone(true)
          if (loaded.length === 0) setShowNewForm(true)
        }
      } catch {
        setClients([])
        if (!initialLoadDone) setInitialLoadDone(true)
      } finally {
        setClientsLoading(false)
      }
    }, delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddClient() {
    const errs: typeof newErrors = {}
    if (!newName.trim()) errs.name = 'Name is required'
    if (!newPhone.trim()) errs.phone = 'WhatsApp number is required'
    setNewErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    try {
      const { data } = await api.post<ClientRow>('/api/clients', {
        name: newName.trim(),
        phoneWhatsapp: newPhone.trim(),
      })
      dispatch({
        type: 'SELECT_CLIENT',
        client_id: data.id,
        client_name: data.name,
        client_phone: data.phoneWhatsapp,
        client_email: data.email ?? '',
      })
      dispatch({ type: 'GO_TO_STEP', step: 2 })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      showToast(e?.response?.data?.error ?? 'Could not add client', 'error')
    } finally {
      setSaving(false)
    }
  }

  function selectClient(client: ClientRow) {
    dispatch({
      type: 'SELECT_CLIENT',
      client_id: client.id,
      client_name: client.name,
      client_phone: client.phoneWhatsapp,
      client_email: client.email ?? '',
    })
    dispatch({ type: 'GO_TO_STEP', step: 2 })
  }

  return (
    <div className="px-4 pb-8">
      {/* Add New Client toggle button */}
      <button
        onClick={() => setShowNewForm((v) => !v)}
        className="w-full bg-surface rounded-xl p-4 border border-dashed border-accent/40 flex items-center gap-3 mb-3 active:opacity-70"
      >
        <Plus className="w-5 h-5 text-accent shrink-0" />
        <span className="text-accent font-medium text-base">Add New Client</span>
      </button>

      {/* Inline new client form — slides down */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          showNewForm ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-surface rounded-xl p-4 flex flex-col gap-3 mb-3">
          <div>
            <label className={LABEL}>Name</label>
            <input
              ref={nameRef}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                setNewErrors((p) => ({ ...p, name: undefined }))
              }}
              placeholder="Client or business name"
              autoComplete="off"
              disabled={saving}
              className={INPUT_INNER}
            />
            {newErrors.name && <p className="mt-1 text-sm text-danger">{newErrors.name}</p>}
          </div>
          <div>
            <label className={LABEL}>WhatsApp Number</label>
            <input
              value={newPhone}
              onChange={(e) => {
                setNewPhone(e.target.value)
                setNewErrors((p) => ({ ...p, phone: undefined }))
              }}
              placeholder="+27 XX XXX XXXX"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              disabled={saving}
              className={INPUT_INNER}
            />
            {newErrors.phone && <p className="mt-1 text-sm text-danger">{newErrors.phone}</p>}
          </div>
          <button
            onClick={handleAddClient}
            disabled={saving}
            className="h-12 min-w-[64px] bg-accent text-primary font-bold rounded-xl flex items-center justify-center active:scale-95 transition-transform duration-150 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </button>
        </div>
      </div>

      {/* Client search + list */}
      {clientsLoading && !initialLoadDone ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} height="h-16" />
          ))}
        </div>
      ) : (
        <>
          {/* Show search only when there are clients or a query */}
          {(clients.length > 0 || query || initialLoadDone) && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients..."
                className={`${INPUT} pl-10`}
              />
            </div>
          )}

          {clientsLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <LoadingSkeleton key={i} height="h-16" />
              ))}
            </div>
          ) : clients.length === 0 && query ? (
            <p className="text-center text-text-muted text-sm py-6">No clients match "{query}"</p>
          ) : (
            <div>
              {clients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => selectClient(client)}
                  className={`w-full bg-surface rounded-xl p-4 mb-2 flex items-center justify-between active:opacity-70 ${
                    state.client_id === client.id
                      ? 'border border-accent'
                      : 'border border-transparent'
                  }`}
                >
                  <div className="text-left min-w-0">
                    <p className="text-text-primary font-semibold truncate">{client.name}</p>
                    <p className="text-sm text-text-muted">{client.phoneWhatsapp}</p>
                  </div>
                  {state.client_id === client.id && (
                    <Check className="w-5 h-5 text-accent shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Step 2 — Line Items ──────────────────────────────────────────────────────

function Step2LineItems({
  state,
  dispatch,
}: {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
}) {
  const firstDescRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstDescRef.current?.focus()
  }, [])

  const { subtotal, vat, total } = computeTotals(state.line_items, state.vat_enabled)

  function updateField(id: string, field: keyof Omit<LineItem, 'id'>, value: string | number) {
    dispatch({ type: 'UPDATE_LINE_ITEM', id, field, value })
  }

  return (
    <>
      {/* Scrollable content */}
      <div className="px-4 pb-[220px]">
        {state.line_items.map((item, idx) => {
          const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
          return (
            <div key={item.id} className="bg-surface rounded-xl p-4 mb-3 relative">
              {/* Delete button — only if more than 1 item */}
              {state.line_items.length > 1 && (
                <button
                  onClick={() => dispatch({ type: 'REMOVE_LINE_ITEM', id: item.id })}
                  className="absolute top-2 right-2 w-10 h-10 flex items-center justify-center text-danger active:scale-95 transition-transform duration-150 rounded-lg"
                  aria-label="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              {/* Description */}
              <input
                ref={idx === 0 ? firstDescRef : undefined}
                value={item.description}
                onChange={(e) => updateField(item.id, 'description', e.target.value)}
                placeholder="What did you sell or do?"
                className="w-full h-12 bg-primary rounded-xl px-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30 mb-3"
              />

              {/* Qty + Price row */}
              <div className="flex gap-3 items-end">
                {/* Quantity stepper */}
                <div className="flex-shrink-0">
                  <p className="text-xs text-text-muted mb-1.5 text-center">Qty</p>
                  <div className="flex items-center gap-0 bg-primary rounded-xl overflow-hidden">
                    <button
                      onClick={() =>
                        updateField(item.id, 'quantity', String(Math.max(1, (parseFloat(item.quantity) || 1) - 1)))
                      }
                      className="w-11 h-11 flex items-center justify-center text-text-secondary text-lg font-medium active:bg-surface-raised active:scale-95 transition-transform duration-150"
                    >
                      −
                    </button>
                    <input
                      value={item.quantity}
                      onChange={(e) => {
                        const cleaned = e.target.value
                          .replace(/[^0-9.]/g, '')
                          .replace(/(\..*)\./g, '$1')
                        updateField(item.id, 'quantity', cleaned)
                      }}
                      inputMode="decimal"
                      className="w-10 h-11 bg-transparent text-center text-base font-semibold text-text-primary outline-none"
                    />
                    <button
                      onClick={() => updateField(item.id, 'quantity', String((parseFloat(item.quantity) || 0) + 1))}
                      className="w-11 h-11 flex items-center justify-center text-text-secondary text-lg font-medium active:bg-surface-raised active:scale-95 transition-transform duration-150"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Unit price */}
                <div className="flex-1">
                  <p className="text-xs text-text-muted mb-1.5">Price</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-base font-medium pointer-events-none">
                      R
                    </span>
                    <input
                      value={item.unit_price}
                      onChange={(e) => {
                        const cleaned = e.target.value
                          .replace(/[^0-9.]/g, '')
                          .replace(/(\..*)\./g, '$1')
                        updateField(item.id, 'unit_price', cleaned)
                      }}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="w-full h-12 bg-primary rounded-xl pl-7 pr-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30"
                    />
                  </div>
                </div>
              </div>

              {/* Line total */}
              <p className="text-right text-sm text-text-muted mt-2">
                {formatZAR(lineTotal)}
              </p>
            </div>
          )
        })}

        {/* Add another item */}
        <button
          onClick={() => dispatch({ type: 'ADD_LINE_ITEM' })}
          className="flex items-center gap-2 text-accent text-sm font-medium py-2"
        >
          <Plus className="w-4 h-4" />
          Add another item
        </button>
      </div>

      {/* Sticky totals footer */}
      <div
        className="fixed bottom-16 left-0 right-0 bg-surface border-t border-border px-4 pt-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Subtotal */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-secondary">Subtotal</span>
          <span className="text-sm text-text-secondary">{formatZAR(subtotal)}</span>
        </div>

        {/* VAT toggle */}
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-text-secondary">Add VAT (15%)</span>
          </label>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_VAT' })}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
              state.vat_enabled ? 'bg-accent' : 'bg-surface-raised'
            }`}
            role="switch"
            aria-checked={state.vat_enabled}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                state.vat_enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* VAT amount — shown when enabled */}
        {state.vat_enabled && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">VAT (15%)</span>
            <span className="text-sm text-text-secondary">{formatZAR(vat)}</span>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-bold text-text-primary">Total</span>
          <span className="text-xl font-bold text-accent">{formatZAR(total)}</span>
        </div>

        {/* Next button */}
        <button
          onClick={() => dispatch({ type: 'GO_TO_STEP', step: 3 })}
          className="w-full h-12 bg-accent text-primary font-bold rounded-xl flex items-center justify-center active:scale-95 transition-transform duration-150"
        >
          Next
        </button>
      </div>
    </>
  )
}

// ─── Step 3 — Invoice Details ─────────────────────────────────────────────────

function Step3Details({
  state,
  dispatch,
}: {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
}) {
  const notesRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div className="px-4 pb-[120px] flex flex-col gap-5">
      {/* Type selector */}
      <div>
        <label className={LABEL}>Document Type</label>
        <div className="flex gap-2">
          {(['invoice', 'quote'] as const).map((t) => (
            <button
              key={t}
              onClick={() => dispatch({ type: 'SET_TYPE', invoiceType: t })}
              className={`flex-1 h-11 rounded-xl font-semibold text-sm transition-colors duration-150 ${
                state.type === t
                  ? 'bg-accent text-primary'
                  : 'bg-surface text-text-muted'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice number preview */}
      <div>
        <label className={LABEL}>Invoice Number</label>
        <div className="h-12 bg-surface rounded-xl px-3 flex items-center">
          <span className="text-text-muted text-base">Auto-generated</span>
        </div>
      </div>

      {/* Due date — only for invoices */}
      {state.type === 'invoice' && (
        <div>
          <label className={LABEL}>Due Date</label>
          <p className="text-xs text-text-muted mb-1.5">When should this be paid?</p>
          <input
            type="date"
            value={state.due_date ?? ''}
            onChange={(e) =>
              dispatch({ type: 'SET_DUE_DATE', date: e.target.value || null })
            }
            className={`${INPUT} text-text-primary`}
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className={LABEL}>Notes</label>
        <textarea
          ref={notesRef}
          value={state.notes}
          onChange={(e) => dispatch({ type: 'SET_NOTES', notes: e.target.value })}
          placeholder="Payment terms, thank you message, etc."
          rows={4}
          className="w-full bg-surface rounded-xl p-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30 resize-none"
        />
      </div>

      {/* Review button */}
      <div
        className="fixed bottom-16 left-0 right-0 px-4 pt-3 bg-primary border-t border-border"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => dispatch({ type: 'GO_TO_STEP', step: 4 })}
          className="w-full h-12 bg-accent text-primary font-bold rounded-xl flex items-center justify-center active:scale-95 transition-transform duration-150"
        >
          Review
        </button>
      </div>
    </div>
  )
}

// ─── Step 4 — Review & Send ───────────────────────────────────────────────────

function Step4Review({
  state,
  userProfile,
  onSend,
}: {
  state: WizardState
  userProfile: UserProfile | null
  onSend: (via: 'whatsapp' | 'email' | 'draft') => Promise<void>
}) {
  const { subtotal, vat, total } = computeTotals(state.line_items, state.vat_enabled)

  // Build address string
  const addressParts = [
    userProfile?.addressLine1,
    userProfile?.addressLine2,
    userProfile?.city,
    userProfile?.province,
    userProfile?.postalCode,
  ].filter(Boolean)
  const address = addressParts.join(', ')

  return (
    <>
      <div className="px-4 pb-[230px]">
        {/* Invoice preview card */}
        <div className="bg-surface rounded-xl p-5">
          {/* From */}
          <p className="text-xs uppercase tracking-wider text-text-muted mb-2">From</p>
          <p className="font-semibold text-text-primary">
            {userProfile?.businessName ?? '—'}
          </p>
          {address && <p className="text-sm text-text-secondary mt-0.5">{address}</p>}
          {userProfile?.vatNumber && (
            <p className="text-sm text-text-muted mt-0.5">VAT: {userProfile.vatNumber}</p>
          )}

          <div className="border-t border-border my-4" />

          {/* To */}
          <p className="text-xs uppercase tracking-wider text-text-muted mb-2">To</p>
          <p className="font-semibold text-text-primary">{state.client_name}</p>
          <p className="text-sm text-text-secondary mt-0.5">{state.client_phone}</p>
          {state.client_email && (
            <p className="text-sm text-text-muted mt-0.5">{state.client_email}</p>
          )}

          <div className="border-t border-border my-4" />

          {/* Line items */}
          <div className="flex flex-col gap-3">
            {state.line_items.map((item) => (
              <div key={item.id} className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">
                    {item.description || 'Unnamed item'}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {item.quantity} × {formatZAR(parseFloat(item.unit_price) || 0)}
                  </p>
                </div>
                <p className="text-text-primary text-sm font-medium shrink-0">
                  {formatZAR((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-border my-4" />

          {/* Totals */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Subtotal</span>
              <span className="text-text-secondary">{formatZAR(subtotal)}</span>
            </div>
            {state.vat_enabled && (
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">VAT (15%)</span>
                <span className="text-text-secondary">{formatZAR(vat)}</span>
              </div>
            )}
            <div className="flex justify-between mt-1">
              <span className="font-bold text-text-primary text-base">Total</span>
              <span className="font-bold text-accent text-lg">{formatZAR(total)}</span>
            </div>
          </div>

          {/* Due date + notes */}
          {(state.due_date || state.notes) && (
            <div className="border-t border-border mt-4 pt-4 flex flex-col gap-2">
              {state.due_date && (
                <p className="text-sm text-text-secondary">
                  <span className="text-text-muted">Due: </span>
                  {new Date(state.due_date + 'T00:00:00').toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              )}
              {state.notes && (
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{state.notes}</p>
              )}
            </div>
          )}
        </div>

        {/* Type badge */}
        <p className="text-center text-xs text-text-muted mt-3 capitalize">
          {state.type} · VAT {state.vat_enabled ? 'included' : 'excluded'}
        </p>
      </div>

      {/* Action buttons */}
      <div
        className="fixed bottom-16 left-0 right-0 bg-primary border-t border-border px-4 pt-4 flex flex-col gap-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Send via WhatsApp */}
        <button
          onClick={() => onSend('whatsapp')}
          disabled={state.isSubmitting}
          className="w-full h-[52px] bg-[#25D366] text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform duration-150 disabled:opacity-60"
        >
          {state.isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <MessageCircle className="w-5 h-5" />
              Send via WhatsApp
            </>
          )}
        </button>

        {/* Send via Email */}
        <button
          onClick={() => onSend('email')}
          disabled={state.isSubmitting}
          className="w-full h-12 bg-transparent border border-border text-text-primary rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform duration-150 disabled:opacity-60"
        >
          <Mail className="w-4 h-4" />
          Send via Email
        </button>

        {/* Save as Draft */}
        <button
          onClick={() => onSend('draft')}
          disabled={state.isSubmitting}
          className="text-text-muted text-sm font-medium py-3 px-4 min-h-[48px] active:opacity-70 disabled:opacity-60"
        >
          Save as Draft
        </button>
      </div>
    </>
  )
}

// ─── Free tier overlay ────────────────────────────────────────────────────────

function FreeTierOverlay({ onBack }: { onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-primary">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-sm text-center">
        <div className="w-14 h-14 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🔒</span>
        </div>
        <h2 className="text-text-primary font-bold text-xl mb-2">Monthly limit reached</h2>
        <p className="text-text-secondary text-sm mb-6">
          You've used all 10 free invoices this month. Upgrade to Premium for unlimited invoicing.
        </p>
        <button
          onClick={onBack}
          className="w-full h-12 bg-surface-raised text-text-primary font-medium rounded-xl active:opacity-70"
        >
          Go Back
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvoiceNew() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [state, dispatch] = useReducer(wizardReducer, initialState)
  const [showDiscardModal, setShowDiscardModal] = useState(false)
  const [atFreeTierLimit, setAtFreeTierLimit] = useState(false)
  const [limitChecking, setLimitChecking] = useState(user?.plan === 'free')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  // Free tier check + user profile fetch on mount
  useEffect(() => {
    async function fetchUserProfile() {
      try {
        const { data } = await api.get<UserProfile & { invoiceCountThisMonth?: number }>(
          '/api/auth/me',
        )
        setUserProfile({
          businessName: data.businessName,
          phone: data.phone,
          vatNumber: data.vatNumber,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          city: data.city,
          province: data.province,
          postalCode: data.postalCode,
        })
        if (user?.plan === 'free') {
          const count = data.invoiceCountThisMonth ?? 0
          if (count >= 10) setAtFreeTierLimit(true)
        }
      } catch {
        // Non-critical — carry on
      } finally {
        setLimitChecking(false)
      }
    }

    fetchUserProfile()
  }, [user?.plan])

  // Back handlers per step
  function handleBack() {
    if (state.step === 1) {
      if (hasDataEntered(state)) {
        setShowDiscardModal(true)
      } else {
        navigate('/dashboard')
      }
    } else {
      dispatch({ type: 'GO_TO_STEP', step: (state.step - 1) as 1 | 2 | 3 | 4 })
    }
  }

  // Send / save handler
  const handleSend = useCallback(
    async (via: 'whatsapp' | 'email' | 'draft') => {
      dispatch({ type: 'SET_SUBMITTING', value: true })

      try {
        // Validate line items before posting
        const invalidItem = state.line_items.some(
          (item) => (parseFloat(item.quantity) || 0) <= 0 || (parseFloat(item.unit_price) || 0) < 0,
        )
        if (invalidItem) {
          showToast('Please enter valid quantities and prices for all items', 'error')
          dispatch({ type: 'SET_SUBMITTING', value: false })
          return
        }

        // Build invoice body
        const body = {
          clientId: state.client_id!,
          type: state.type,
          vatEnabled: state.vat_enabled,
          dueDate: state.due_date || null,
          notes: state.notes || null,
          lineItems: state.line_items.map((item, idx) => ({
            description: item.description,
            quantity: parseFloat(item.quantity) || 0,
            unitPrice: parseFloat(item.unit_price) || 0,
            sortOrder: idx,
          })),
        }

        // Create the invoice
        const { data: invoice } = await api.post<{ id: string; invoiceNumber: string }>(
          '/api/invoices',
          body,
        )

        if (via === 'draft') {
          showToast('Draft saved', 'success')
          navigate(`/invoices/${invoice.id}`)
          return
        }

        // Send the invoice
        const { data: sendResult } = await api.post<{ whatsapp_url?: string }>(
          `/api/invoices/${invoice.id}/send`,
          { via },
        )

        if (via === 'whatsapp' && sendResult.whatsapp_url) {
          window.open(sendResult.whatsapp_url, '_blank')
        }

        showToast('Invoice sent!', 'success')
        navigate(`/invoices/${invoice.id}`)
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } } }
        showToast(e?.response?.data?.error ?? 'Something went wrong', 'error')
        dispatch({ type: 'SET_SUBMITTING', value: false })
      }
    },
    [state, navigate, showToast],
  )

  // Step titles
  const stepTitles: Record<number, string> = {
    1: 'Select Client',
    2: 'Add Items',
    3: 'Details',
    4: 'Review',
  }

  // While checking limit
  if (limitChecking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    )
  }

  // Free tier limit hit
  if (atFreeTierLimit) {
    return <FreeTierOverlay onBack={() => navigate('/dashboard')} />
  }

  return (
    <div>
      {/* Progress + header */}
      <WizardProgress step={state.step} />
      <PageHeader
        title={stepTitles[state.step] ?? ''}
        showBack
        onBack={handleBack}
      />

      {/* Steps */}
      {state.step === 1 && (
        <Step1SelectClient state={state} dispatch={dispatch} />
      )}
      {state.step === 2 && (
        <Step2LineItems state={state} dispatch={dispatch} />
      )}
      {state.step === 3 && (
        <Step3Details state={state} dispatch={dispatch} />
      )}
      {state.step === 4 && (
        <Step4Review
          state={state}
          userProfile={userProfile}
          onSend={handleSend}
        />
      )}

      {/* Discard confirmation */}
      {showDiscardModal && (
        <ConfirmModal
          title="Discard this invoice?"
          message="Any unsaved progress will be lost."
          confirmLabel="Discard"
          confirmVariant="danger"
          onConfirm={() => navigate('/dashboard')}
          onCancel={() => setShowDiscardModal(false)}
        />
      )}
    </div>
  )
}