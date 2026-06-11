'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface CustomSelectProps {
  id: string
  name: string
  value: string
  onChange: (e: { target: { name: string; value: string } }) => void
  options: Option[]
}

export default function CustomSelect({ id, name, value, onChange, options }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const selectRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => opt.value === value) || options[0]

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex(opt => opt.value === value)
      setFocusedIndex(idx >= 0 ? idx : 0)
    } else {
      setFocusedIndex(-1)
    }
  }, [isOpen, value, options])

  const handleSelect = (optionValue: string) => {
    onChange({ target: { name, value: optionValue } })
    setIsOpen(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => (prev < options.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev))
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
    <div className="relative" ref={selectRef} onKeyDown={handleKeyDown}>
      <input type="hidden" id={id} name={name} value={value} />
      
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 border border-gray-300 rounded-lg text-base bg-white text-left flex justify-between items-center transition-colors duration-150 ease-[var(--ease)] focus:outline-none focus:border-black focus:ring-4 focus:ring-black/10 ${isOpen ? 'border-black ring-4 ring-black/10' : ''}`}
      >
        <span className="text-black">{selectedOption.label}</span>
        <ChevronDown 
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ease-[var(--ease-out)] ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden animate-[fadeInUp_200ms_var(--ease-out)_forwards] origin-top">
          <ul 
            id={`${id}-listbox`}
            role="listbox"
            className="py-1 m-0 list-none max-h-60 overflow-y-auto"
          >
            {options.map((option, idx) => (
              <li key={option.value} role="option" aria-selected={value === option.value}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => handleSelect(option.value)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors duration-150 ease-[var(--ease-out)] @media(hover:hover):hover:bg-gray-100 ${
                    focusedIndex === idx ? 'bg-gray-100' : ''
                  } ${
                    value === option.value ? 'font-medium text-black' : 'text-gray-600'
                  }`}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
