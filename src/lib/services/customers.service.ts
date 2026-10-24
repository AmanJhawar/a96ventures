import { auth } from '@/lib/firebase/auth'
import { Customer } from '@/lib/types'

async function getAuthHeaders(): Promise<Record<string, string>> {
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

export interface GetCustomersParams {
  q?: string
  cursor?: string
  limit?: number
  lastVisit?: string
  hasFollowUp?: boolean
}

export interface GetCustomersResponse {
  success: boolean
  customers: Customer[]
  nextCursor: string | null
  hasMore: boolean
}

export interface CustomerDetailResponse {
  success: boolean
  customer: Customer
  orders: Record<string, unknown>[]
  visits: Record<string, unknown>[]
}

/**
 * Fetches paginated customers with optional keyword/mobile search query, lastVisit, and hasFollowUp filters.
 */
export async function getCustomers(params?: GetCustomersParams): Promise<GetCustomersResponse> {
  const headers = await getAuthHeaders()
  const search = new URLSearchParams()
  if (params?.q) search.set('q', params.q)
  if (params?.cursor) search.set('cursor', params.cursor)
  if (params?.limit) search.set('limit', String(params.limit))
  if (params?.lastVisit && params.lastVisit !== 'all') search.set('lastVisit', params.lastVisit)
  if (params?.hasFollowUp) search.set('hasFollowUp', 'true')

  const qs = search.toString()
  const res = await fetch(`/api/admin/customers${qs ? `?${qs}` : ''}`, { headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to fetch customers (${res.status})`)
  }

  return res.json()
}

/**
 * Fetches a single customer's full profile plus recent orders and visits.
 */
export async function getCustomerById(
  id: string,
  options?: { allowArchived?: boolean }
): Promise<CustomerDetailResponse> {
  const headers = await getAuthHeaders()
  const url = options?.allowArchived
    ? `/api/admin/customers/${id}?allowArchived=true`
    : `/api/admin/customers/${id}`
  const res = await fetch(url, { headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to fetch customer profile (${res.status})`)
  }

  return res.json()
}

/**
 * Creates a new customer profile.
 */
export async function createCustomer(data: {
  firstName: string
  middleName?: string
  lastName: string
  countryCode?: string
  mobile: string
  email?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    pincode?: string
    country?: 'India'
  }
  pan?: string
  notes?: string
  source?: 'walk_in' | 'inquiry' | 'referral' | 'import'
  inquiryId?: string
}): Promise<{ success: boolean; customer: Customer }> {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/admin/customers', {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const errorObj = new Error(err.error || `Failed to create customer (${res.status})`) as Error & {
      field?: string
      existingCustomerId?: string
      existingCustomerName?: string
      isArchived?: boolean
    }
    errorObj.field = err.field
    errorObj.existingCustomerId = err.existingCustomerId
    errorObj.existingCustomerName = err.existingCustomerName
    errorObj.isArchived = err.isArchived
    throw errorObj
  }

  return res.json()
}

/**
 * Updates an existing customer's contact or address profile.
 */
export async function updateCustomer(
  id: string,
  data: {
    firstName?: string
    middleName?: string | null
    lastName?: string
    countryCode?: string
    mobile?: string
    email?: string | null
    address?: Record<string, unknown> | null
    notes?: string | null
    source?: 'walk_in' | 'inquiry' | 'referral' | 'import'
  }
): Promise<{ success: boolean; customer: Customer }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/customers/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const errorObj = new Error(err.error || `Failed to update customer (${res.status})`) as Error & {
      field?: string
      existingCustomerId?: string
      existingCustomerName?: string
      isArchived?: boolean
    }
    errorObj.field = err.field
    errorObj.existingCustomerId = err.existingCustomerId
    errorObj.existingCustomerName = err.existingCustomerName
    errorObj.isArchived = err.isArchived
    throw errorObj
  }

  return res.json()
}

/**
 * Soft archives a customer profile.
 */
export async function archiveCustomer(id: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/customers/${id}`, {
    method: 'DELETE',
    headers
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to archive customer (${res.status})`)
  }

  return res.json()
}

/**
 * Restores an archived customer profile and re-reserves their mobile number.
 */
export async function restoreCustomer(id: string): Promise<{ success: boolean; customer: Customer }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/customers/${id}/restore`, {
    method: 'POST',
    headers
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const errorObj = new Error(err.error || `Failed to restore customer (${res.status})`) as Error & {
      field?: string
      existingCustomerId?: string
      existingCustomerName?: string
      isArchived?: boolean
    }
    errorObj.field = err.field
    errorObj.existingCustomerId = err.existingCustomerId
    errorObj.existingCustomerName = err.existingCustomerName
    errorObj.isArchived = err.isArchived
    throw errorObj
  }

  return res.json()
}

/**
 * Updates or sets a customer's encrypted PAN.
 */
export async function updateCustomerPan(
  id: string,
  pan: string
): Promise<{ success: boolean; customer: Customer }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/customers/${id}/pan`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ pan })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const errorObj = new Error(err.error || `Failed to update PAN (${res.status})`) as Error & {
      field?: string
      existingCustomerId?: string
    }
    errorObj.field = err.field
    errorObj.existingCustomerId = err.existingCustomerId
    throw errorObj
  }

  return res.json()
}

/**
 * Removes a customer's encrypted PAN.
 */
export async function removeCustomerPan(id: string): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/customers/${id}/pan`, {
    method: 'DELETE',
    headers
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to remove PAN (${res.status})`)
  }

  return res.json()
}

/**
 * Temporarily reveals the customer's full unmasked PAN.
 * Audited and rate-limited to 10 reveals per user per hour.
 */
export async function revealCustomerPan(id: string): Promise<{ fullPan: string }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/customers/${id}/pan/reveal`, {
    method: 'POST',
    headers
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to reveal PAN (${res.status})`)
  }

  const data = await res.json()
  return { fullPan: data.fullPan }
}

/**
 * Downloads a complete CSV export of the customer directory.
 * Super Admin only. Contains masked PANs only.
 */
export async function exportCustomersCSV(): Promise<{ count: number }> {
  const currentUser = auth.currentUser
  const token = currentUser ? await currentUser.getIdToken() : ''

  const res = await fetch('/api/admin/customers/export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to export customer directory (${res.status})`)
  }

  const countHeader = res.headers.get('X-Total-Count')
  const count = countHeader ? parseInt(countHeader, 10) : 0

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `a96-customers-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return { count }
}
