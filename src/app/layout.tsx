import type { Metadata } from 'next'

import './globals.css'
import Header from '@/components/header'
import Footer from '@/components/footer'

import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', 'arial', 'sans-serif'],
})


export const metadata: Metadata = {
  metadataBase: new URL('https://a96ventures.com'),
  title: 'A96 Ventures',
  description: 'Early-stage venture capital focused on transformative technologies and exceptional founders.',
  icons: {
    icon: '/assets/favicon.svg',
  },

  openGraph: {
    title: 'A96 Ventures',
    description: 'Early-stage venture capital focused on transformative technologies and exceptional founders.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'A96 Ventures',
    description: 'Early-stage venture capital focused on transformative technologies and exceptional founders.',
  }
}

import { Toaster } from 'sonner'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${inter.className} min-h-screen flex flex-col text-black bg-white antialiased`}>
        <Header />
        <main className="flex-1 pt-20">
          {children}
        </main>
        <Footer />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              borderRadius: '8px',
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  )
}
