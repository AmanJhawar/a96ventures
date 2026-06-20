import { VariantDetail } from '@/lib/types'

export interface InventoryItem {
  id: string
  sku: string
  name: string
  category: string
  hasVariants: boolean
  standardSizes?: string[]
  customSizes?: string[]
  standardPurities?: string[]
  customPurities?: string[]
  standardWeights?: string[]
  customWeights?: string[]
  standardStones?: string[]
  customStones?: string[]
  variantSkus?: Record<string, VariantDetail>
  variantImages?: Record<string, string[]>
  weight: string
  material?: string
  additionalImages?: string[]
  description: string
  imageFile: string
  orderIndex?: number
  searchTerms?: string[]
}

export const hasStonesCategory = (category?: string) => {
  if (!category) return false
  const c = category.toLowerCase()
  return c.includes('marble') || c.includes('photoframe')
}

export const isNoPurityCategory = (category?: string) => {
  if (!category) return false
  return hasStonesCategory(category) || category.includes('bullion')
}

export const getSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return [...(item.standardStones || []), ...(item.customStones || [])]
  if (item.category?.includes('Bullion')) return [...(item.standardWeights || []), ...(item.customWeights || [])]
  return [...(item.standardSizes || []), ...(item.customSizes || [])]
}

export const getStandardSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return item.standardStones || []
  if (item.category?.includes('Bullion')) return item.standardWeights || []
  return item.standardSizes || []
}

export const getCustomSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return item.customStones || []
  if (item.category?.includes('Bullion')) return item.customWeights || []
  return item.customSizes || []
}

export type VariantCombo = { key: string; label: string; attrs: VariantDetail }

export const buildVariantCombos = (item: Partial<InventoryItem>): VariantCombo[] => {
  const stones = hasStonesCategory(item.category)
  const bullion = !!item.category?.includes('Bullion')
  const noPurity = stones || bullion

  if (stones) {
    const all = [...(item.standardStones || []), ...(item.customStones || [])]
    return all.map(s => ({ key: `stone:${s}`, label: s, attrs: { stone: s } }))
  }

  if (bullion) {
    const all = [...(item.standardWeights || []), ...(item.customWeights || [])]
    return all.map(w => ({ key: `weight:${w}`, label: w, attrs: { weight: w } }))
  }

  const sizes = [...(item.standardSizes || []), ...(item.customSizes || [])]
  const purities = noPurity ? [] : [...(item.standardPurities || []), ...(item.customPurities || [])]
  if (sizes.length === 0 || purities.length === 0) return []

  const combos: VariantCombo[] = []
  sizes.forEach(s =>
    purities.forEach(p =>
      combos.push({ key: `size:${s}|purity:${p}`, label: `${s} | ${p}`, attrs: { size: s, purity: p } })
    )
  )
  return combos
}
