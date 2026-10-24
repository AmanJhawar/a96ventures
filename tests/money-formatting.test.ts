import { describe, it, expect } from 'vitest'
import {
  formatIndianNumberString,
  parseIndianNumberString,
  rupeesToPaise,
  paiseToRupees,
  formatINR
} from '@/lib/utils/money'

describe('Indian Money Utilities and Live Comma Formatting', () => {
  describe('formatIndianNumberString', () => {
    it('returns empty string for empty input', () => {
      expect(formatIndianNumberString('')).toBe('')
      expect(formatIndianNumberString('   ')).toBe('')
    })

    it('formats integer strings with Indian comma grouping (3 digits then groups of 2)', () => {
      expect(formatIndianNumberString('1000')).toBe('1,000')
      expect(formatIndianNumberString('10000')).toBe('10,000')
      expect(formatIndianNumberString('100000')).toBe('1,00,000')
      expect(formatIndianNumberString('150900')).toBe('1,50,900')
      expect(formatIndianNumberString('1509000')).toBe('15,09,000')
      expect(formatIndianNumberString('10000000')).toBe('1,00,00,000')
    })

    it('handles decimal portions with live typing', () => {
      expect(formatIndianNumberString('1509000.')).toBe('15,09,000.')
      expect(formatIndianNumberString('1509000.0')).toBe('15,09,000.0')
      expect(formatIndianNumberString('1509000.00')).toBe('15,09,000.00')
      // Truncates beyond maxDecimals
      expect(formatIndianNumberString('1509000.1234', 2)).toBe('15,09,000.12')
    })

    it('strips non-numeric characters gracefully', () => {
      expect(formatIndianNumberString('₹ 1,50,900.50')).toBe('1,50,900.50')
      expect(formatIndianNumberString('abc')).toBe('')
    })
  })

  describe('parseIndianNumberString', () => {
    it('strips commas and non-numeric noise, preserving one decimal point', () => {
      expect(parseIndianNumberString('15,09,000.50')).toBe('1509000.50')
      expect(parseIndianNumberString('1,50,900')).toBe('150900')
      expect(parseIndianNumberString('1,2.3.4')).toBe('12.34')
      expect(parseIndianNumberString('')).toBe('')
    })
  })

  describe('rupeesToPaise with commas', () => {
    it('accepts numbers, clean strings, and comma-formatted strings', () => {
      expect(rupeesToPaise(150900)).toBe(15090000)
      expect(rupeesToPaise('150900')).toBe(15090000)
      expect(rupeesToPaise('1,50,900')).toBe(15090000)
      expect(rupeesToPaise('15,09,000.00')).toBe(150900000)
      expect(rupeesToPaise('15,09,000.50')).toBe(150900050)
    })
  })

  describe('formatINR and paiseToRupees', () => {
    it('formats paise to Indian Rupee string with symbol', () => {
      expect(formatINR(150900000)).toBe('₹15,09,000')
      expect(formatINR(150900050)).toBe('₹15,09,000.50')
      expect(paiseToRupees(150900000)).toBe(1509000)
    })
  })
})
