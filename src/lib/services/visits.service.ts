import { apiClient } from '@/lib/api-client'
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

/**
 * Fetches paginated visits with optional filters.
 */
export async function getVisits(params?: GetVisitsParams): Promise<GetVisitsResponse> {
  return apiClient.get<GetVisitsResponse>('/api/admin/visits', params, { actionName: 'fetch visits' })
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
