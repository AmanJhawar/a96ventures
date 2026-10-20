/**
 * Statutory Indian PAN Utilities (Format, Normalisation, Masking, Holder Type)
 * Safe for both Client Components and Server code (no server-only / crypto dependencies).
 */

/**
 * Normalises a PAN string by stripping all whitespace and converting to uppercase.
 */
export function normalisePan(pan?: string | null): string {
  if (!pan || typeof pan !== 'string') return ''
  return pan.replace(/\s+/g, '').toUpperCase()
}

/**
 * Validates whether a PAN conforms to the statutory Indian Income Tax format:
 * 5 uppercase letters, 4 digits, 1 uppercase letter (e.g. ABCDE1234F).
 */
export function isValidPan(pan?: string | null): boolean {
  if (!pan) return false
  const normalised = normalisePan(pan)
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalised)
}

/**
 * Extracts the 4th character of a valid PAN representing the holder status:
 * P = Individual, C = Company, H = Hindu Undivided Family, F = Firm, A = Association,
 * T = Trust, B = Body of Individuals, L = Local Authority, J = Artificial Juridical Person, G = Government.
 */
export function panHolderType(pan: string): string {
  const normalised = normalisePan(pan)
  if (!isValidPan(normalised)) {
    throw new Error('Invalid PAN: cannot extract holder type')
  }
  return normalised[3]
}

/**
 * Returns a display-masked PAN (e.g. "•••••1234F").
 * The full PAN is never exposed on ordinary displays.
 */
export function maskPan(pan?: string | null): string {
  if (!pan) return ''
  const normalised = normalisePan(pan)
  if (!isValidPan(normalised)) {
    throw new Error('Invalid PAN: cannot mask invalid format')
  }
  return `•••••${normalised.slice(5)}`
}
