import type { Metadata } from 'next'
import TeamClient from './team-client'

export const metadata: Metadata = {
  title: 'Our Team | A96 Ventures',
  description: 'Investors and operators who build alongside founders.',
}

export default function Team() {
  return <TeamClient />
}
