'use client'

import { useRef, useEffect } from 'react'
import { useCart } from './cart-provider'
import { ShoppingBag, X, ArrowRight } from 'lucide-react'
import { ProtectedImage } from './protected-image'
import { EmptyState } from '@/components/empty-state'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { getOptimizedUrl } from '@/lib/utils'
import { EASE_OUT } from './motion-transitions'

export function CartDrawer() {
  const { cartItems, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart, isInitialized } = useCart()
  const drawerRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // Escape handling & Focus Trap & Scroll Lock
  useEffect(() => {
    if (isCartOpen) {
      // 1. Lock scroll
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'

      // Save previous active element to restore later
      previousActiveElementRef.current = document.activeElement as HTMLElement

      // Focus first focusable element inside drawer
      const focusableElements = drawerRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]'
      ) as NodeListOf<HTMLElement>

      if (focusableElements && focusableElements.length > 0) {
        focusableElements[0].focus()
      }

      // Keydown listener for Escape and Tab
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsCartOpen(false)
        }

        if (e.key === 'Tab' && drawerRef.current) {
          const list = drawerRef.current.querySelectorAll(
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

      window.addEventListener('keydown', handleKeyDown)

      return () => {
        document.body.style.overflow = originalStyle
        window.removeEventListener('keydown', handleKeyDown)
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus()
        }
      }
    }
  }, [isCartOpen, setIsCartOpen])

  if (!isInitialized) return null

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
            onClick={() => setIsCartOpen(false)}
          />

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inquiry-drawer-title"
            initial={{ transform: "translateX(100%)" }}
            animate={{ transform: "translateX(0%)" }}
            exit={{ transform: "translateX(100%)" }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-0 right-0 h-full w-[400px] max-w-[100vw] bg-white z-[70] shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 id="inquiry-drawer-title" className="text-xl font-bold tracking-tight">Your Inquiry</h2>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-[background-color,transform] active:scale-[0.97]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {cartItems.length === 0 ? (
                <EmptyState
                  title="Your inquiry is empty."
                  icon={<ShoppingBag size={32} strokeWidth={1} />}
                  action={
                    <button
                      onClick={() => setIsCartOpen(false)}
                      className="text-sm font-medium text-black underline underline-offset-4 transition-transform active:scale-[0.97]"
                    >
                      Continue Browsing
                    </button>
                  }
                />
              ) : (
                cartItems.map((item) => (
                  <div key={item.cartId} className="flex gap-4 items-start">
                    <div className="w-16 aspect-[3/4] bg-[#f5f5f7] rounded-xl relative overflow-hidden flex-shrink-0 border border-gray-100">
                      <ProtectedImage
                        src={getOptimizedUrl(item.imageFile, 400)}
                        alt={item.productName}
                        className="w-full h-full object-cover"
                        containerClassName="absolute inset-0"
                      />
                    </div>
                    <div className="flex-1 flex flex-col">
                      <div className="flex justify-between items-start">
                        <h3 className="font-semibold text-sm line-clamp-2 pr-4 text-black">{item.productName}</h3>
                      </div>

                      <div className="flex flex-col mt-0.5 text-[13px] text-gray-500 leading-snug">
                        {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                        {item.selectedPurity && <span>Purity: {item.selectedPurity}%</span>}
                        {item.selectedStone && <span>Stone: {item.selectedStone}</span>}
                        {item.selectedWeight ? (
                          <span>Weight: {item.selectedWeight}</span>
                        ) : (
                          item.weight && (
                            <span>
                              Approx Weight: {item.weight.toLowerCase().endsWith('g') || item.weight.toLowerCase().endsWith('kg') ? item.weight : `${item.weight}g`}
                            </span>
                          )
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="relative">
                          <select
                            value={item.quantity}
                            onChange={(e) => {
                              const newQty = parseInt(e.target.value, 10);
                              updateQuantity(item.cartId, newQty - item.quantity);
                            }}
                            className="appearance-none bg-[#f5f5f7] border border-gray-200 hover:border-gray-300 rounded-lg py-1 pl-3 pr-8 text-[13px] font-medium text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent cursor-pointer transition-colors"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                              <option key={num} value={num}>{num}</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                            </svg>
                          </div>
                        </div>

                        <button
                          onClick={() => removeFromCart(item.cartId)}
                          className="text-[13px] text-gray-400 hover:text-black hover:underline underline-offset-4 transition-colors active:scale-[0.97]"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="p-6 bg-white">
                <Link
                  href="/contact?fromCart=true"
                  onClick={() => setIsCartOpen(false)}
                  className="btn-primary w-full justify-between"
                >
                  <span>Inquire About Items</span>
                  <ArrowRight size={18} />
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
