import React, { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import api from '../api/client'
import { useToast } from '../contexts/ToastContext'
import PageHeader from '../components/PageHeader'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { formatZAR } from '../utils/formatZAR'

// ─── Style constants ──────────────────────────────────────────────────────────

const INPUT =
  'w-full h-12 bg-surface rounded-xl px-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30 disabled:opacity-50'
const LABEL = 'block text-sm font-medium text-text-secondary mb-1'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
}

interface EditState {
  step: 1 | 2 | 3
  type: 'invoice' | 'quote'
  line_items: LineItem[]
  vat_enabled: boolean
  due_date: string | null
  notes: string
  isSubmitting: boolean
}

type EditAction =
  | { type: 'GO_TO_STEP'; step: 1 | 2 | 3 }
  | { type: 'SET_TYPE'; invoiceType: 'invoice' | 'quote' }
  | { type: 'UPDATE_LINE_ITEM'; id: string; field: keyof Omit<LineItem, 'id'>; value: string | number }
  | { type: 'ADD_LINE_ITEM' }
  | { type: 'REMOVE_LINE_ITEM'; id: string }
  | { type: 'TOGGLE_VAT' }
  | { type: 'SET_DUE_DATE'; date: string | null }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'INIT'; state: Omit<EditState, 'isSubmitting' | 'step'> }

interface InvoiceDetail {
  id: string
  clientId: string | null
  invoiceNumber: string
  type: string
  status: string
  vatRate: number
  dueDate: string | null
  notes: string | null
  lineItems: {
    id: string
    description: string
    quantity: number
    unitPrice: number
    lineTotal: number
    sortOrder: number
  }[]
  client: { id: string; name: string; phoneWhatsapp: string; email: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTotals(lineItems: LineItem[], vatEnabled: boolean) {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + parseFloat((item.quantity * item.unit_price).toFixed(2)),
    0,
  )
  const vat = vatEnabled ? parseFloat((subtotal * 0.15).toFixed(2)) : 0
  const total = parseFloat((subtotal + vat).toFixed(2))
  return { subtotal, vat, total }
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case 'INIT':
      return { ...state, ...action.state, step: 1, isSubmitting: false }
    case 'GO_TO_STEP':
      return { ...state, step: action.step }
    case 'SET_TYPE':
      return {
        ...state,
        type: action.invoiceType,
        due_date:
          action.invoiceType === 'quote'
            ? null
            : state.due_date || (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split('T')[0]! })(),
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
          { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0 },
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

const blankState: EditState = {
  step: 1,
  type: 'invoice',
  line_items: [{ id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0 }],
  vat_enabled: false,
  due_date: null,
  notes: '',
  isSubmitting: false,
}

// ─── Progress indicator ───────────────────────────────────────────────────────

function EditProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center h-8 px-4 gap-0">
      {[1, 2, 3].map((s, i) => (
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

// ─── Client header (read-only) ────────────────────────────────────────────────

function ClientHeader({ client }: { client: InvoiceDetail['client'] }) {
  if (!client) return null
  return (
    <div className="mx-4 mb-3 bg-surface rounded-xl px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
        <span className="text-accent text-sm font-bold">{client.name.charAt(0).toUpperCase()}</span>
      </div>
      <div className="min-w-0">
        <p className="text-text-primary font-semibold truncate">{client.name}</p>
        <p className="text-xs text-text-muted">{client.phoneWhatsapp}</p>
      </div>
    </div>
  )
}

// ─── Step 1 — Line Items ──────────────────────────────────────────────────────

function StepItems({
  state,
  dispatch,
}: {
  state: EditState
  dispatch: React.Dispatch<EditAction>
}) {
  const firstDescRef = useRef<HTMLInputElement>(null)
  const { subtotal, vat, total } = computeTotals(state.line_items, state.vat_enabled)

  function updateField(id: string, field: keyof Omit<LineItem, 'id'>, value: string | number) {
    dispatch({ type: 'UPDATE_LINE_ITEM', id, field, value })
  }

  return (
    <>
      <div className="px-4 pb-[220px]">
        {state.line_items.map((item, idx) => {
          const lineTotal = item.quantity * item.unit_price
          return (
            <div key={item.id} className="bg-surface rounded-xl p-4 mb-3 relative">
              {state.line_items.length > 1 && (
                <button
                  onClick={() => dispatch({ type: 'REMOVE_LINE_ITEM', id: item.id })}
                  className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-danger active:opacity-70"
                  aria-label="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <input
                ref={idx === 0 ? firstDescRef : undefined}
                value={item.description}
                onChange={(e) => updateField(item.id, 'description', e.target.value)}
                placeholder="What did you sell or do?"
                className="w-full h-12 bg-primary rounded-xl px-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30 mb-3"
              />

              <div className="flex gap-3 items-end">
                <div className="flex-shrink-0">
                  <p className="text-xs text-text-muted mb-1.5 text-center">Qty</p>
                  <div className="flex items-center bg-primary rounded-xl overflow-hidden">
                    <button
                      onClick={() => updateField(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                      className="w-9 h-10 flex items-center justify-center text-text-secondary text-lg font-medium active:bg-surface-raised"
                    >
                      −
                    </button>
                    <input
                      value={item.quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!isNaN(v) && v > 0) updateField(item.id, 'quantity', v)
                      }}
                      inputMode="numeric"
                      className="w-10 h-10 bg-transparent text-center text-base font-semibold text-text-primary outline-none"
                    />
                    <button
                      onClick={() => updateField(item.id, 'quantity', item.quantity + 1)}
                      className="w-9 h-10 flex items-center justify-center text-text-secondary text-lg font-medium active:bg-surface-raised"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex-1">
                  <p className="text-xs text-text-muted mb-1.5">Price</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-base font-medium pointer-events-none">
                      R
                    </span>
                    <input
                      value={item.unit_price === 0 ? '' : String(item.unit_price)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '')
                        const v = parseFloat(raw)
                        updateField(item.id, 'unit_price', isNaN(v) ? 0 : v)
                      }}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-full h-10 bg-primary rounded-xl pl-8 pr-3 text-base text-text-primary placeholder:text-text-muted outline-none border border-transparent focus:border-accent/30"
                    />
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs text-text-muted mb-1.5">Total</p>
                  <p className="h-10 flex items-center font-semibold text-text-primary text-sm">
                    {formatZAR(lineTotal)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}

        {/* Add item */}
        <button
          onClick={() => dispatch({ type: 'ADD_LINE_ITEM' })}
          className="w-full bg-surface rounded-xl p-4 border border-dashed border-accent/40 flex items-center gap-3 active:opacity-70 mb-4"
        >
          <Plus className="w-5 h-5 text-accent shrink-0" />
          <span className="text-accent font-medium text-base">Add Item</span>
        </button>

        {/* VAT toggle */}
        <div className="bg-surface rounded-xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-text-primary font-medium">Include VAT (15%)</p>
            {state.vat_enabled && (
              <p className="text-xs text-text-muted mt-0.5">
                Subtotal {formatZAR(subtotal)} + VAT {formatZAR(vat)}
              </p>
            )}
          </div>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_VAT' })}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              state.vat_enabled ? 'bg-accent' : 'bg-surface-raised'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                state.vat_enabled ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Sticky totals + next button */}
      <div
        className="fixed bottom-16 left-0 right-0 bg-primary border-t border-border px-4 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-between items-center mb-3">
          <span className="text-text-muted text-sm">Total</span>
          <span className="font-bold text-accent text-lg">{formatZAR(total)}</span>
        </div>
        <button
          onClick={() => dispatch({ type: 'GO_TO_STEP', step: 2 })}
          className="w-full h-12 bg-accent text-primary font-bold rounded-xl flex items-center justify-center active:bg-accent-hover"
        >
          Next: Details
        </button>
      </div>
    </>
  )
}

// ─── Step 2 — Details ─────────────────────────────────────────────────────────

function StepDetails({
  state,
  dispatch,
}: {
  state: EditState
  dispatch: React.Dispatch<EditAction>
}) {
  const notesRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div className="px-4 pb-[180px] flex flex-col gap-4">
      {/* Invoice / Quote toggle */}
      <div className="bg-surface rounded-xl p-1 flex">
        {(['invoice', 'quote'] as const).map((t) => (
          <button
            key={t}
            onClick={() => dispatch({ type: 'SET_TYPE', invoiceType: t })}
            className={`flex-1 h-10 rounded-lg text-sm font-semibold transition-colors capitalize ${
              state.type === t
                ? 'bg-accent text-primary'
                : 'text-text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Due date (invoices only) */}
      {state.type === 'invoice' && (
        <div>
          <label className={LABEL}>Due Date</label>
          <p className="text-xs text-text-muted mb-1.5">When should this be paid?</p>
          <input
            type="date"
            value={state.due_date ?? ''}
            onChange={(e) => dispatch({ type: 'SET_DUE_DATE', date: e.target.value || null })}
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

      <div
        className="fixed bottom-16 left-0 right-0 px-4 pt-3 bg-primary border-t border-border"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => dispatch({ type: 'GO_TO_STEP', step: 3 })}
          className="w-full h-12 bg-accent text-primary font-bold rounded-xl flex items-center justify-center active:bg-accent-hover"
        >
          Review
        </button>
      </div>
    </div>
  )
}

// ─── Step 3 — Review ─────────────────────────────────────────────────────────

function StepReview({
  state,
  client,
  invoiceNumber,
  onSave,
}: {
  state: EditState
  client: InvoiceDetail['client']
  invoiceNumber: string
  onSave: () => Promise<void>
}) {
  const { subtotal, vat, total } = computeTotals(state.line_items, state.vat_enabled)

  return (
    <>
      <div className="px-4 pb-[160px]">
        <div className="bg-surface rounded-xl p-5">
          {/* Invoice number */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-text-muted uppercase tracking-wider">{invoiceNumber}</span>
            <span className="text-xs text-text-muted capitalize">{state.type}</span>
          </div>

          {/* To */}
          {client && (
            <>
              <p className="text-xs uppercase tracking-wider text-text-muted mb-2">To</p>
              <p className="font-semibold text-text-primary">{client.name}</p>
              <p className="text-sm text-text-secondary mt-0.5">{client.phoneWhatsapp}</p>
              {client.email && (
                <p className="text-sm text-text-muted mt-0.5">{client.email}</p>
              )}
              <div className="border-t border-border my-4" />
            </>
          )}

          {/* Line items */}
          <div className="flex flex-col gap-3">
            {state.line_items.map((item) => (
              <div key={item.id} className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">
                    {item.description || 'Unnamed item'}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {item.quantity} × {formatZAR(item.unit_price)}
                  </p>
                </div>
                <p className="text-text-primary text-sm font-medium shrink-0">
                  {formatZAR(item.quantity * item.unit_price)}
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
                  {formatDate(state.due_date)}
                </p>
              )}
              {state.notes && (
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{state.notes}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className="fixed bottom-16 left-0 right-0 bg-primary border-t border-border px-4 pt-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={onSave}
          disabled={state.isSubmitting}
          className="w-full h-12 bg-accent text-primary font-bold rounded-xl flex items-center justify-center active:bg-accent-hover disabled:opacity-60"
        >
          {state.isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvoiceEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [state, dispatch] = useReducer(editReducer, blankState)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [invoiceData, setInvoiceData] = useState<InvoiceDetail | null>(null)

  useEffect(() => {
    if (!id) return
    api
      .get<InvoiceDetail>(`/api/invoices/${id}`)
      .then(({ data }) => {
        if (data.status !== 'draft') {
          showToast('Only draft invoices can be edited', 'error')
          navigate(`/invoices/${id}`)
          return
        }
        setInvoiceData(data)
        dispatch({
          type: 'INIT',
          state: {
            type: (data.type as 'invoice' | 'quote') ?? 'invoice',
            line_items: data.lineItems.map((item) => ({
              id: item.id,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unitPrice,
            })),
            vat_enabled: data.vatRate > 0,
            due_date: data.dueDate ?? null,
            notes: data.notes ?? '',
          },
        })
      })
      .catch(() => setFetchError('Invoice not found'))
      .finally(() => setFetchLoading(false))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    if (!id || !invoiceData) return

    const clientId = invoiceData.clientId ?? invoiceData.client?.id ?? null
    if (!clientId) {
      showToast('Cannot save: the client for this invoice no longer exists', 'error')
      return
    }

    dispatch({ type: 'SET_SUBMITTING', value: true })
    try {
      await api.put(`/api/invoices/${id}`, {
        clientId,
        type: state.type,
        vatEnabled: state.vat_enabled,
        dueDate: state.due_date ?? null,
        notes: state.notes || null,
        lineItems: state.line_items.map((item, idx) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          sortOrder: idx,
        })),
      })
      showToast('Invoice updated', 'success')
      navigate(`/invoices/${id}`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      showToast(e?.response?.data?.error ?? 'Failed to save', 'error')
      dispatch({ type: 'SET_SUBMITTING', value: false })
    }
  }, [id, invoiceData, state, navigate, showToast])

  // ── Step titles ──

  const stepTitles: Record<number, string> = {
    1: 'Edit Items',
    2: 'Details',
    3: 'Review',
  }

  // ── Loading / error ──

  if (fetchLoading) {
    return (
      <div className="px-4 pt-4 flex flex-col gap-3">
        <LoadingSkeleton height="h-10" />
        <LoadingSkeleton height="h-[280px]" />
        <LoadingSkeleton height="h-[100px]" />
      </div>
    )
  }

  if (fetchError || !invoiceData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 px-8 text-center">
        <p className="text-text-primary font-bold">Invoice not found</p>
        <button onClick={() => navigate('/invoices')} className="text-accent text-sm underline">
          Back to Invoices
        </button>
      </div>
    )
  }

  // ── Handle back ──

  function handleBack() {
    if (state.step === 1) {
      navigate(`/invoices/${id}`)
    } else {
      dispatch({ type: 'GO_TO_STEP', step: (state.step - 1) as 1 | 2 | 3 })
    }
  }

  return (
    <div>
      <EditProgress step={state.step} />
      <PageHeader
        title={stepTitles[state.step] ?? 'Edit Invoice'}
        showBack
        onBack={handleBack}
      />

      <ClientHeader client={invoiceData.client} />

      {state.step === 1 && <StepItems state={state} dispatch={dispatch} />}
      {state.step === 2 && <StepDetails state={state} dispatch={dispatch} />}
      {state.step === 3 && (
        <StepReview
          state={state}
          client={invoiceData.client}
          invoiceNumber={invoiceData.invoiceNumber}
          onSave={handleSave}
        />
      )}
    </div>
  )
}