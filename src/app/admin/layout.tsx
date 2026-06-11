"use client"

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import Link from 'next/link'
import { LogOut, LayoutDashboard, Package, Users, Briefcase, Bookmark, MessageSquare, Newspaper } from 'lucide-react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email === 'aman@a96ventures.com') {
        setUser(currentUser)
      } else {
        setUser(null)
        if (pathname !== '/admin/login') {
          router.push('/admin/login')
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [router, pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-black"></div>
      </div>
    )
  }

  // If on login page, just render it without sidebar
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  if (!user) {
    return null // Guard against flashing
  }

  const navItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Inventory', href: '/admin/inventory', icon: Package },
    { name: 'Inquiries', href: '/admin/inquiries', icon: MessageSquare },
    { name: 'Team', href: '/admin/team', icon: Users },
    { name: 'Brands', href: '/admin/brands', icon: Bookmark },
    { name: 'Portfolio', href: '/admin/portfolio', icon: Briefcase },
    { name: 'Insights', href: '/admin/insights', icon: Newspaper },
  ]

  return (
    <div className="min-h-screen flex bg-gray-50 text-black">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex sticky top-0 h-screen">
        <div className="p-6 border-b border-gray-100 mb-4">
          <Link href="/" className="text-xl font-bold tracking-tight hover:opacity-70 transition-opacity duration-200">
            Admin
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/admin')
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-150 ${isActive
                    ? 'bg-black text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-black'
                  }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100 mt-auto">
          <button
            onClick={() => {
              if (typeof window !== 'undefined') localStorage.removeItem('devBypass')
              signOut(auth)
              router.push('/admin/login')
            }}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-150"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 md:p-12 overflow-y-auto min-h-screen">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
