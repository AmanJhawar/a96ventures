'use client'

import { useCart } from '@/components/cart-provider'
import type { CatalogItem } from '@/lib/types'

export function AddToCartSection({ item }: { item: CatalogItem }) {
  const { addToCart } = useCart()

  const handleAddToCart = () => {
    addToCart({
      cartId: item.id,
      productId: item.id,
      productName: item.name,
      sku: item.sku || item.id,
      imageFile: item.imageFile,
      weight: item.weight,
      quantity: 1
    })
  }

  return (
    <div className="flex flex-col gap-8 mb-10">
      <div className="pt-4 flex flex-col gap-4">
        <button 
          onClick={handleAddToCart}
          className="w-full sm:w-auto px-8 py-4 bg-black text-white rounded-lg font-semibold text-sm hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97] flex items-center justify-center gap-2"
        >
          Add to Enquiry
        </button>
      </div>
    </div>
  )
}

