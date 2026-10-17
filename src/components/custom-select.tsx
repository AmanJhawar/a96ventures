'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  sublabel?: string
  badge?: string
}

export interface CustomSelectProps {
  id?: string
  name?: string
  value: string
  onChange?: (e: { target: { name: string; value: string } }) => void
  onValueChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  buttonClassName?: string
  className?: string
  disabled?: boolean
}

export default function CustomSelect({
  id = '',
  name = '',
  value,
  onChange,
  onValueChange,
  options,
  placeholder = 'Select option...',
  buttonClassName = '',
  className = '',
  disabled = false
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const selectRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setFocusedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const openSelect = () => {
    if (disabled) return
    setIsOpen(true)
    const idx = options.findIndex((opt) => opt.value === value)
    setFocusedIndex(idx >= 0 ? idx : 0)
  }

  const closeSelect = () => {
    setIsOpen(false)
    setFocusedIndex(-1)
  }

  const handleSelect = (optionValue: string) => {
    if (onValueChange) {
      onValueChange(optionValue)
    }
    if (onChange) {
      onChange({ target: { name, value: optionValue } })
    }
    closeSelect()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openSelect()
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        closeSelect()
        break
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          handleSelect(options[focusedIndex].value)
        }
        break
    }
  }

  return (
    <div className={`relative ${className}`} ref={selectRef} onKeyDown={handleKeyDown}>
      {id && <input type="hidden" id={id} name={name} value={value} />}

      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={id ? `${id}-listbox` : undefined}
        disabled={disabled}
        onClick={() => (isOpen ? closeSelect() : openSelect())}
        className={`w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-white text-left flex justify-between items-center transition-[border-color,box-shadow,background-color,transform] duration-150 ease-[var(--ease-out)] focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'border-black ring-2 ring-black/10' : ''
        } ${buttonClassName}`}
      >
        <span className={`truncate mr-2 ${selectedOption ? 'text-black font-medium' : 'text-gray-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] ${
            isOpen ? 'rotate-180 text-black' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-[0_10px_28px_rgba(0,0,0,0.08)] overflow-hidden animate-[fadeInUp_160ms_var(--ease-out)_forwards] origin-top">
          <ul
            id={id ? `${id}-listbox` : undefined}
            role="listbox"
            className="py-1 m-0 list-none max-h-64 overflow-y-auto divide-y divide-gray-50"
          >
            {options.map((option, idx) => {
              const isSelected = value === option.value
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleSelect(option.value)}
                    className={`w-full text-left px-3.5 py-2.5 text-sm transition-[background-color,color] duration-150 ease-[var(--ease-out)] flex items-center justify-between gap-2 hover:bg-gray-100 ${
                      focusedIndex === idx ? 'bg-gray-100' : ''
                    } ${isSelected ? 'bg-gray-50 font-semibold text-black' : 'text-gray-700'}`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{option.label}</span>
                      {option.sublabel && (
                        <span className="text-xs text-gray-400 font-normal truncate mt-0.5">
                          {option.sublabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {option.badge && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                          {option.badge}
                        </span>
                      )}
                      {isSelected && <Check size={14} className="text-black" />}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
