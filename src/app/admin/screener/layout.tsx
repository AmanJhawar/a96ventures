"use client"

import NavBar from '@/components/screener/nav-bar'
import { ToastProvider } from '@/components/screener/toast-context'

export default function ScreenerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex flex-col gap-6">
        <NavBar />
        <div>
          {children}
        </div>
      </div>
    </ToastProvider>
  )
}
