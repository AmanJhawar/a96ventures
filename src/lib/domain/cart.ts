import { CatalogItem } from '@/lib/types'

export type CartItem = {
  cartId: string;
  productId: string;
  productName: string;
  sku: string;
  imageFile: string;
  selectedSize?: string;
  selectedPurity?: string;
  selectedWeight?: string;
  selectedStone?: string;
  weight?: string;
  quantity: number;
}

export function reconcileCart(localItems: CartItem[], liveItems: CatalogItem[]): CartItem[] {
  const liveItemsMap = new Map(liveItems.map(i => [i.id, i]))
  const reconciled: CartItem[] = []
  
  for (const item of localItems) {
    const liveItem = liveItemsMap.get(item.productId)
    if (!liveItem) continue // Product was deleted

    let sku = item.sku
    let weight = item.weight
    const variants = liveItem.variantSkus ? Object.entries(liveItem.variantSkus) : []
    
    if (variants.length > 0) {
      const match = variants.find(([, d]) =>
        (d.size ?? undefined) === item.selectedSize &&
        (d.purity ?? undefined) === item.selectedPurity &&
        (d.stone ?? undefined) === item.selectedStone &&
        ((d.weight ?? undefined) === item.selectedWeight || item.selectedWeight === undefined)
      )
      if (match) {
        sku = match[0]
        weight = match[1].weight ?? item.weight
      }
    } else {
      sku = liveItem.sku || liveItem.id
      weight = liveItem.weight || ''
    }

    reconciled.push({
      ...item,
      productName: liveItem.name,
      imageFile: liveItem.imageFile,
      sku,
      weight
    })
  }

  // Prevent state update loop by returning the original array reference if nothing changed
  const isDifferent = JSON.stringify(localItems) !== JSON.stringify(reconciled)
  return isDifferent ? reconciled : localItems
}
