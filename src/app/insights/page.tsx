import type { Metadata } from 'next'
import InsightsClient from './insights-client'

export const metadata: Metadata = {
  title: 'Insights | A96 Ventures',
  description: 'Our perspectives on technology, investing, and building category-defining companies.',
  openGraph: {
    title: 'Insights | A96 Ventures',
    description: 'Our perspectives on technology, investing, and building category-defining companies.',
  },
  twitter: {
    title: 'Insights | A96 Ventures',
    description: 'Our perspectives on technology, investing, and building category-defining companies.',
  }
}

export default function Insights() {
  return <InsightsClient />
}
