import type { Metadata } from 'next'
import PortfolioClient from './portfolio-client'

export const metadata: Metadata = {
  title: 'Portfolio | A96 Ventures',
  description: 'Discover the transformative companies and exceptional founders we partner with.',
  openGraph: {
    title: 'Portfolio | A96 Ventures',
    description: 'Discover the transformative companies and exceptional founders we partner with.',
  },
  twitter: {
    title: 'Portfolio | A96 Ventures',
    description: 'Discover the transformative companies and exceptional founders we partner with.',
  },
}

export default function Portfolio() {
  return <PortfolioClient />
}
