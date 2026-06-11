import type { Metadata } from 'next'
import InsightsClient from './insights-client'

export const metadata: Metadata = {
  title: 'Insights | A96 Ventures',
  description: 'What we\'re thinking about.',
}

export default function Insights() {
  return <InsightsClient />
}
