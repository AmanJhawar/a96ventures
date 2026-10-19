/**
 * Date & Timezone Utilities for Asia/Kolkata (IST)
 * 
 * In bullion and jewelry retail in India, all operational records, sales,
 * purchases, movements, and audit sessions must follow Indian Standard Time (IST - UTC+5:30).
 * Using UTC toISOString().split('T')[0] causes operations conducted between midnight
 * and 05:30 AM IST to fall on the previous day.
 */

export const TIMEZONE_IST = 'Asia/Kolkata'

/**
 * Formats a Date object, timestamp, or date string into YYYY-MM-DD according to Asia/Kolkata timezone.
 * Defaults to current time if no argument is provided.
 */
export function formatDateIST(input: Date | string | number = new Date()): string {
  const date = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input
  if (isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE_IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value

  if (y && m && d) {
    return `${y}-${m}-${d}`
  }

  // Fallback to en-CA format
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Kolkata.
 */
export function getTodayIST(): string {
  return formatDateIST(new Date())
}

/**
 * Returns yesterday's date formatted as YYYY-MM-DD in Asia/Kolkata.
 */
export function getYesterdayIST(): string {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return formatDateIST(yesterday)
}

/**
 * Returns the date N days ago formatted as YYYY-MM-DD in Asia/Kolkata.
 */
export function getDaysAgoIST(days: number): string {
  const now = new Date()
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return formatDateIST(past)
}

/**
 * Formats a date into human-readable format in Asia/Kolkata (e.g. "18 Oct 2026").
 */
export function formatDisplayDateIST(input: Date | string | number): string {
  if (!input) return ''
  const date = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input
  if (isNaN(date.getTime())) return String(input)

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TIMEZONE_IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

/**
 * Formats a date with time in Asia/Kolkata (e.g. "18 Oct 2026, 06:01 PM IST").
 */
export function formatDateTimeIST(input: Date | string | number): string {
  if (!input) return ''
  const date = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input
  if (isNaN(date.getTime())) return String(input)

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TIMEZONE_IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date) + ' IST'
}

/**
 * Returns the next calendar day in YYYY-MM-DD format (e.g. "2026-03-31" -> "2026-04-01").
 */
export function getNextDayIST(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const nextY = dt.getUTCFullYear()
  const nextM = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const nextD = String(dt.getUTCDate()).padStart(2, '0')
  return `${nextY}-${nextM}-${nextD}`
}

/**
 * Returns the default Indian financial year cutoff date (31 March).
 * If today is before 31 March of the current year, returns last year's 31 March;
 * otherwise returns this year's 31 March (e.g. "2026-03-31").
 */
export function getDefaultFiscalCutoffIST(): string {
  const today = getTodayIST()
  const year = parseInt(today.slice(0, 4), 10)
  const march31ThisYear = `${year}-03-31`
  if (today < march31ThisYear) {
    return `${year - 1}-03-31`
  }
  return march31ThisYear
}

/**
 * Validates that a string is strictly in YYYY-MM-DD format and corresponds to a real calendar date.
 */
export function isValidDateStringIST(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string') return false
  const trimmed = dateStr.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false

  const [yStr, mStr, dStr] = trimmed.split('-')
  const y = parseInt(yStr, 10)
  const m = parseInt(mStr, 10)
  const d = parseInt(dStr, 10)

  if (isNaN(y) || isNaN(m) || isNaN(d)) return false
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false

  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

export interface CutoffValidationResult {
  isValid: boolean
  error?: string
  cutoffDate?: string
}

/**
 * Validates a cutoff date for fiscal year closing / zero-balance run.
 * Rules:
 * - Must be present in strict YYYY-MM-DD format.
 * - Must be a valid calendar date.
 * - Must be on or before today (in IST).
 * - Must be strictly later than the last closed fiscal cutoff date.
 */
export function validateFiscalCutoffDate(
  rawCutoff: unknown,
  lastClosedCutoff: string | null
): CutoffValidationResult {
  if (!rawCutoff || typeof rawCutoff !== 'string' || !rawCutoff.trim()) {
    return {
      isValid: false,
      error: 'Closing fiscal cutoff date is required and must be in YYYY-MM-DD format.'
    }
  }

  const cutoff = rawCutoff.trim()
  if (!isValidDateStringIST(cutoff)) {
    return {
      isValid: false,
      error: `Invalid cutoff date format: "${cutoff}". Cutoff date must be a valid calendar date in YYYY-MM-DD format.`
    }
  }

  const today = getTodayIST()
  if (cutoff > today) {
    return {
      isValid: false,
      error: `Cutoff date (${cutoff}) cannot be in the future. It must be on or before today (${today}).`
    }
  }

  if (lastClosedCutoff && cutoff <= lastClosedCutoff) {
    return {
      isValid: false,
      error: `Refusing run: Cutoff date (${cutoff}) must be strictly later than the last closed cutoff date (${lastClosedCutoff}). Period up to ${lastClosedCutoff} is already closed.`
    }
  }

  return {
    isValid: true,
    cutoffDate: cutoff
  }
}

