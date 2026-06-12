'use client'

import { useState } from 'react'
import { useCart } from '@/components/cart-provider'
import type { CatalogItem } from '@/lib/types'

export function AddToCartSection({ item }: { item: CatalogItem }) {
  const { addToCart } = useCart()

  // State for selections
  const [selectedSize, setSelectedSize] = useState<string | undefined>(undefined)
  const [selectedPurity, setSelectedPurity] = useState<string | undefined>(undefined)
  
  const isNoPurity = item.category?.includes('Marble') || item.category?.includes('Bullion')
  const sizeLabel = item.category?.includes('Marble') ? 'Select Stone' : item.category?.includes('Bullion') ? 'Select Weight' : 'Select Size'
  
  // Validation: If it's a modern schema product with sizes/purities, enforce selection if they exist
  const hasSizes = (item.standardSizes?.length > 0 || item.customSizes?.length > 0)
  const hasPurities = !isNoPurity && (item.standardPurities?.length > 0 || item.customPurities?.length > 0)
  const hasVariants = isNoPurity ? hasSizes : (hasSizes && hasPurities)
  
  const canAddToCart = (!hasSizes || selectedSize !== undefined) && (!hasPurities || selectedPurity !== undefined)

  const handleAddToCart = () => {
    if (!canAddToCart) return

    let finalSku = item.sku
    let finalWeight = item.weight
    if (hasVariants) {
      const combo = isNoPurity ? selectedSize! : `${selectedSize} | ${selectedPurity}`
      if (isNoPurity ? !selectedSize : (!selectedSize || !selectedPurity)) {
        throw new Error(item.category?.includes('Marble')
          ? `Variant selection incomplete for product ${item.name}: Stone must be selected.`
          : item.category?.includes('Bullion')
            ? `Variant selection incomplete for product ${item.name}: Weight must be selected.`
            : `Variant selection incomplete for product ${item.name}: Size and Purity must be selected.`
        )
      }
      const variantSku = item.variantSkus?.[combo]
      if (!variantSku) {
        const errorMsg = `Variant SKU lookup failed for combo "${combo}" on product ${item.name} (${item.id}).`
        console.error(errorMsg, "Available variant SKUs:", item.variantSkus)
        alert("An error occurred: product variant SKU not found. Please contact administration.")
        throw new Error(errorMsg)
      }
      finalSku = variantSku
      finalWeight = item.variantWeights?.[combo] || item.weight
    } else {
      if (!finalSku || finalSku.trim() === '') {
        const errorMsg = `Product SKU missing for product ${item.name} (${item.id}).`
        console.error(errorMsg)
        alert("An error occurred: product SKU is missing. Please contact administration.")
        throw new Error(errorMsg)
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
      weight: finalWeight,
      quantity: 1
    })
  }

  return (
    <div className="flex flex-col gap-8 mb-10">
      {/* Modern Schema (Admin Uploads) */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-8">
          {hasSizes && (
            <div>
              <h3 className="text-sm font-semibold text-black uppercase tracking-wider mb-4">{sizeLabel}</h3>
              <div className="flex flex-wrap gap-3">
                {item.standardSizes?.map((s) => {
                  const isSelected = selectedSize === s
                  return (
                    <button
                      key={`std-size-${s}`}
                      onClick={() => setSelectedSize(s)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 active:scale-95 ${
                        isSelected 
                          ? 'bg-black text-white border-black' 
                          : 'bg-white text-gray-800 border-gray-200 hover:border-black'
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
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 active:scale-95 border-dashed ${
                        isSelected 
                          ? 'bg-black text-white border-black border-solid' 
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-black hover:border-solid'
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
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 active:scale-95 ${
                        isSelected 
                          ? 'bg-black text-white border-black' 
                          : 'bg-white text-gray-800 border-gray-200 hover:border-black'
                      } border`}
                    >
                      {p}%
                    </button>
                  )
                })}
                {item.customPurities?.map((p) => {
                  const isSelected = selectedPurity === p
                  return (
                    <button
                      key={`cust-pur-${p}`}
                      onClick={() => setSelectedPurity(p)}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 active:scale-95 border-dashed ${
                        isSelected 
                          ? 'bg-black text-white border-black border-solid' 
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-black hover:border-solid'
                      } border`}
                    >
                      {p}% <span className="text-xs opacity-70 ml-1">(Custom)</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>


      <div className="pt-8 border-t border-gray-200 flex flex-col gap-4">
        {hasVariants && selectedSize && (isNoPurity || selectedPurity) && (() => {
          const combo = isNoPurity ? selectedSize : `${selectedSize} | ${selectedPurity}`
          const w = item.variantWeights?.[combo]
          if (!w) return null
          return (
            <div className="text-sm text-gray-500 animate-[fadeInUp_160ms_var(--ease-out)_forwards]">
              <span className="font-semibold text-black uppercase tracking-wider text-xs mr-2">Approx Weight:</span>
              <span className="text-gray-900 font-medium">
                {w.toLowerCase().endsWith('g') || w.toLowerCase().endsWith('kg') ? w : `${w}g`}
              </span>
            </div>
          )
        })()}
        <button 
          onClick={handleAddToCart}
          disabled={!canAddToCart}
          className="w-full sm:w-auto px-8 py-4 bg-black text-white rounded-xl font-semibold text-sm hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:bg-gray-300 disabled:active:scale-100 flex items-center justify-center gap-2"
        >
          {canAddToCart ? 'Add to Enquiry' : 'Please select options'}
        </button>
      </div>
    </div>
  )
}
