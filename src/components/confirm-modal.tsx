'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { EASE_OUT } from './motion-transitions'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onClose
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Lock scroll
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'

      // Save previous active element
      previousActiveElementRef.current = document.activeElement as HTMLElement

      // Focus first focusable element inside modal
      const focusableElements = modalRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]'
      ) as NodeListOf<HTMLElement>
      
      if (focusableElements && focusableElements.length > 0) {
        focusableElements[0].focus()
      }

      // Keydown listener for Escape and Tab
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose()
        }

        if (e.key === 'Tab' && modalRef.current) {
          const list = modalRef.current.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]'
          ) as NodeListOf<HTMLElement>

          if (list.length === 0) return

          const first = list[0]
          const last = list[list.length - 1]

          if (e.shiftKey) {
            if (document.activeElement === first) {
              last.focus()
              e.preventDefault()
            }
          } else {
            if (document.activeElement === last) {
              first.focus()
              e.preventDefault()
            }
          }
        }
      }

      document.addEventListener('keydown', handleKeyDown)

      return () => {
        document.body.style.overflow = originalStyle
        document.removeEventListener('keydown', handleKeyDown)
        // Restore focus
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus()
        }
      }
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div 
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden z-10"
          >
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 id="confirm-modal-title" className="text-xl font-bold text-black tracking-tight">{title}</h2>
                <button 
                  onClick={onClose}
                  className="p-2 -mr-2 text-gray-400 hover:text-black transition-colors rounded-full hover:bg-gray-100"
                >
                  <X size={20} />
                </button>
              </div>
              
              {description && (
                <p className="text-gray-500 mb-8 leading-relaxed">
                  {description}
                </p>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-center sm:justify-end gap-3 mt-8">
                <button
                  onClick={() => onClose()}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-black bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => onConfirm()}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-[background-color,transform] active:scale-[0.97]"
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
