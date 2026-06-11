import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Catalog | A96 Ventures',
  description: 'Explore our exclusive collections of premium products.',
  openGraph: {
    title: 'Catalog | A96 Ventures',
    description: 'Explore our exclusive collections of premium products.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Catalog | A96 Ventures',
    description: 'Explore our exclusive collections of premium products.',
  }
}

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
