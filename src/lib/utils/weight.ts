/**
 * Bullion & Precious Metals Weight Precision Utility
 * 
 * In bullion and jewelry management, metal is weighed down to the milligram (0.001g).
 * Storing weights as whole integer milligrams (e.g. 10.500g = 10,500 mg) completely eliminates
 * JavaScript floating-point rounding errors and precision degradation.
 * 
 * Standard display on screen is always formatted to 3 decimal places (e.g. "10.000g", "48.256g").
 */

/**
 * Converts a weight in grams (float, number or numeric string) to whole integer milligrams.
 * E.g. 10.5 -> 10500, "48.256" -> 48256, 0.001 -> 1
 */
export function gramsToMg(grams: number | string | undefined | null): number {
  if (grams === undefined || grams === null || grams === '') return 0
  const num = typeof grams === 'string' ? parseFloat(grams) : grams
  if (isNaN(num)) return 0
  return Math.round(num * 1000)
}

/**
 * Converts whole integer milligrams back to decimal grams.
 * E.g. 10500 -> 10.5, 48256 -> 48.256, 1 -> 0.001
 */
export function mgToGrams(mg: number | undefined | null): number {
  if (mg === undefined || mg === null || isNaN(mg)) return 0
  return mg / 1000
}

/**
 * Formats a weight in grams with exactly 3 decimals on screen.
 * E.g. 10 -> "10.000g", 48.2 -> "48.200g", 48.256 -> "48.256g"
 */
export function formatWeight(
  grams: number | string | undefined | null,
  suffix = 'g'
): string {
  if (grams === undefined || grams === null || grams === '') return `0.000${suffix}`
  const num = typeof grams === 'string' ? parseFloat(grams) : grams
  if (isNaN(num)) return `0.000${suffix}`
  return `${num.toFixed(3)}${suffix}`
}

/**
 * Formats a weight stored as whole integer milligrams with exactly 3 decimals on screen.
 * E.g. 10500 -> "10.500g", 48256 -> "48.256g"
 */
export function formatMgToGrams(
  mg: number | undefined | null,
  suffix = 'g'
): string {
  if (mg === undefined || mg === null || isNaN(mg)) return `0.000${suffix}`
  return `${(mg / 1000).toFixed(3)}${suffix}`
}

/**
 * Calculates the exact arithmetic average weight from a collection of piece weights
 * using whole integer milligrams to eliminate any float drift.
 * Returns decimal grams with 3 decimal precision.
 */
export function calculateAverageWeight(weights: (number | string)[]): number {
  if (!weights || weights.length === 0) return 0
  const totalMg = weights.reduce<number>((acc, w) => acc + gramsToMg(w), 0)
  const avgMg = Math.round(totalMg / weights.length)
  return mgToGrams(avgMg)
}

/**
 * Calculates the total weight in milligrams from a collection of weights.
 */
export function calculateTotalWeightMg(weights: (number | string)[]): number {
  if (!weights || weights.length === 0) return 0
  return weights.reduce<number>((acc, w) => acc + gramsToMg(w), 0)
}
