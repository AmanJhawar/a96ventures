import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import Header from '@/components/header'
import Footer from '@/components/footer'
import DisableDevTools from '@/components/disable-dev-tools'

const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'A96 Ventures',
  description: 'Early-stage venture capital focused on transformative technologies and exceptional founders.',
  openGraph: {
    title: 'A96 Ventures',
    description: 'Early-stage venture capital focused on transformative technologies and exceptional founders.',
    type: 'website',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${outfit.className} min-h-screen flex flex-col text-black bg-white antialiased`}>
        <DisableDevTools />
        <Header />
        <main className="flex-1 pt-20">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
