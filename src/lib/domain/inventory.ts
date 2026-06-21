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

export const isBullionCategory = (category?: string) => {
  if (!category) return false
  return category.toLowerCase().includes('bullion')
}

export const isNoPurityCategory = (category?: string) => {
  return hasStonesCategory(category) || isBullionCategory(category)
}

export const getSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return [...(item.standardStones || []), ...(item.customStones || [])]
  if (isBullionCategory(item.category)) return [...(item.standardWeights || []), ...(item.customWeights || [])]
  return [...(item.standardSizes || []), ...(item.customSizes || [])]
}

export const getStandardSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return item.standardStones || []
  if (isBullionCategory(item.category)) return item.standardWeights || []
  return item.standardSizes || []
}

export const getCustomSizeMatrix = (item: Partial<InventoryItem>) => {
  if (hasStonesCategory(item.category)) return item.customStones || []
  if (isBullionCategory(item.category)) return item.customWeights || []
  return item.customSizes || []
}

export type VariantCombo = { key: string; label: string; attrs: VariantDetail }

export const buildVariantCombos = (item: Partial<InventoryItem>): VariantCombo[] => {
  const stones = hasStonesCategory(item.category)
  const bullion = isBullionCategory(item.category)
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

export const buildSearchTerms = (item: Partial<InventoryItem>): string[] => {
  const terms = new Set<string>()

  const addPrefixes = (str?: string) => {
    if (!str) return
    const s = str.toLowerCase().trim()
    if (!s) return

    const generateForWordList = (wordList: string[], separator: string) => {
      for (let i = 0; i < wordList.length; i++) {
        const remainingString = wordList.slice(i).join(separator)
        for (let len = 2; len <= remainingString.length; len++) {
          terms.add(remainingString.substring(0, len))
        }
      }
    }

    // 1. Generate prefixes keeping original separators (e.g. "Silver Ganesha" -> "si", "sil", ..., "silver ganesha")
    generateForWordList(s.split(/\s+/), ' ')

    // 2. Generate prefixes splitting by non-alphanumeric (e.g. "A96-001" -> "a9", "a96", "00", "001")
    generateForWordList(s.split(/[^a-z0-9]+/).filter(Boolean), ' ')
  }

  addPrefixes(item.name)
  addPrefixes(item.sku)
  addPrefixes(item.id)
  addPrefixes(item.category)
  addPrefixes(item.material)

  const matrices = [
    ...(item.standardSizes || []), ...(item.customSizes || []),
    ...(item.standardPurities || []), ...(item.customPurities || []),
    ...(item.standardWeights || []), ...(item.customWeights || []),
    ...(item.standardStones || []), ...(item.customStones || [])
  ]

  matrices.forEach(m => addPrefixes(m))

  if (item.variantSkus) {
    Object.keys(item.variantSkus).forEach(sku => addPrefixes(sku))
  }

  return Array.from(terms)
}
