'use client'

import React, { useRef, useLayoutEffect } from 'react'
import { formatIndianNumberString, parseIndianNumberString } from '@/lib/utils/money'

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  value: string | number
  onChange: (value: string) => void
  showPrefix?: boolean
  prefix?: string
  size?: 'sm' | 'md'
  maxDecimals?: number
}

/**
 * MoneyInput component with live Indian numbering comma integration (e.g. 15,09,000.00)
 * Uses font-mono and tabular-nums to match the Payment Split typography.
 * Automatically maintains cursor position across dynamic comma insertions/removals.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      value,
      onChange,
      showPrefix = false,
      prefix = '₹',
      size = 'md',
      maxDecimals = 2,
      className = '',
      placeholder = '0.00',
      disabled = false,
      ...props
    },
    forwardedRef
  ) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const combinedRef = (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof forwardedRef === 'function') {
        forwardedRef(node)
      } else if (forwardedRef) {
        ;(forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node
      }
    }

    const cursorTargetRef = useRef<number | null>(null)

    const rawStringValue = value !== undefined && value !== null ? String(value) : ''
    const displayValue = formatIndianNumberString(rawStringValue, maxDecimals)

    // Preserve cursor position after format update
    useLayoutEffect(() => {
      if (cursorTargetRef.current !== null && inputRef.current) {
        const pos = cursorTargetRef.current
        inputRef.current.setSelectionRange(pos, pos)
        cursorTargetRef.current = null
      }
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const incomingVal = e.target.value
      const currentCursor = e.target.selectionStart ?? incomingVal.length

      // Count non-comma characters before cursor in incoming raw value
      let nonCommasBefore = 0
      for (let i = 0; i < currentCursor; i++) {
        if (incomingVal[i] !== ',') {
          nonCommasBefore++
        }
      }

      // Parse to clean numeric string (no commas)
      const clean = parseIndianNumberString(incomingVal, maxDecimals)

      // Calculate where the cursor should land in the formatted string
      const formatted = formatIndianNumberString(clean, maxDecimals)
      let newCursor = 0
      let count = 0
      while (newCursor < formatted.length && count < nonCommasBefore) {
        if (formatted[newCursor] !== ',') {
          count++
        }
        newCursor++
      }

      cursorTargetRef.current = newCursor
      onChange(clean)
    }

    const heightClass = size === 'sm' ? 'h-9 text-xs' : 'h-10 text-sm'
    const paddingClass = showPrefix ? (size === 'sm' ? 'pl-6 pr-3' : 'pl-7 pr-3.5') : (size === 'sm' ? 'px-3' : 'px-3.5')

    return (
      <div className="relative w-full">
        {showPrefix && (
          <span
            className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono pointer-events-none select-none ${
              size === 'sm' ? 'text-xs' : 'text-sm'
            }`}
          >
            {prefix}
          </span>
        )}
        <input
          ref={combinedRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full bg-white border border-gray-200 rounded-lg font-mono tabular-nums text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 ${heightClass} ${paddingClass} ${className}`.trim()}
          {...props}
        />
      </div>
    )
  }
)

MoneyInput.displayName = 'MoneyInput'
export default MoneyInput
