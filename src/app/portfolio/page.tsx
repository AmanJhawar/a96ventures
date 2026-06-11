import type { Metadata } from 'next'
import PortfolioClient from './portfolio-client'

export const metadata: Metadata = {
  title: 'Portfolio | A96 Ventures',
  description: 'We invest in exceptional founders building transformative companies across multiple sectors.',
}

export default function Portfolio() {
  return <PortfolioClient />
}
