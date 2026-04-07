import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Module-level state — injected by AuthContext to avoid circular imports
let _accessToken: string | null = null
let _onLogout: (() => void) | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

export function setLogoutHandler(handler: () => void) {
  _onLogout = handler
}

const api = axios.create({ baseURL: BASE_URL })

// Attach bearer token to every request
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`
  }
  return config
})

// Handle 401 — attempt refresh, retry once, else logout
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    original._retry = true

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(api(original))
        })
      })
    }

    isRefreshing = true

    try {
      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) throw new Error('no refresh token')

      const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken })
      const newToken: string = data.accessToken
      _accessToken = newToken

      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken)
      }

      refreshQueue.forEach((cb) => cb(newToken))
      refreshQueue = []

      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    } catch {
      localStorage.removeItem('refreshToken')
      _accessToken = null
      refreshQueue = []
      _onLogout?.()
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  },
)

export default api
