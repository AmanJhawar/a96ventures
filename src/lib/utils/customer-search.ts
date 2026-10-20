/**
 * Native Firestore Customer Search Tokenizer
 * Generates lowercase prefix tokens enabling fast, index-supported array-contains search
 * for customer names and mobile numbers per ADR 0001.
 */

export interface CustomerSearchInput {
  firstName: string
  middleName?: string | null
  lastName: string
  mobile?: {
    number?: string
    e164?: string
  } | null
}

/**
 * Builds an array of lowercase search tokens (prefixes and keywords)
 * for a customer profile.
 * - Name prefixes (minimum 2 chars, up to 20 chars) for first, middle, and last names
 * - Full mobile digits, prefix progressions (2+ chars), and last 4 digits
 */
export function buildSearchTerms(customer: CustomerSearchInput): string[] {
  const tokens = new Set<string>()

  const addPrefixes = (text: string) => {
    const clean = text.toLowerCase().trim()
    if (!clean) return

    // Word-level prefixes
    const words = clean.split(/\s+/).filter(Boolean)
    for (const word of words) {
      const stripped = word.replace(/[^a-z0-9]/g, '')
      if (stripped.length >= 2) {
        for (let len = 2; len <= Math.min(stripped.length, 20); len++) {
          tokens.add(stripped.slice(0, len))
        }
      }
    }

    // Multi-word progression if multiple words (e.g. "aman jh", "aman jhawar")
    if (words.length > 1) {
      const fullPhrase = words.join(' ')
      for (let len = 3; len <= Math.min(fullPhrase.length, 25); len++) {
        tokens.add(fullPhrase.slice(0, len))
      }
    }
  }

  if (customer.firstName) addPrefixes(customer.firstName)
  if (customer.middleName) addPrefixes(customer.middleName)
  if (customer.lastName) addPrefixes(customer.lastName)

  const fullName = [customer.firstName, customer.middleName, customer.lastName]
    .filter(Boolean)
    .join(' ')
  if (fullName) addPrefixes(fullName)

  // Mobile number indexing
  const addMobileTokens = (rawMobile?: string | null) => {
    if (!rawMobile) return
    const digits = rawMobile.replace(/\D/g, '')
    if (digits.length >= 2) {
      // Add prefixes from 2 digits up to full length
      for (let len = 2; len <= digits.length; len++) {
        tokens.add(digits.slice(0, len))
      }
      // Add last 4 digits for quick counter lookup
      if (digits.length >= 4) {
        tokens.add(digits.slice(-4))
      }
    }
  }

  if (customer.mobile?.number) addMobileTokens(customer.mobile.number)
  if (customer.mobile?.e164) addMobileTokens(customer.mobile.e164)

  return Array.from(tokens)
}

/**
 * Normalises a client search query into a single search token
 * suitable for `where('searchTerms', 'array-contains', queryToken(q))` queries.
 */
export function queryToken(q: string | null | undefined): string {
  if (!q || typeof q !== 'string') return ''
  return q.toLowerCase().trim()
}
