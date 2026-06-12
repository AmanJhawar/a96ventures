"use client"

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import Link from 'next/link'
import { LogOut, LayoutDashboard, Package, Users, Briefcase, Bookmark, MessageSquare, Tags, Menu, X } from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Catalog', href: '/admin/catalog', icon: Package },
  { name: 'Categories', href: '/admin/categories', icon: Tags },
  { name: 'Inquiries', href: '/admin/inquiries', icon: MessageSquare },
  { name: 'Team', href: '/admin/team', icon: Users },
  { name: 'Brands', href: '/admin/brands', icon: Bookmark },
  { name: 'Portfolio', href: '/admin/portfolio', icon: Briefcase },
]

function SidebarContent({ setIsMobileMenuOpen }: { setIsMobileMenuOpen: (v: boolean) => void }) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <>
      <div className="p-6 border-b border-gray-100 mb-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold tracking-tight hover:opacity-70 transition-opacity duration-200">
          Admin
        </Link>
        <button className="md:hidden p-2 -mr-2 text-gray-500 hover:text-black" onClick={() => setIsMobileMenuOpen(false)}>
          <X size={20} />
        </button>
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
            signOut(auth)
            router.push('/admin/login')
          }}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-150"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const { doc, getDoc } = await import('firebase/firestore/lite')
          const { db } = await import('@/lib/firebase/config')
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid))
          
          if (adminDoc.exists()) {
            setUser(currentUser)
          } else {
            setUser(null)
            if (pathname !== '/admin/login') {
              router.push('/admin/login')
            }
          }
        } catch (error) {
          console.error("Error checking admin status:", error)
          setUser(null)
          if (pathname !== '/admin/login') {
            router.push('/admin/login')
          }
        }
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

  // Close mobile menu on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobileMenuOpen(false)
  }, [pathname])

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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 text-black">
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-20">
        <span className="text-lg font-bold tracking-tight">A96 Admin</span>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -mr-2 text-gray-600 hover:text-black">
          <Menu size={24} />
        </button>
      </div>

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex sticky top-0 h-screen shrink-0">
        <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="w-64 bg-white h-full flex flex-col transform transition-transform" onClick={e => e.stopPropagation()}>
            <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto min-h-screen">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}

