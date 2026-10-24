import { auth } from '@/lib/firebase/auth'
import { Visit } from '@/lib/types'
import type { CreateVisitInput } from '@/app/api/admin/visits/route'

export type { CreateVisitInput }

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

export interface GetVisitsParams {
  customerId?: string
  locationId?: string
  cursor?: string
  limit?: number
}

export interface GetVisitsResponse {
  success: boolean
  visits: Visit[]
  nextCursor: string | null
}

export type LogVisitInput = CreateVisitInput

export interface LogVisitResponse {
  success: boolean
  visit: Visit
}

export interface UpdateVisitInput {
  note?: string
  followUpOn?: string | null
  followUpDone?: boolean
}

export interface UpdateVisitResponse {
  success: boolean
  visit: Visit
}

/**
 * Fetches paginated visits with optional filters.
 */
export async function getVisits(params?: GetVisitsParams): Promise<GetVisitsResponse> {
  const headers = await getAuthHeaders()
  const search = new URLSearchParams()
  if (params?.customerId) search.set('customerId', params.customerId)
  if (params?.locationId) search.set('locationId', params.locationId)
  if (params?.cursor) search.set('cursor', params.cursor)
  if (params?.limit) search.set('limit', String(params.limit))

  const qs = search.toString()
  const res = await fetch(`/api/admin/visits${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to fetch visits (${res.status})`)
  }

  return res.json()
}

/**
 * Logs a new customer visit or interaction.
 */
export async function logVisit(payload: CreateVisitInput): Promise<LogVisitResponse> {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/admin/visits', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to log visit (${res.status})`)
  }

  return res.json()
}

/**
 * Updates a visit record (e.g. marking follow-up done or editing notes).
 */
export async function updateVisit(visitId: string, payload: UpdateVisitInput): Promise<UpdateVisitResponse> {
  const headers = await getAuthHeaders()
  const res = await fetch(`/api/admin/visits/${encodeURIComponent(visitId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to update visit (${res.status})`)
  }

  return res.json()
}
