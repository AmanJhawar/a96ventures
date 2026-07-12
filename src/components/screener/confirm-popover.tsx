'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfirmPopoverProps {
  children: React.ReactNode
  message: string
  onConfirm: () => void
  confirmLabel?: string
}

export function ConfirmPopover({ children, message, onConfirm, confirmLabel = 'Remove' }: ConfirmPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="btn-press cursor-pointer">
        {children}
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute right-0 bottom-full mb-3 z-50 w-56 p-4 glass-card origin-bottom-right"
          >
            <p className="text-sm text-gray-700 font-medium mb-4">{message}</p>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setIsOpen(false)}
                className="btn-secondary !px-3 !py-1.5 !text-[11px]"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setIsOpen(false)
                  onConfirm()
                }}
                className="btn-primary !px-3 !py-1.5 !text-[11px] !bg-red-600 !border-red-600 hover:!bg-red-700"
              >
                {confirmLabel}
              </button>
            </div>
            
            {/* Arrow */}
            <div className="absolute top-full right-4 -mt-[1px] border-8 border-transparent border-t-white drop-shadow-md"></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
