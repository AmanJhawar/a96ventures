import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import Header from '@/components/header'
import Footer from '@/components/footer'
import DisableDevTools from '@/components/disable-dev-tools'

const outfit = Outfit({ subsets: ['latin'] })

import { CartProvider } from '@/components/cart-provider'
import { CartDrawer } from '@/components/cart-drawer'

export const metadata: Metadata = {
  metadataBase: new URL('https://a96ventures.com'),
  title: 'A96 Ventures',
  description: 'Early-stage venture capital focused on transformative technologies and exceptional founders.',
  openGraph: {
    title: 'A96 Ventures',
    description: 'Early-stage venture capital focused on transformative technologies and exceptional founders.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A96 Ventures',
    description: 'Early-stage venture capital focused on transformative technologies and exceptional founders.',
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${outfit.className} min-h-screen flex flex-col text-black bg-white antialiased`}>
        <CartProvider>
          <DisableDevTools />
          <Header />
          <CartDrawer />
          <main className="flex-1 pt-20">
            {children}
          </main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  )
}
