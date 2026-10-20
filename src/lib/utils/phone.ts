export interface NormalisedMobile {
  countryCode: string
  number: string
  e164: string
}

export type MobileNormaliseResult =
  | { success: true; data: NormalisedMobile }
  | { success: false; error: string }

/**
 * Normalises an input mobile number into E.164 format and validates formatting.
 * Default country code is +91.
 * For +91:
 *  - Strips spaces, dashes, dots, and parentheses
 *  - Strips duplicated +91 / 91 prefix
 *  - Strips a leading 0 (e.g. 09876543210 -> 9876543210)
 *  - Requires exactly 10 digits starting with 6, 7, 8, or 9
 */
export function normaliseMobile(countryCodeInput?: string | null, rawInput?: string | null): MobileNormaliseResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return { success: false, error: 'Mobile number is required' }
  }

  let code = (countryCodeInput || '+91').trim()
  if (!code.startsWith('+')) {
    code = `+${code}`
  }

  // Strip all whitespace, dashes, parentheses, dots
  let cleaned = rawInput.replace(/[\s\-\(\)\.]+/g, '').trim()

  if (!cleaned) {
    return { success: false, error: 'Mobile number cannot be empty' }
  }

  if (code === '+91') {
    // Strip leading '+' if user typed +91...
    if (cleaned.startsWith('+91')) {
      cleaned = cleaned.slice(3)
    } else if (cleaned.startsWith('0091')) {
      cleaned = cleaned.slice(4)
    } else if (cleaned.startsWith('91') && cleaned.length > 10) {
      cleaned = cleaned.slice(2)
    }

    // Strip leading '0' (e.g. 09876543210 -> 9876543210)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1)
    }

    // Validate digits only
    if (!/^\d+$/.test(cleaned)) {
      return { success: false, error: 'Mobile number must contain digits only' }
    }

    // Must be exactly 10 digits
    if (cleaned.length !== 10) {
      return {
        success: false,
        error: `Indian mobile number must be exactly 10 digits (received ${cleaned.length})`
      }
    }

    // Must start with 6, 7, 8, or 9
    if (!/^[6-9]/.test(cleaned)) {
      return {
        success: false,
        error: 'Indian mobile number must start with 6, 7, 8, or 9'
      }
    }

    return {
      success: true,
      data: {
        countryCode: '+91',
        number: cleaned,
        e164: `+91${cleaned}`
      }
    }
  }

  // Non-+91 country codes
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1)
  }
  const codeDigits = code.slice(1)
  if (cleaned.startsWith(codeDigits)) {
    cleaned = cleaned.slice(codeDigits.length)
  }

  if (!/^\d+$/.test(cleaned)) {
    return { success: false, error: 'Mobile number must contain digits only' }
  }

  if (cleaned.length < 6 || cleaned.length > 15) {
    return {
      success: false,
      error: `Invalid mobile number length: must be between 6 and 15 digits (received ${cleaned.length})`
    }
  }

  return {
    success: true,
    data: {
      countryCode: code,
      number: cleaned,
      e164: `${code}${cleaned}`
    }
  }
}
