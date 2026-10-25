import { auth } from '@/lib/firebase/auth'

/**
 * Standard API error thrown by apiClient on non-2xx responses.
 * Preserves status codes and attaches structured error payload metadata.
 */
export class ApiError extends Error {
  status: number
  code?: string
  data?: Record<string, unknown>
  field?: string
  existingCustomerId?: string
  existingCustomerName?: string
  isArchived?: boolean

  constructor(
    message: string,
    status: number,
    data?: Record<string, unknown> | null,
    code?: string
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.data = data || undefined
    if (data && typeof data === 'object') {
      if (typeof data.field === 'string') this.field = data.field
      if (typeof data.existingCustomerId === 'string') this.existingCustomerId = data.existingCustomerId
      if (typeof data.existingCustomerName === 'string') this.existingCustomerName = data.existingCustomerName
      if (typeof data.isArchived === 'boolean') this.isArchived = data.isArchived
    }
  }
}

/**
 * Retrieves authenticated headers for calling Next.js Admin API routes.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser
  if (!currentUser) {
    throw new Error('Authentication required')
  }
  const token = await currentUser.getIdToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

/**
 * Safely parses response JSON with fallback error messages for non-JSON or HTML error responses.
 */
export async function parseApiResponse<T>(res: Response, fallbackAction = 'request'): Promise<T> {
  let data: Record<string, unknown> | null = null
  let rawText = ''

  if (typeof res.text === 'function') {
    rawText = await res.text()
    if (rawText) {
      try {
        data = JSON.parse(rawText)
      } catch {
        const cleanSnippet = rawText.replace(/<[^>]*>?/gm, '').trim().slice(0, 150)
        throw new ApiError(
          res.ok
            ? 'Invalid server response format'
            : `Server error (${res.status}): ${cleanSnippet || res.statusText || 'Unknown error'}`,
          res.status
        )
      }
    }
  } else if (typeof res.json === 'function') {
    data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  }

  if (!res.ok) {
    let serverMsg: string | undefined
    if (typeof data?.error === 'string' && data.error.trim()) {
      serverMsg = data.error.trim()
    } else if (data?.error && typeof (data.error as Record<string, unknown>).message === 'string') {
      serverMsg = ((data.error as Record<string, unknown>).message as string).trim()
    } else if (typeof data?.message === 'string' && data.message.trim()) {
      serverMsg = data.message.trim()
    } else if (typeof data?.details === 'string' && data.details.trim()) {
      serverMsg = data.details.trim()
    }
    const errMsg = serverMsg || `Failed to ${fallbackAction} (${res.status})`
    const errCode = typeof data?.code === 'string' ? data.code : undefined
    throw new ApiError(errMsg, res.status, data, errCode)
  }

  return (data || {}) as T
}

export type QueryParams = Record<string, unknown> | object

/**
 * Serializes a query object, stripping undefined and null keys.
 */
export function buildQueryString(params?: QueryParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      search.set(key, String(val))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export interface RequestOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
  actionName?: string
}

/**
 * Unified deep HTTP client adapter for A96 Admin API routes.
 * Encapsulates Firebase ID token lifecycle, URL parameter serialization,
 * and robust error normalization behind a small, consistent interface.
 */
export const apiClient = {
  async get<T>(path: string, params?: QueryParams, options?: RequestOptions): Promise<T> {
    const headers = await getAuthHeaders()
    const url = `${path}${buildQueryString(params)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, ...options?.headers },
      signal: options?.signal
    })
    return parseApiResponse<T>(res, options?.actionName || 'fetch')
  },

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(path, {
      method: 'POST',
      headers: { ...headers, ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal
    })
    return parseApiResponse<T>(res, options?.actionName || 'submit')
  },

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(path, {
      method: 'PUT',
      headers: { ...headers, ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal
    })
    return parseApiResponse<T>(res, options?.actionName || 'update')
  },

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(path, {
      method: 'PATCH',
      headers: { ...headers, ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal
    })
    return parseApiResponse<T>(res, options?.actionName || 'patch')
  },

  async delete<T>(path: string, paramsOrBody?: QueryParams | unknown, options?: RequestOptions): Promise<T> {
    const headers = await getAuthHeaders()
    let url = path
    let body: string | undefined = undefined

    if (paramsOrBody !== undefined && paramsOrBody !== null) {
      if (typeof paramsOrBody === 'object' && !Array.isArray(paramsOrBody)) {
        const isPrimitiveMap = Object.values(paramsOrBody).every(
          (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === undefined || v === null
        )
        if (isPrimitiveMap && !path.includes('?')) {
          url = `${path}${buildQueryString(paramsOrBody as QueryParams)}`
        } else {
          body = JSON.stringify(paramsOrBody)
        }
      } else {
        body = JSON.stringify(paramsOrBody)
      }
    }

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { ...headers, ...options?.headers },
      body,
      signal: options?.signal
    })
    return parseApiResponse<T>(res, options?.actionName || 'delete')
  }
}
