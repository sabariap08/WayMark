const BASE = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
const TOKEN_KEY = 'waymark_token'

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable */
  }
}

function queryString(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, value)
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const init = {
    method: options.method || 'GET',
    headers,
    credentials: 'same-origin',
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  const response = await fetch(BASE + path, init)
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '')

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      setToken(null)
      window.dispatchEvent(new Event('waymark:unauthorized'))
    }
    const message =
      (data && data.message) ||
      (typeof data === 'string' && data) ||
      `Request failed with status ${response.status}`
    throw new ApiError(message, response.status, data)
  }

  return data
}

const get = (path, params) => request(path + queryString(params))
const post = (path, body) => request(path, { method: 'POST', body: body ?? {} })
const put = (path, body) => request(path, { method: 'PUT', body: body ?? {} })
const del = (path) => request(path, { method: 'DELETE' })

export const api = {
  auth: {
    login: async (identifier, password) => {
      const data = await post('/auth/login', { email: identifier, password })
      if (data?.token) setToken(data.token)
      return data
    },
    signup: async (payload) => {
      const data = await post('/auth/signup', payload)
      if (data?.token) setToken(data.token)
      return data
    },
    logout: async () => {
      try {
        await post('/auth/logout')
      } finally {
        setToken(null)
      }
    },
    me: () => get('/auth/me'),
  },
  dashboard: {
    overview: () => get('/dashboard'),
  },
  events: {
    list: (params) => get('/events', params),
    get: (id) => get(`/events/${encodeURIComponent(id)}`),
    registrations: (id, params) => get(`/events/${encodeURIComponent(id)}/registrations`, params),
    attendance: (id, params) => get(`/events/${encodeURIComponent(id)}/attendance`, params),
    results: (id, params) => get(`/events/${encodeURIComponent(id)}/results`, params),
    create: (payload) => post('/events', payload),
    update: (id, payload) => put(`/events/${encodeURIComponent(id)}`, payload),
  },
  registrations: {
    list: (params) => get('/registrations', params),
    create: (payload) => post('/registrations', payload),
    cancel: (id) => del(`/registrations/${encodeURIComponent(id)}`),
  },
  meta: {
    get: () => get('/meta'),
  },
}

export function errorMessage(error) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
