import type { Metadata } from 'next'
import BrandsClient from './brands-client'

export const metadata: Metadata = {
  title: 'Brands | A96 Ventures',
  description: 'Explore our premium consumer brands and luxury collections.',
  openGraph: {
    title: 'Brands | A96 Ventures',
    description: 'Explore our premium consumer brands and luxury collections.',
  },
  twitter: {
    title: 'Brands | A96 Ventures',
    description: 'Explore our premium consumer brands and luxury collections.',
  }
}

export default function Brands() {
  return <BrandsClient />
}
