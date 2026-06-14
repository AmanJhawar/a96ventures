'use client'

import { useState } from 'react'
import { useCart } from '@/components/cart-provider'
import type { CatalogItem } from '@/lib/types'

export function AddToCartSection({ item }: { item: CatalogItem }) {
  const { addToCart } = useCart()

  const category = item.category || ''
  const isBullion = category.includes('Bullion')
  const isMarble = category.includes('Marble') || category.includes('Photoframe')
  const isSilver = !isBullion && !isMarble

  // Option select states
  const [selectedSize, setSelectedSize] = useState<string | undefined>(undefined)
  const [selectedPurity, setSelectedPurity] = useState<string | undefined>(undefined)
  const [selectedWeight, setSelectedWeight] = useState<string | undefined>(undefined)
  const [selectedStone, setSelectedStone] = useState<string | undefined>(undefined)

  const hasSizes = isSilver && ((item.standardSizes?.length ?? 0) > 0 || (item.customSizes?.length ?? 0) > 0)
  const hasPurities = isSilver && ((item.standardPurities?.length ?? 0) > 0 || (item.customPurities?.length ?? 0) > 0)
  const hasWeights = isBullion && ((item.standardWeights?.length ?? 0) > 0 || (item.customWeights?.length ?? 0) > 0)
  const hasStones = isMarble && ((item.standardStones?.length ?? 0) > 0 || (item.customStones?.length ?? 0) > 0)

  // Selection verification
  const canAddToCart = 
    (!hasSizes || selectedSize !== undefined) &&
    (!hasPurities || selectedPurity !== undefined) &&
    (!hasWeights || selectedWeight !== undefined) &&
    (!hasStones || selectedStone !== undefined)

  const handleAddToCart = () => {
    if (!canAddToCart) return

    const cartId = `${item.id}-${selectedSize || ''}-${selectedPurity || ''}-${selectedWeight || ''}-${selectedStone || ''}`

    addToCart({
      cartId,
      productId: item.id,
      productName: item.name,
      sku: item.sku || item.id,
      imageFile: item.imageFile,
      selectedSize,
      selectedPurity,
      selectedWeight,
      selectedStone,
      weight: selectedWeight || item.weight,
      quantity: 1
    })
  }

  return (
    <div className="flex flex-col gap-8 mb-10">
      <div className="flex flex-col gap-6">
        {/* Silver Articles Sizes */}
        {hasSizes && (
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Size</h3>
            <div className="flex flex-wrap gap-2">
              {item.standardSizes?.map((s) => (
                <button 
                  key={`std-size-${s}`} 
                  onClick={() => setSelectedSize(s)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    selectedSize === s 
                      ? 'bg-white text-black border border-black shadow-[0_0_0_1px_black]' 
                      : 'bg-white text-gray-800 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {s}
                </button>
              ))}
              {item.customSizes?.map((s) => (
                <button 
                  key={`cust-size-${s}`} 
                  onClick={() => setSelectedSize(s)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border-dashed flex items-center gap-1 ${
                    selectedSize === s 
                      ? 'bg-white text-black border-black shadow-[0_0_0_1px_black] border-solid' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {s} <span className="text-xs opacity-70">(Custom)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Silver Articles Purities */}
        {hasPurities && (
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Purity</h3>
            <div className="flex flex-wrap gap-2">
              {item.standardPurities?.map((p) => (
                <button 
                  key={`std-pur-${p}`} 
                  onClick={() => setSelectedPurity(p)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    selectedPurity === p 
                      ? 'bg-white text-black border border-black shadow-[0_0_0_1px_black]' 
                      : 'bg-white text-gray-800 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {p}%
                </button>
              ))}
              {item.customPurities?.map((p) => (
                <button 
                  key={`cust-pur-${p}`} 
                  onClick={() => setSelectedPurity(p)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border-dashed flex items-center gap-1 ${
                    selectedPurity === p 
                      ? 'bg-white text-black border-black shadow-[0_0_0_1px_black] border-solid' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {p}% <span className="text-xs opacity-70">(Custom)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bullions Weights */}
        {hasWeights && (
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Weight</h3>
            <div className="flex flex-wrap gap-2">
              {item.standardWeights?.map((w) => (
                <button 
                  key={`std-weight-${w}`} 
                  onClick={() => setSelectedWeight(w)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    selectedWeight === w 
                      ? 'bg-white text-black border border-black shadow-[0_0_0_1px_black]' 
                      : 'bg-white text-gray-800 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {w}
                </button>
              ))}
              {item.customWeights?.map((w) => (
                <button 
                  key={`cust-weight-${w}`} 
                  onClick={() => setSelectedWeight(w)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border-dashed flex items-center gap-1 ${
                    selectedWeight === w 
                      ? 'bg-white text-black border-black shadow-[0_0_0_1px_black] border-solid' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {w} <span className="text-xs opacity-70">(Custom)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Marble Photoframes Stones */}
        {hasStones && (
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Stone</h3>
            <div className="flex flex-wrap gap-2">
              {item.standardStones?.map((st) => (
                <button 
                  key={`std-stone-${st}`} 
                  onClick={() => setSelectedStone(st)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    selectedStone === st 
                      ? 'bg-white text-black border border-black shadow-[0_0_0_1px_black]' 
                      : 'bg-white text-gray-800 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {st}
                </button>
              ))}
              {item.customStones?.map((st) => (
                <button 
                  key={`cust-stone-${st}`} 
                  onClick={() => setSelectedStone(st)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border-dashed flex items-center gap-1 ${
                    selectedStone === st 
                      ? 'bg-white text-black border-black shadow-[0_0_0_1px_black] border-solid' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {st} <span className="text-xs opacity-70">(Custom)</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 flex flex-col gap-4">
        <button 
          onClick={handleAddToCart}
          disabled={!canAddToCart}
          className="w-full sm:w-auto px-8 py-4 bg-black text-white rounded-lg font-semibold text-sm hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
        >
          {canAddToCart ? 'Add to Enquiry' : 'Please select options'}
        </button>
      </div>
    </div>
  )
}
