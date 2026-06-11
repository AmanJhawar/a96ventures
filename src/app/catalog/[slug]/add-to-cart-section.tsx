'use client'

import { useState } from 'react'
import { useCart } from '@/components/cart-provider'
import type { CatalogItem } from '@/data/catalog'

export function AddToCartSection({ item }: { item: CatalogItem }) {
  const { addToCart } = useCart()

  // State for selections
  const [selectedSize, setSelectedSize] = useState<string | undefined>(undefined)
  const [selectedPurity, setSelectedPurity] = useState<string | undefined>(undefined)
  
  // Validation: If it's a modern schema product with sizes/purities, enforce selection if they exist
  const hasSizes = (item.standardSizes?.length > 0 || item.customSizes?.length > 0)
  const hasPurities = (item.standardPurities?.length > 0 || item.customPurities?.length > 0)
  
  const canAddToCart = (!hasSizes || selectedSize !== undefined) && (!hasPurities || selectedPurity !== undefined)

  const handleAddToCart = () => {
    if (!canAddToCart) return

    let finalSku = item.sku
    if (item.hasVariants && item.variantSkus) {
      let combo = ''
      if (selectedSize && selectedPurity) {
        combo = `${selectedSize} | ${selectedPurity}`
      } else if (selectedSize) {
        combo = selectedSize
      } else if (selectedPurity) {
        combo = selectedPurity
      }
      if (combo && item.variantSkus[combo]) {
        finalSku = item.variantSkus[combo]
      }
    }

    addToCart({
      cartId: `${item.id}-${selectedSize || ''}-${selectedPurity || ''}`,
      productId: item.id,
      productName: item.name,
      sku: finalSku,
      imageFile: item.imageFile,
      selectedSize,
      selectedPurity,
      quantity: 1
    })
  }

  return (
    <div className="flex flex-col gap-8 mb-10">
      {/* Modern Schema (Admin Uploads) */}
        <div className="flex flex-col gap-8">
          {hasSizes && (
            <div>
              <h3 className="text-sm font-semibold text-black uppercase tracking-wider mb-4">Select Size</h3>
              <div className="flex flex-wrap gap-3">
                {item.standardSizes?.map((s) => {
                  const isSelected = selectedSize === s
                  return (
                    <button
                      key={`std-size-${s}`}
                      onClick={() => setSelectedSize(s)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 active:scale-95 ${
                        isSelected 
                          ? 'bg-black text-white border-black' 
                          : 'bg-white text-gray-800 border-gray-300 hover:border-black'
                      } border`}
                    >
                      {s}
                    </button>
                  )
                })}
                {item.customSizes?.map((s) => {
                  const isSelected = selectedSize === s
                  return (
                    <button
                      key={`cust-size-${s}`}
                      onClick={() => setSelectedSize(s)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 active:scale-95 border-dashed ${
                        isSelected 
                          ? 'bg-black text-white border-black border-solid' 
                          : 'bg-gray-50 text-gray-600 border-gray-300 hover:border-black hover:border-solid'
                      } border`}
                    >
                      {s} <span className="text-xs opacity-70 ml-1">(Custom)</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {hasPurities && (
            <div>
              <h3 className="text-sm font-semibold text-black uppercase tracking-wider mb-4">Select Purity</h3>
              <div className="flex flex-wrap gap-3">
                {item.standardPurities?.map((p) => {
                  const isSelected = selectedPurity === p
                  return (
                    <button
                      key={`std-pur-${p}`}
                      onClick={() => setSelectedPurity(p)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 active:scale-95 ${
                        isSelected 
                          ? 'bg-black text-white border-black' 
                          : 'bg-white text-gray-800 border-gray-300 hover:border-black'
                      } border`}
                    >
                      {p}{p.includes('%') ? '' : '%'}
                    </button>
                  )
                })}
                {item.customPurities?.map((p) => {
                  const isSelected = selectedPurity === p
                  return (
                    <button
                      key={`cust-pur-${p}`}
                      onClick={() => setSelectedPurity(p)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 active:scale-95 border-dashed ${
                        isSelected 
                          ? 'bg-black text-white border-black border-solid' 
                          : 'bg-gray-50 text-gray-600 border-gray-300 hover:border-black hover:border-solid'
                      } border`}
                    >
                      {p}{p.includes('%') ? '' : '%'} <span className="text-xs opacity-70 ml-1">(Custom)</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>


      <div className="pt-8 border-t border-gray-200">
        <button 
          onClick={handleAddToCart}
          disabled={!canAddToCart}
          className="w-full sm:w-auto px-8 py-4 bg-black text-white rounded-xl font-semibold text-sm hover:bg-gray-800 transition-all duration-150 active:scale-[0.98] disabled:bg-gray-300 disabled:active:scale-100 flex items-center justify-center gap-2"
        >
          {canAddToCart ? 'Add to Cart' : 'Please select options'}
        </button>
      </div>
    </div>
  )
}
