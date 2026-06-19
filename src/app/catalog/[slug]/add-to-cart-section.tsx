'use client'

import { useState } from 'react'
import { useCart } from '@/components/cart-provider'
import type { CatalogItem } from '@/lib/types'

export function AddToCartSection({ item, onVariantChange }: { item: CatalogItem, onVariantChange?: (variantKey: string | undefined) => void }) {
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

  const hasVariants = hasSizes || hasPurities || hasWeights || hasStones

  const updateVariantKey = (
    size: string | undefined = selectedSize,
    purity: string | undefined = selectedPurity,
    weight: string | undefined = selectedWeight,
    stone: string | undefined = selectedStone
  ) => {
    if (!onVariantChange) return
    if (!hasVariants) {
      onVariantChange(undefined)
      return
    }
    let key: string | undefined = undefined
    if (isMarble) {
      key = stone ? `stone:${stone}` : undefined
    } else if (isBullion) {
      key = weight ? `weight:${weight}` : undefined
    } else if (isSilver) {
      key = (size && purity) ? `size:${size}|purity:${purity}` : undefined
    }
    onVariantChange(key)
  }

  const handleSizeChange = (s: string) => { setSelectedSize(s); updateVariantKey(s, selectedPurity, selectedWeight, selectedStone); }
  const handlePurityChange = (p: string) => { setSelectedPurity(p); updateVariantKey(selectedSize, p, selectedWeight, selectedStone); }
  const handleWeightChange = (w: string) => { setSelectedWeight(w); updateVariantKey(selectedSize, selectedPurity, w, selectedStone); }
  const handleStoneChange = (st: string) => { setSelectedStone(st); updateVariantKey(selectedSize, selectedPurity, selectedWeight, st); }

  // Resolve the selected variant to its own SKU and weight by matching the
  // stored variant definitions (variantSkus is keyed by SKU). No silent
  // fallback to the product ID: an unmatched variant is a data error.
  const resolveVariant = (): { sku: string; weight?: string } | null => {
    if (!hasVariants) {
      return { sku: item.sku, weight: item.weight }
    }
    const entries = Object.entries(item.variantSkus || {})
    const match = entries.find(([, d]) =>
      (d.size ?? undefined) === selectedSize &&
      (d.purity ?? undefined) === selectedPurity &&
      (d.stone ?? undefined) === selectedStone &&
      // Bullion stores the weight as the variant attribute; others store the
      // chosen weight only when it is a variant dimension.
      (isBullion ? (d.weight ?? undefined) === selectedWeight : true)
    )
    if (!match) return null
    const [sku, detail] = match
    return { sku, weight: detail.weight ?? selectedWeight ?? item.weight }
  }

  const handleAddToCart = () => {
    if (!canAddToCart) return

    const resolved = resolveVariant()
    if (!resolved) {
      console.error(`No matching variant SKU for selection: size=${selectedSize}, purity=${selectedPurity}, weight=${selectedWeight}, stone=${selectedStone}`)
      alert('Sorry, this combination is unavailable. Please contact us and we will help with your order.')
      return
    }

    const cartId = `${item.id}-${selectedSize || ''}-${selectedPurity || ''}-${selectedWeight || ''}-${selectedStone || ''}`

    addToCart({
      cartId,
      productId: item.id,
      productName: item.name,
      sku: resolved.sku,
      imageFile: item.imageFile,
      selectedSize,
      selectedPurity,
      selectedWeight,
      selectedStone,
      weight: resolved.weight,
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
                  onClick={() => handleSizeChange(s)}
                  className={`px-5 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-[0.1em] transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    selectedSize === s 
                      ? 'bg-white text-black border border-black shadow-[0_0_0_1px_black]' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-black/30'
                  }`}
                >
                  {s}
                </button>
              ))}
              {item.customSizes?.map((s) => (
                <button 
                  key={`cust-size-${s}`} 
                  onClick={() => handleSizeChange(s)}
                  className={`px-5 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-[0.1em] transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border-dashed flex items-center gap-1 ${
                    selectedSize === s 
                      ? 'bg-white text-black border-black shadow-[0_0_0_1px_black] border-solid' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-black/30'
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
                  onClick={() => handlePurityChange(p)}
                  className={`px-5 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-[0.1em] transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    selectedPurity === p 
                      ? 'bg-white text-black border border-black shadow-[0_0_0_1px_black]' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-black/30'
                  }`}
                >
                  {p}%
                </button>
              ))}
              {item.customPurities?.map((p) => (
                <button 
                  key={`cust-pur-${p}`} 
                  onClick={() => handlePurityChange(p)}
                  className={`px-5 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-[0.1em] transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border-dashed flex items-center gap-1 ${
                    selectedPurity === p 
                      ? 'bg-white text-black border-black shadow-[0_0_0_1px_black] border-solid' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-black/30'
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
                  onClick={() => handleWeightChange(w)}
                  className={`px-5 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-[0.1em] transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    selectedWeight === w 
                      ? 'bg-white text-black border border-black shadow-[0_0_0_1px_black]' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-black/30'
                  }`}
                >
                  {w}
                </button>
              ))}
              {item.customWeights?.map((w) => (
                <button 
                  key={`cust-weight-${w}`} 
                  onClick={() => handleWeightChange(w)}
                  className={`px-5 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-[0.1em] transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border-dashed flex items-center gap-1 ${
                    selectedWeight === w 
                      ? 'bg-white text-black border-black shadow-[0_0_0_1px_black] border-solid' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-black/30'
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
                  onClick={() => handleStoneChange(st)}
                  className={`px-5 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-[0.1em] transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    selectedStone === st 
                      ? 'bg-white text-black border border-black shadow-[0_0_0_1px_black]' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-black/30'
                  }`}
                >
                  {st}
                </button>
              ))}
              {item.customStones?.map((st) => (
                <button 
                  key={`cust-stone-${st}`} 
                  onClick={() => handleStoneChange(st)}
                  className={`px-5 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-[0.1em] transition-[box-shadow,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border-dashed flex items-center gap-1 ${
                    selectedStone === st 
                      ? 'bg-white text-black border-black shadow-[0_0_0_1px_black] border-solid' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-black/30'
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
          className="btn-primary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 gap-2"
        >
          {canAddToCart ? 'Add to Inquiry' : 'Please select options'}
        </button>
      </div>
    </div>
  )
}
