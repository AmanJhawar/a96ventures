'use client'

import { useCart } from './cart-provider'
import { X, Plus, Minus, ArrowRight } from 'lucide-react'
import { ProtectedImage } from './protected-image'
import Link from 'next/link'

export function CartDrawer() {
  const { cartItems, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart, isInitialized } = useCart()

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
        className={`fixed top-0 right-0 h-full w-[400px] max-w-[100vw] bg-white z-[70] shadow-2xl transform transition-transform duration-300 ease-[var(--ease-out)] flex flex-col ${
          isCartOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold tracking-tight">Your Cart</h2>
          <button 
            onClick={() => setIsCartOpen(false)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
              <p>Your cart is empty.</p>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="text-sm font-medium text-black underline underline-offset-4"
              >
                Continue Browsing
              </button>
            </div>
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
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-1 mt-1 text-xs text-gray-500">
                    {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                    {item.selectedSize && item.selectedPurity && <span>•</span>}
                    {item.selectedPurity && <span>Purity: {item.selectedPurity}</span>}
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
              className="w-full bg-black text-white px-6 py-4 rounded-xl font-semibold flex items-center justify-between hover:bg-gray-800 transition-colors active:scale-[0.98]"
            >
              <span>Inquire About Cart</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
