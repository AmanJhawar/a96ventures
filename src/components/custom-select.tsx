'use client'

import { useState, useRef, useEffect } from 'react'
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

  const handleSelect = (optionValue: string) => {
    onChange({ target: { name, value: optionValue } })
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={selectRef}>
      <input type="hidden" id={id} name={name} value={value} />
      
      <button
        type="button"
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
          <ul className="py-1 m-0 list-none">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors duration-150 ease-[var(--ease-out)] @media(hover:hover):hover:bg-gray-100 ${
                    value === option.value ? 'bg-gray-50 font-medium text-black' : 'text-gray-600'
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
