import { MetadataRoute } from 'next'
import { getPortfolioCompanies, getCatalogItems } from '@/lib/firebase/db'

export const dynamic = 'force-static'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://a96ventures.com'

  let portfolioUrls: MetadataRoute.Sitemap = []
  let catalogUrls: MetadataRoute.Sitemap = []

  try {
    const [companies, catalogItems] = await Promise.all([
      getPortfolioCompanies(),
      getCatalogItems()
    ])

    portfolioUrls = companies.map((c) => ({
      url: `${baseUrl}/portfolio/${c.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

    catalogUrls = catalogItems.map((item) => ({
      url: `${baseUrl}/catalog/${item.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch (error) {
    console.error('Error fetching dynamic urls for sitemap:', error)
  }

  const staticUrls: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 1.0 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/team`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/portfolio`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.8 },
    { url: `${baseUrl}/brands`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.8 },
    { url: `${baseUrl}/catalog`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.9 },
    { url: `${baseUrl}/insights`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.6 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.5 },
  ]

  return [...staticUrls, ...portfolioUrls, ...catalogUrls]
}
