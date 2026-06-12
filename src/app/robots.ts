import { MetadataRoute } from 'next'
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/admin/',
    },
    sitemap: 'https://a96ventures.com/sitemap.xml',
  }
}
