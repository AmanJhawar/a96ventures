import type { Metadata } from 'next'
import TeamClient from './team-client'

export const metadata: Metadata = {
  title: 'Team | A96 Ventures',
  description: 'Meet the team behind A96 Ventures.',
  openGraph: {
    title: 'Team | A96 Ventures',
    description: 'Meet the team behind A96 Ventures.',
  },
  twitter: {
    title: 'Team | A96 Ventures',
    description: 'Meet the team behind A96 Ventures.',
  },
}

export default function Team() {
  return <TeamClient />
}
