import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

const inFlight = new Map<string, Promise<any>>()

export function useApi<T>(url: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    let promise = inFlight.get(url)
    if (!promise) {
      promise = api.get(url).then((res) => res.data)
      inFlight.set(url, promise)
      promise.finally(() => setTimeout(() => inFlight.delete(url), 100))
    }

    try {
      const data = await promise
      setData(data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e?.response?.data?.error ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    if (enabled) refetch()
  }, [enabled, refetch])

  return { data, loading, error, refetch }
}