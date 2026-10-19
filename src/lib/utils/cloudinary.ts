/**
 * Injects Cloudinary transformations (auto format, auto quality, width constraint)
 * into a secure URL. Also handles fallback pathing for local/legacy images.
 */
export function getOptimizedUrl(url?: string, width = 1600): string {
  if (!url) return ''
  const trimmed = url.trim()
  
  // Apply Cloudinary transformations if it's a raw Cloudinary URL
  if (trimmed.includes('res.cloudinary.com') && trimmed.includes('/upload/') && !trimmed.includes('/upload/f_')) {
    return trimmed.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
  }
  
  // Return the URL as-is if absolute, otherwise prefix with /assets/
  return trimmed.startsWith('http') ? trimmed : `/assets/${trimmed}`
}
