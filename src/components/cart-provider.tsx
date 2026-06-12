'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { getCatalogItems } from '@/lib/firebase/db'

export type CartItem = {
  cartId: string;
  productId: string;
  productName: string;
  sku: string;
  imageFile: string;
  selectedSize?: string;
  selectedPurity?: string;
  weight?: string;
  quantity: number;
}

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

    const reconcileCart = async () => {
      try {
        const liveItems = await getCatalogItems()
        if (!active) return

        const liveItemsMap = new Map(liveItems.map(i => [i.id, i]))

        setCartItems(prev => {
          const reconciled: CartItem[] = []
          for (const item of prev) {
            const liveItem = liveItemsMap.get(item.productId)
            if (!liveItem) continue // Product was deleted

            const isNoPurity = liveItem.category?.includes('Marble') || liveItem.category?.includes('Bullion')
            const hasSizes = (liveItem.standardSizes?.length > 0 || liveItem.customSizes?.length > 0)
            const hasPurities = !isNoPurity && (liveItem.standardPurities?.length > 0 || liveItem.customPurities?.length > 0)
            const hasVariants = isNoPurity ? hasSizes : (hasSizes && hasPurities)

            if (hasVariants) {
              const allSizes = [...(liveItem.standardSizes || []), ...(liveItem.customSizes || [])]
              const allPurities = isNoPurity ? [] : [...(liveItem.standardPurities || []), ...(liveItem.customPurities || [])]

              if (isNoPurity) {
                if (!item.selectedSize || !allSizes.includes(item.selectedSize)) {
                  continue
                }
                const combo = item.selectedSize
                const variantSku = liveItem.variantSkus?.[combo]
                if (!variantSku) continue
                reconciled.push({
                  ...item,
                  productName: liveItem.name,
                  imageFile: liveItem.imageFile,
                  sku: variantSku,
                  weight: liveItem.variantWeights?.[combo] || liveItem.weight || ''
                })
              } else {
                if (!item.selectedSize || !item.selectedPurity) continue

                if (!allSizes.includes(item.selectedSize) || !allPurities.includes(item.selectedPurity)) {
                  continue // Stale size/purity variant combo
                }

                const combo = `${item.selectedSize} | ${item.selectedPurity}`
                const variantSku = liveItem.variantSkus?.[combo]
                if (!variantSku) continue // Variant SKU missing/removed

                reconciled.push({
                  ...item,
                  productName: liveItem.name,
                  imageFile: liveItem.imageFile,
                  sku: variantSku,
                  weight: liveItem.variantWeights?.[combo] || liveItem.weight || ''
                })
              }
            } else {
              // If variants were disabled/deleted in DB but item in cart has selections, discard
              if (item.selectedSize || item.selectedPurity) continue

              reconciled.push({
                ...item,
                productName: liveItem.name,
                imageFile: liveItem.imageFile,
                sku: liveItem.sku,
                weight: liveItem.weight || ''
              })
            }
          }

          // Prevent state update loop
          const isDifferent = JSON.stringify(prev) !== JSON.stringify(reconciled)
          return isDifferent ? reconciled : prev
        })
      } catch (err) {
        console.error('Failed to reconcile cart items with catalog:', err)
      }
    }

    reconcileCart()

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
