'use client'

import { useRef, useEffect } from 'react'
import { useCart } from './cart-provider'
import { ShoppingBag, X, Plus, Minus, ArrowRight } from 'lucide-react'
import { ProtectedImage } from './protected-image'
import { EmptyState } from '@/components/empty-state'
import Link from 'next/link'

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
    <>
      {/* Backdrop */}
      {isCartOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] transition-opacity duration-300"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      {/* Drawer */}
      <div 
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enquiry-drawer-title"
        className={`fixed top-0 right-0 h-full w-[400px] max-w-[100vw] bg-white z-[70] shadow-2xl transform transition-transform duration-300 ease-[var(--ease-out)] flex flex-col ${
          isCartOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 id="enquiry-drawer-title" className="text-xl font-bold tracking-tight">Your Enquiry</h2>
          <button 
            onClick={() => setIsCartOpen(false)}
            className="p-2 hover:bg-gray-100 rounded-full transition-[background-color,transform] active:scale-95"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {cartItems.length === 0 ? (
            <EmptyState 
              title="Your enquiry is empty."
              icon={<ShoppingBag size={32} strokeWidth={1} />}
              action={
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="text-sm font-medium text-black underline underline-offset-4 transition-transform active:scale-95"
                >
                  Continue Browsing
                </button>
              }
            />
          ) : (
            cartItems.map((item) => (
              <div key={item.cartId} className="flex gap-4">
                <div className="w-24 h-24 bg-gray-50 rounded-xl relative overflow-hidden flex-shrink-0 border border-gray-100">
                  <ProtectedImage 
                    src={item.imageFile.startsWith('data:') ? item.imageFile : `/assets/${item.imageFile}`} 
                    alt={item.productName}
                    className="w-full h-full object-contain p-2"
                    containerClassName="absolute inset-0 flex items-center justify-center"
                  />
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-sm line-clamp-2 pr-4">{item.productName}</h3>
                    <button 
                      onClick={() => removeFromCart(item.cartId)}
                      className="text-gray-400 hover:text-black transition-[color,transform] active:scale-95 p-1 -mr-1"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-1 mt-1 text-xs text-gray-500">
                    {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                    {item.selectedSize && (item.selectedPurity || item.weight) && <span>•</span>}
                    {item.selectedPurity && <span>Purity: {item.selectedPurity}%</span>}
                    {item.selectedPurity && item.weight && <span>•</span>}
                    {item.weight && (
                      <span>
                        Approx Weight: {item.weight.toLowerCase().endsWith('g') || item.weight.toLowerCase().endsWith('kg') ? item.weight : `${item.weight}g`}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center gap-4">
                    <div className="flex items-center gap-3 bg-gray-50 rounded-full px-3 py-1 border border-gray-200">
                      <button 
                        onClick={() => updateQuantity(item.cartId, -1)}
                        className="text-gray-500 hover:text-black transition-colors disabled:opacity-50"
                        disabled={item.quantity <= 1}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.cartId, 1)}
                        className="text-gray-500 hover:text-black transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cartItems.length > 0 && (
          <div className="p-6 border-t border-gray-100 bg-gray-50">
            <Link 
              href="/contact?fromCart=true"
              onClick={() => setIsCartOpen(false)}
              className="w-full bg-black text-white px-6 py-4 rounded-lg font-semibold flex items-center justify-between hover:bg-gray-800 transition-colors active:scale-[0.98]"
            >
              <span>Inquire About Items</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
