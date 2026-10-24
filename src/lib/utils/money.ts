/**
 * Money & Currency Utilities
 * Ensures exact mathematical accuracy when converting between Indian Rupees and Paise.
 * Prevents IEEE-754 binary floating-point drift and enforces strict 2-decimal maximum precision.
 */

/**
 * Converts a Rupee amount (number or string) to integer paise.
 * Rejects any amount with more than 2 decimal places.
 * Handles floating point inaccuracies (e.g. 0.1 + 0.2 -> 30 paise).
 */
export function rupeesToPaise(input: string | number): number {
  if (input === null || input === undefined || input === '') {
    throw new Error('Rupee amount cannot be empty')
  }

  if (typeof input === 'string') {
    const trimmed = input.trim().replace(/,/g, '')
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(`Invalid rupee amount string: "${input}"`)
    }

    const decimalPart = trimmed.split('.')[1]
    if (decimalPart && decimalPart.length > 2) {
      throw new Error(`Rupee amount cannot have more than 2 decimal places: "${input}"`)
    }

    const num = Number(trimmed)
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid rupee amount: "${input}"`)
    }

    return Math.round(num * 100)
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new Error(`Invalid rupee amount: "${input}"`)
    }

    const rounded = Math.round(input * 100)
    // Tolerance for floating point representation drift (e.g. 0.1 + 0.2)
    const diff = Math.abs(input * 100 - rounded)
    if (diff > 1e-5) {
      throw new Error(`Rupee amount cannot have more than 2 decimal places: ${input}`)
    }

    return rounded
  }

  throw new Error('Input must be a number or numeric string')
}

/**
 * Converts integer paise back to a decimal Rupee amount.
 */
export function paiseToRupees(paise: number): number {
  if (!Number.isInteger(paise)) {
    throw new Error(`Paise amount must be an integer: ${paise}`)
  }
  return paise / 100
}

/**
 * Formats integer paise into a localized Indian Rupee currency string (en-IN).
 * Uses 0 to 2 decimals based on whether the amount has fractional rupees.
 */
export function formatINR(paise: number): string {
  if (!Number.isFinite(paise)) {
    return '₹0'
  }
  const rupees = paise / 100
  const hasPaise = paise % 100 !== 0
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2
  })
  return formatter.format(rupees)
}

/**
 * Safely sums an array of integer paise amounts.
 */
export function sumPaise(amounts: number[]): number {
  if (!Array.isArray(amounts)) {
    return 0
  }
  return amounts.reduce((total, amt) => {
    if (!Number.isInteger(amt)) {
      throw new Error(`Cannot sum non-integer paise value: ${amt}`)
    }
    return total + amt
  }, 0)
}

/**
 * Strips commas and non-numeric characters from a rupee string while preserving a single decimal point.
 * Useful for normalizing user input before storing or converting to paise.
 */
export function parseIndianNumberString(val: string | number | null | undefined, maxDecimals = 2): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  let clean = ''
  let hasDot = false
  let decCount = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch >= '0' && ch <= '9') {
      if (!hasDot) {
        clean += ch
      } else if (decCount < maxDecimals) {
        clean += ch
        decCount++
      }
    } else if (ch === '.' && !hasDot) {
      hasDot = true
      clean += '.'
    }
  }
  return clean
}

/**
 * Formats a numeric string or number with Indian numbering grouping (e.g. 15,09,000.50).
 * Preserves trailing dots during user typing (e.g. '150900.' -> '1,50,900.').
 */
export function formatIndianNumberString(
  val: string | number | null | undefined,
  maxDecimals = 2
): string {
  if (val === null || val === undefined || val === '') return ''
  const clean = parseIndianNumberString(val, maxDecimals)
  if (!clean) return ''

  const hasDot = clean.includes('.')
  const parts = clean.split('.')
  const intPart = parts[0]
  const decPart = hasDot ? '.' + (parts[1] || '') : ''

  if (!intPart && hasDot) return '0' + decPart
  if (!intPart) return ''

  const lastThree = intPart.slice(-3)
  const rest = intPart.slice(0, -3)
  if (rest !== '') {
    const formattedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    return formattedRest + ',' + lastThree + decPart
  }
  return lastThree + decPart
}

