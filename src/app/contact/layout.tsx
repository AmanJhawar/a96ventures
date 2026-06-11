import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact | A96 Ventures',
  description: 'Get in touch with A96 Ventures for inquiries, press, and startup pitches.',
  openGraph: {
    title: 'Contact | A96 Ventures',
    description: 'Get in touch with A96 Ventures for inquiries, press, and startup pitches.',
  },
  twitter: {
    title: 'Contact | A96 Ventures',
    description: 'Get in touch with A96 Ventures for inquiries, press, and startup pitches.',
  }
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
