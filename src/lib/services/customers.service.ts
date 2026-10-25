import { apiClient, getAuthHeaders } from '@/lib/api-client'
import { Customer } from '@/lib/types'

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
  const queryParams = {
    ...params,
    lastVisit: params?.lastVisit && params.lastVisit !== 'all' ? params.lastVisit : undefined,
    hasFollowUp: params?.hasFollowUp ? 'true' : undefined
  }
  return apiClient.get<GetCustomersResponse>('/api/admin/customers', queryParams, { actionName: 'fetch customers' })
}

/**
 * Fetches a single customer's full profile plus recent orders and visits.
 */
export async function getCustomerById(
  id: string,
  options?: { allowArchived?: boolean }
): Promise<CustomerDetailResponse> {
  const queryParams = options?.allowArchived ? { allowArchived: 'true' } : undefined
  return apiClient.get<CustomerDetailResponse>(`/api/admin/customers/${encodeURIComponent(id)}`, queryParams, {
    actionName: 'fetch customer profile'
  })
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
  return apiClient.post<{ success: boolean; customer: Customer }>('/api/admin/customers', data, {
    actionName: 'create customer'
  })
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
  return apiClient.patch<{ success: boolean; customer: Customer }>(`/api/admin/customers/${encodeURIComponent(id)}`, data, {
    actionName: 'update customer'
  })
}

/**
 * Soft archives a customer profile.
 */
export async function archiveCustomer(id: string): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(`/api/admin/customers/${encodeURIComponent(id)}`, undefined, {
    actionName: 'archive customer'
  })
}

/**
 * Restores an archived customer profile and re-reserves their mobile number.
 */
export async function restoreCustomer(id: string): Promise<{ success: boolean; customer: Customer }> {
  return apiClient.post<{ success: boolean; customer: Customer }>(
    `/api/admin/customers/${encodeURIComponent(id)}/restore`,
    undefined,
    { actionName: 'restore customer' }
  )
}

/**
 * Updates or sets a customer's encrypted PAN.
 */
export async function updateCustomerPan(
  id: string,
  pan: string
): Promise<{ success: boolean; customer: Customer }> {
  return apiClient.put<{ success: boolean; customer: Customer }>(
    `/api/admin/customers/${encodeURIComponent(id)}/pan`,
    { pan },
    { actionName: 'update PAN' }
  )
}

/**
 * Removes a customer's encrypted PAN.
 */
export async function removeCustomerPan(id: string): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(`/api/admin/customers/${encodeURIComponent(id)}/pan`, undefined, {
    actionName: 'remove PAN'
  })
}

/**
 * Temporarily reveals the customer's full unmasked PAN.
 * Audited and rate-limited to 10 reveals per user per hour.
 */
export async function revealCustomerPan(id: string): Promise<{ fullPan: string }> {
  const data = await apiClient.post<{ fullPan: string }>(
    `/api/admin/customers/${encodeURIComponent(id)}/pan/reveal`,
    undefined,
    { actionName: 'reveal PAN' }
  )
  return { fullPan: data.fullPan }
}

/**
 * Downloads a complete CSV export of the customer directory.
 * Super Admin only. Contains masked PANs only.
 */
export async function exportCustomersCSV(): Promise<{ count: number }> {
  const headers = await getAuthHeaders().catch(() => ({} as Record<string, string>))
  const res = await fetch('/api/admin/customers/export', { headers })

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
