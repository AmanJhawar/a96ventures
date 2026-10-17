'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface CustomDatePickerProps {
  value: string // 'YYYY-MM-DD'
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  buttonClassName?: string
  disabled?: boolean
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function formatDateString(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

export function CustomDatePicker({
  value,
  onChange,
  placeholder = 'Select date...',
  className = '',
  buttonClassName = '',
  disabled = false
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Current viewed month & year
  const initialDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number)
      return new Date(y, m - 1, d)
    }
    return new Date()
  }, [value])

  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear())
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth())

  // Keep view sync when value changes from outside
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number)
      setViewYear(y)
      setViewMonth(m - 1)
    }
  }, [value])

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Month navigation
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  // Days calculations
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay()
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()

  const calendarDays = useMemo(() => {
    const days: Array<{
      dateStr: string
      dayNum: number
      isCurrentMonth: boolean
      isSelected: boolean
      isToday: boolean
    }> = []

    const todayStr = new Date().toISOString().split('T')[0]

    // Preceding month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear
      const str = formatDateString(prevY, prevM, d)
      days.push({
        dateStr: str,
        dayNum: d,
        isCurrentMonth: false,
        isSelected: value === str,
        isToday: todayStr === str
      })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const str = formatDateString(viewYear, viewMonth, d)
      days.push({
        dateStr: str,
        dayNum: d,
        isCurrentMonth: true,
        isSelected: value === str,
        isToday: todayStr === str
      })
    }

    // Next month starting days (to round to 35 or 42 cells)
    const remaining = (7 - (days.length % 7)) % 7
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear
      const str = formatDateString(nextY, nextM, d)
      days.push({
        dateStr: str,
        dayNum: d,
        isCurrentMonth: false,
        isSelected: value === str,
        isToday: todayStr === str
      })
    }

    return days
  }, [viewYear, viewMonth, daysInMonth, firstDayIndex, daysInPrevMonth, value])

  const displayLabel = useMemo(() => {
    if (!value) return placeholder
    const parts = value.split('-')
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number)
      const date = new Date(y, m - 1, d)
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    }
    return value
  }, [value, placeholder])

  const selectDay = (dateStr: string) => {
    onChange(dateStr)
    setIsOpen(false)
  }

  const setToday = () => {
    const today = new Date().toISOString().split('T')[0]
    onChange(today)
    setIsOpen(false)
  }

  const setYesterday = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yday = d.toISOString().split('T')[0]
    onChange(yday)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-white text-left flex items-center justify-between gap-2.5 transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out)] focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'border-black ring-2 ring-black/10' : ''
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <CalendarIcon size={16} className="text-gray-400 shrink-0" />
          <span className={`truncate ${value ? 'text-black font-medium' : 'text-gray-400'}`}>
            {displayLabel}
          </span>
        </div>
        {value && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            title="Clear date"
            className="text-gray-300 hover:text-gray-600 transition-colors p-0.5"
          >
            <X size={13} />
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute z-40 mt-1.5 p-3.5 bg-white border border-gray-200 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.08)] w-[280px] animate-[fadeInUp_160ms_var(--ease-out)_forwards] origin-top select-none">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-black tracking-tight">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded-lg text-gray-500 hover:text-black hover:bg-gray-100 transition-[background-color,transform] active:scale-[0.95]"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded-lg text-gray-500 hover:text-black hover:bg-gray-100 transition-[background-color,transform] active:scale-[0.95]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Weekday Row */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-1">
                {w}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((cell) => {
              const { dateStr, dayNum, isCurrentMonth, isSelected, isToday } = cell
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => selectDay(dateStr)}
                  className={`h-8 w-8 mx-auto rounded-lg text-xs flex items-center justify-center transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.92] ${
                    isSelected
                      ? 'bg-black text-white font-semibold'
                      : isToday
                      ? 'bg-gray-100 text-black font-semibold border border-black/20'
                      : isCurrentMonth
                      ? 'text-gray-800 hover:bg-gray-100'
                      : 'text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {dayNum}
                </button>
              )
            })}
          </div>

          {/* Quick Shortcuts */}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={setToday}
              className="px-2.5 py-1 text-xs font-semibold text-gray-600 hover:text-black hover:bg-gray-100 rounded-md transition-[background-color,color,transform] active:scale-[0.97]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={setYesterday}
              className="px-2.5 py-1 text-xs font-semibold text-gray-600 hover:text-black hover:bg-gray-100 rounded-md transition-[background-color,color,transform] active:scale-[0.97]"
            >
              Yesterday
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
export default CustomDatePicker
