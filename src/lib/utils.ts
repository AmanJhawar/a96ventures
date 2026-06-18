import type { CatalogItem } from './types'

/**
 * Resolves the ordered gallery of image URLs for a product given an optional
 * selected variant. Behaviour differs by category:
 *
 * - Marble Photoframes / Bullions: full gallery override — if variantImages has
 *   an entry for the selected variant, show only those images.
 * - Silver Articles (and anything else): partial override — replace only the
 *   last image in the default gallery with the variant's override image.
 *
 * Falls back to the default gallery ([imageFile, ...additionalImages]) when no
 * variant is selected or no override is defined for the selected variant.
 */
export function resolveGallery(item: CatalogItem, selectedVariant?: string): string[] {
  const defaultGallery = [item.imageFile, ...(item.additionalImages ?? [])].filter(Boolean)

  if (!selectedVariant || !item.variantImages?.[selectedVariant]?.length) {
    return defaultGallery
  }

  const overrideImages = item.variantImages[selectedVariant]
  const isFullOverride =
    item.category?.includes('Marble') ||
    item.category?.includes('Photoframe') ||
    item.category?.includes('Bullion')

  if (isFullOverride) {
    return overrideImages
  }

  // Silver Articles: swap only the last slide
  const override = overrideImages[0]
  if (!override || defaultGallery.length === 0) return defaultGallery
  return [...defaultGallery.slice(0, -1), override]
}
