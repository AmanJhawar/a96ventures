import { apiClient, ApiError } from '@/lib/api-client'
import { db } from '@/lib/firebase/config'
import { collection, getDocs } from 'firebase/firestore/lite'
import { Visit } from '@/lib/types'
import type { CreateVisitInput } from '@/app/api/admin/visits/route'

export type { CreateVisitInput }

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

function shouldFallback(err: unknown): boolean {
  if (err instanceof Error && err.message === 'Authentication required') {
    return false
  }
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 0
  }
  return true
}

/**
 * Fetches paginated visits with optional filters.
 */
export async function getVisits(params?: GetVisitsParams): Promise<GetVisitsResponse> {
  try {
    return await apiClient.get<GetVisitsResponse>('/api/admin/visits', params, { actionName: 'fetch visits' })
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Visits API failed, falling back to direct Firestore:', err)
    const snap = await getDocs(collection(db, 'visits'))
    const visits: Visit[] = []
    snap.forEach((d) => {
      const data = d.data()
      if (params?.customerId && data.customerId !== params.customerId) return
      if (params?.locationId && data.locationId !== params.locationId) return
      visits.push({ id: d.id, ...data } as Visit)
    })
    visits.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    const limit = params?.limit ? Number(params.limit) : 50
    const paged = visits.slice(0, limit)
    return {
      success: true,
      visits: paged,
      nextCursor: visits.length > limit ? paged[paged.length - 1].id : null
    }
  }
}

/**
 * Logs a new customer visit or interaction.
 */
export async function logVisit(payload: CreateVisitInput): Promise<LogVisitResponse> {
  return apiClient.post<LogVisitResponse>('/api/admin/visits', payload, { actionName: 'log visit' })
}

/**
 * Updates a visit record (e.g. marking follow-up done or editing notes).
 */
export async function updateVisit(visitId: string, payload: UpdateVisitInput): Promise<UpdateVisitResponse> {
  return apiClient.patch<UpdateVisitResponse>(
    `/api/admin/visits/${encodeURIComponent(visitId)}`,
    payload,
    { actionName: 'update visit' }
  )
}
