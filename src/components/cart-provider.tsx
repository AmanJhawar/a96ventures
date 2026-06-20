'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { getCatalogItems } from '@/lib/services/catalog.service'
import { CartItem, reconcileCart } from '@/lib/domain/cart'

interface CartContextType {
  cartItems: CartItem[];
  isCartOpen: boolean;
  addToCart: (item: CartItem) => void;
  removeFromCart: (cartId: string) => void;
  updateQuantity: (cartId: string, delta: number) => void;
  setIsCartOpen: (open: boolean) => void;
  clearCart: () => void;
  isInitialized: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('a96_cart')
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCartItems(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Failed to load cart', e)
    }
    setIsInitialized(true)
  }, [])

  // Reconcile loaded cart items with live catalog database
  useEffect(() => {
    if (!isInitialized || cartItems.length === 0) return

    let active = true

    const fetchAndReconcile = async () => {
      try {
        const liveItems = await getCatalogItems()
        if (!active) return

        setCartItems(prev => reconcileCart(prev, liveItems))
      } catch (err) {
        console.error('Failed to reconcile cart items with catalog:', err)
      }
    }

    fetchAndReconcile()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized])

  // Save to LocalStorage
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('a96_cart', JSON.stringify(cartItems))
    }
  }, [cartItems, isInitialized])

  const addToCart = (item: CartItem) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.cartId === item.cartId)
      if (existing) {
        return prev.map(i => i.cartId === item.cartId ? { ...i, quantity: i.quantity + item.quantity } : i)
      }
      return [...prev, item]
    })
    setIsCartOpen(true)
  }

  const removeFromCart = (cartId: string) => {
    setCartItems(prev => prev.filter(i => i.cartId !== cartId))
  }

  const updateQuantity = (cartId: string, delta: number) => {
    setCartItems(prev => prev.map(i => {
      if (i.cartId === cartId) {
        const newQ = Math.max(1, i.quantity + delta)
        return { ...i, quantity: newQ }
      }
      return i
    }))
  }

  const clearCart = () => {
    setCartItems([])
  }

  return (
    <CartContext.Provider value={{ cartItems, isCartOpen, addToCart, removeFromCart, updateQuantity, setIsCartOpen, clearCart, isInitialized }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
