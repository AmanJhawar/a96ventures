"use client"

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import Link from 'next/link'
import { LogOut, LayoutDashboard, Users, Briefcase, Bookmark, MessageSquare, Menu, X, ShoppingCart, Warehouse, MapPin, BarChart3, ShieldCheck } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { AdminUser } from '@/lib/types'
import { PermissionsProvider } from '@/lib/context/PermissionsContext'
import { ROLE_PRESETS } from '@/lib/constants/permissions'

const navItems = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Inventory', href: '/admin/inventory', icon: Warehouse },
  { name: 'Sales', href: '/admin/sales', icon: ShoppingCart },
  { name: 'Locations', href: '/admin/locations', icon: MapPin },
  { name: 'Reports', href: '/admin/reports', icon: BarChart3 },
  { name: 'Inquiries', href: '/admin/inquiries', icon: MessageSquare },
  { name: 'Users & Access', href: '/admin/users', icon: ShieldCheck },
  { name: 'Team', href: '/admin/team', icon: Users },
  { name: 'Brands', href: '/admin/brands', icon: Bookmark },
  { name: 'Portfolio', href: '/admin/portfolio', icon: Briefcase },
]

function SidebarContent({
  setIsMobileMenuOpen,
  adminUser
}: {
  setIsMobileMenuOpen: (v: boolean) => void
  adminUser: AdminUser | null
}) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <>
      <div className="p-6 border-b border-gray-100 mb-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold tracking-tight hover:opacity-70 transition-opacity duration-200">
          Admin
        </Link>
        <button className="md:hidden p-2 -mr-2 text-gray-500 hover:text-black transition-[color,transform] active:scale-[0.97]" onClick={() => setIsMobileMenuOpen(false)}>
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
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-[box-shadow,background-color,border-color,color] duration-150 ${isActive
                  ? 'bg-white text-black outline outline-2 outline-offset-[-2px] outline-black shadow-[0_0_0_1px_black]'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-black'
                }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 mt-auto border-t border-gray-100 space-y-2">
        {adminUser && (
          <div className="px-3 py-2 bg-gray-50 rounded-lg">
            <div className="text-xs font-semibold text-black truncate">{adminUser.displayName}</div>
            <div className="text-[11px] text-gray-500 capitalize">{adminUser.role.replace('_', ' ')}</div>
          </div>
        )}
        <button
          onClick={() => {
            signOut(auth)
            router.push('/admin/login')
          }}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const { doc, getDoc } = await import('firebase/firestore/lite')
          const { db } = await import('@/lib/firebase/config')
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid))
          
          if (adminDoc.exists()) {
            const data = adminDoc.data()
            if (data.status === 'suspended') {
              setUser(null)
              setAdminUser(null)
              await signOut(auth)
              if (pathname !== '/admin/login') {
                router.push('/admin/login')
              }
              setLoading(false)
              return
            }

            const loaded: AdminUser = {
              id: currentUser.uid,
              email: data.email || currentUser.email || '',
              displayName: data.displayName || data.name || currentUser.displayName || 'Admin',
              phoneNumber: data.phoneNumber || '',
              role: data.role || 'super_admin',
              status: data.status || 'active',
              assignedLocationId: data.assignedLocationId || undefined,
              assignedLocationName: data.assignedLocationName || undefined,
              permissions: data.permissions || ROLE_PRESETS[data.role as keyof typeof ROLE_PRESETS] || ROLE_PRESETS.super_admin,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString()
            }
            setUser(currentUser)
            setAdminUser(loaded)
          } else {
            setUser(null)
            setAdminUser(null)
            if (pathname !== '/admin/login') {
              router.push('/admin/login')
            }
          }
        } catch (error) {
          console.error("Error checking admin status:", error)
          setUser(null)
          setAdminUser(null)
          if (pathname !== '/admin/login') {
            router.push('/admin/login')
          }
        }
      } else {
        setUser(null)
        setAdminUser(null)
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
    <PermissionsProvider adminUser={adminUser}>
      <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 text-black">
        {/* Mobile Top Bar */}
        <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-20">
          <span className="text-lg font-bold tracking-tight">A96 Admin</span>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -mr-2 text-gray-500 hover:text-black transition-[color,transform] active:scale-[0.97]">
            <Menu size={24} />
          </button>
        </div>

        {/* Desktop Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex sticky top-0 h-screen shrink-0">
          <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} adminUser={adminUser} />
        </aside>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <div className="md:hidden fixed inset-0 z-30" onClick={() => setIsMobileMenuOpen(false)}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className="absolute inset-0 bg-black/50"
              />
              <motion.aside
                initial={{ opacity: shouldReduceMotion ? 0 : 1, transform: shouldReduceMotion ? "none" : "translateX(-100%)" }}
                animate={{ opacity: 1, transform: shouldReduceMotion ? "none" : "translateX(0%)" }}
                exit={{ opacity: shouldReduceMotion ? 0 : 1, transform: shouldReduceMotion ? "none" : "translateX(-100%)" }}
                transition={{ duration: shouldReduceMotion ? 0.15 : 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="relative w-64 bg-white h-full flex flex-col z-10"
                onClick={e => e.stopPropagation()}
              >
                <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} adminUser={adminUser} />
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-12 overflow-y-auto min-h-screen">
          <div className={pathname.startsWith('/admin/inventory') || pathname.startsWith('/admin/sales') || pathname.startsWith('/admin/reports') || pathname.startsWith('/admin/users') ? 'w-full max-w-7xl mx-auto' : 'max-w-6xl mx-auto'}>
            {children}
          </div>
        </main>
      </div>
    </PermissionsProvider>
  )
}

