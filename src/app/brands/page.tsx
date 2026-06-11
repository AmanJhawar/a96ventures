import type { Metadata } from 'next'
import BrandsClient from './brands-client'

export const metadata: Metadata = {
  title: 'Our Brands | A96 Ventures',
  description: 'The brands we build.',
}

export default function Brands() {
  return <BrandsClient />
}
