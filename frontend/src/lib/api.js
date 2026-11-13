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
const patch = (path, body) => request(path, { method: 'PATCH', body: body ?? {} })
const del = (path) => request(path, { method: 'DELETE' })

function filenameFromDisposition(header, fallback) {
  if (!header) return fallback
  const match = header.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)
  return match ? decodeURIComponent(match[1].replace(/"/g, '')) : fallback
}

async function download(path, fallbackName) {
  const headers = { Accept: '*/*' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(BASE + path, { headers, credentials: 'same-origin' })
  if (!response.ok) {
    let data = null
    try {
      data = await response.json()
    } catch {
      /* non-json error */
    }
    throw new ApiError(
      (data && data.message) || `Download failed with status ${response.status}`,
      response.status,
      data,
    )
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filenameFromDisposition(response.headers.get('content-disposition'), fallbackName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return link.download
}

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
    requestPasswordReset: (email) => post('/auth/password-reset', { email }),
    confirmPasswordReset: (payload) => post('/auth/password-reset/confirm', payload),
  },
  dashboard: {
    overview: () => get('/dashboard'),
  },
  events: {
    list: (params) => get('/events', params),
    get: (id) => get(`/events/${encodeURIComponent(id)}`),
    registrations: (id, params) => get(`/events/${encodeURIComponent(id)}/registrations`, params),
    participants: (id) => get(`/events/${encodeURIComponent(id)}/participants`),
    attendance: (id, params) => get(`/events/${encodeURIComponent(id)}/attendance`, params),
    results: (id, params) => get(`/events/${encodeURIComponent(id)}/results`, params),
    eligibility: (id) => get(`/events/${encodeURIComponent(id)}/certificates/eligibility`),
    issueEligible: (id, payload) =>
      post(`/events/${encodeURIComponent(id)}/certificates/issue-eligible`, payload),
    generateCertificates: (id, payload) =>
      post(`/events/${encodeURIComponent(id)}/certificates/generate`, payload),
    create: (payload) => post('/events', payload),
    update: (id, payload) => put(`/events/${encodeURIComponent(id)}`, payload),
  },
  hosting: {
    list: (params) => get('/hosting-requests', params),
    get: (id) => get(`/hosting-requests/${encodeURIComponent(id)}`),
    create: (payload) => post('/hosting-requests', payload),
    update: (id, payload) => put(`/hosting-requests/${encodeURIComponent(id)}`, payload),
    approve: (id, payload) => post(`/hosting-requests/${encodeURIComponent(id)}/approve`, payload),
    reject: (id, payload) => post(`/hosting-requests/${encodeURIComponent(id)}/reject`, payload),
    requestChanges: (id, payload) =>
      post(`/hosting-requests/${encodeURIComponent(id)}/request-changes`, payload),
    cancel: (id) => post(`/hosting-requests/${encodeURIComponent(id)}/cancel`),
    resubmit: (id, payload) => post(`/hosting-requests/${encodeURIComponent(id)}/resubmit`, payload),
  },
  registrations: {
    list: (params) => get('/registrations', params),
    mine: () => get('/me/registrations'),
    create: (payload) => post('/registrations', payload),
    cancel: (id) => del(`/registrations/${encodeURIComponent(id)}`),
    checkIn: (payload) => post('/checkin', payload),
  },
  certificates: {
    list: (params) => get('/certificates', params),
    mine: () => get('/me/certificates'),
    issue: (payload) => post('/certificates/issue', payload),
    withdraw: (id, payload) => post(`/certificates/${encodeURIComponent(id)}/withdraw`, payload),
    verify: (credentialId) => get(`/verify/${encodeURIComponent(credentialId)}`),
  },
  schedule: {
    get: (eventId) => get(`/events/${encodeURIComponent(eventId)}/schedule`),
    conflicts: (eventId, params) => get(`/events/${encodeURIComponent(eventId)}/conflicts`, params),
  },
  volunteers: {
    list: (params) => get('/volunteers', params),
    create: (payload) => post('/volunteers', payload),
    update: (id, payload) => patch(`/volunteers/${encodeURIComponent(id)}`, payload),
    invite: (id) => post(`/volunteers/${encodeURIComponent(id)}/invite`),
    remove: (id) => del(`/volunteers/${encodeURIComponent(id)}`),
  },
  tasks: {
    list: (eventId, params) => get(`/events/${encodeURIComponent(eventId)}/tasks`, params),
    create: (eventId, payload) => post(`/events/${encodeURIComponent(eventId)}/tasks`, payload),
    update: (id, payload) => put(`/tasks/${encodeURIComponent(id)}`, payload),
    assign: (id, payload) => post(`/tasks/${encodeURIComponent(id)}/assign`, payload),
    remove: (id) => del(`/tasks/${encodeURIComponent(id)}`),
  },
  budget: {
    summary: (eventId) => get(`/events/${encodeURIComponent(eventId)}/budget/summary`),
    categories: (eventId) => get(`/events/${encodeURIComponent(eventId)}/budget/categories`),
    lines: (eventId, params) => get(`/events/${encodeURIComponent(eventId)}/budget/lines`, params),
    createCategory: (eventId, payload) =>
      post(`/events/${encodeURIComponent(eventId)}/budget/categories`, payload),
    createLine: (eventId, payload) =>
      post(`/events/${encodeURIComponent(eventId)}/budget/lines`, payload),
    updateLine: (id, payload) => patch(`/budget/lines/${encodeURIComponent(id)}`, payload),
    removeLine: (id) => del(`/budget/lines/${encodeURIComponent(id)}`),
    sponsors: (eventId) => get(`/events/${encodeURIComponent(eventId)}/sponsors`),
  },
  analytics: {
    event: (eventId) => get(`/analytics/events/${encodeURIComponent(eventId)}`),
    compare: (eventIdA, eventIdB) => get('/analytics/compare', { eventIdA, eventIdB }),
  },
  reports: {
    download: (eventId, kind, format = 'csv') =>
      download(
        `/events/${encodeURIComponent(eventId)}/reports/${encodeURIComponent(kind)}?format=${format}`,
        `${kind}.${format}`,
      ),
  },
  audit: {
    list: (params) => get('/audit-logs', params),
  },
  admin: {
    users: (params) => get('/admin/users', params),
    audit: (params) => get('/admin/audit', params),
    settings: () => get('/admin/settings'),
    updateSettings: (payload) => patch('/admin/settings', payload),
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
