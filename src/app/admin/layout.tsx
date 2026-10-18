"use client"

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import Link from 'next/link'
import { LogOut, LayoutDashboard, Users, Briefcase, Bookmark, MessageSquare, Menu, X, ShoppingCart, Warehouse, MapPin, BarChart3, ShieldCheck } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { AdminUser, UserPermissions, UserRole } from '@/lib/types'
import { PermissionsProvider, usePermissions } from '@/lib/context/PermissionsContext'
import { SUPER_ADMIN_PERMISSIONS, EMPTY_PERMISSIONS } from '@/lib/constants/permissions'

interface NavItemConfig {
  name: string
  href: string
  icon: typeof LayoutDashboard
  module?: keyof UserPermissions
  action?: string
}

const navItems: NavItemConfig[] = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Inventory', href: '/admin/inventory', icon: Warehouse, module: 'products', action: 'view' },
  { name: 'Sales', href: '/admin/sales', icon: ShoppingCart, module: 'sales', action: 'view' },
  { name: 'Locations', href: '/admin/locations', icon: MapPin, module: 'locations', action: 'view' },
  { name: 'Reports', href: '/admin/reports', icon: BarChart3, module: 'reports', action: 'view' },
  { name: 'Inquiries', href: '/admin/inquiries', icon: MessageSquare, module: 'inquiries', action: 'view' },
  { name: 'Users & Access', href: '/admin/users', icon: ShieldCheck, module: 'users', action: 'view' },
  { name: 'Team', href: '/admin/team', icon: Users, module: 'team', action: 'view' },
  { name: 'Brands', href: '/admin/brands', icon: Bookmark, module: 'brands', action: 'view' },
  { name: 'Portfolio', href: '/admin/portfolio', icon: Briefcase, module: 'portfolio', action: 'view' },
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
  const { hasPermission, isSuperAdmin } = usePermissions()

  // Show all sections for administrators. Only filter for explicitly restricted sub-operators.
  const isRestrictedOperator = adminUser && adminUser.role !== 'super_admin' && !isSuperAdmin
  const accessibleNavItems = isRestrictedOperator
    ? navItems.filter((item) => {
        if (!item.module) return true
        return hasPermission(item.module, item.action || 'view')
      })
    : navItems

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
        {accessibleNavItems.map((item) => {
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
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // Check for token custom claims
          let tokenResult = await currentUser.getIdTokenResult()
          let claims = tokenResult.claims

          // Fetch the admin record in Firestore
          const { doc, getDoc } = await import('firebase/firestore/lite')
          const { db } = await import('@/lib/firebase/config')
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid))
          
          if (!adminDoc.exists()) {
            // TREAT MISSING PROFILE AS AN ERROR: Never fail open or silently pass
            setUser(currentUser)
            setAdminUser(null)
            setProfileError('Admin Profile Not Found: No administrator profile exists for this account in the database. Access is strictly denied.')
            setLoading(false)
            return
          }

          const data = adminDoc.data()
          if (!data) {
            setUser(currentUser)
            setAdminUser(null)
            setProfileError('Admin Profile Error: Administrator profile record is empty. Access is strictly denied.')
            setLoading(false)
            return
          }

          if (data.status === 'suspended') {
            setUser(currentUser)
            setAdminUser(null)
            setProfileError('Account Suspended: Your operator account has been suspended by an administrator.')
            setLoading(false)
            return
          }

          // Resolve role: existing admin profile without explicit role or with 'admin' maps to 'super_admin'
          const role: UserRole =
            (data.role === 'admin' || data.role === 'super_admin' || !data.role)
              ? 'super_admin'
              : (data.role as UserRole)
          const isSuperAdmin = role === 'super_admin'
          const status = data.status || 'active'

          // If the auth token doesn't have custom claims yet, sync with server
          if (!claims.role) {
            try {
              const syncRes = await fetch('/api/admin/auth/sync', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${tokenResult.token}`
                }
              })
              if (syncRes.ok) {
                tokenResult = await currentUser.getIdTokenResult(true)
                claims = tokenResult.claims
              }
            } catch (syncErr) {
              console.warn('Notice: Custom claims sync error:', syncErr)
            }
          }

          // STRICT DEFAULT DENY:
          // Non-super_admin accounts with missing permissions strictly default to EMPTY_PERMISSIONS (zero access).
          const permissions: UserPermissions =
            isSuperAdmin
              ? SUPER_ADMIN_PERMISSIONS
              : (data.permissions || (claims.permissions as UserPermissions) || EMPTY_PERMISSIONS)

          const loaded: AdminUser = {
            id: currentUser.uid,
            email: data.email || currentUser.email || '',
            displayName: data.displayName || data.name || currentUser.displayName || 'Operator',
            phoneNumber: data.phoneNumber || '',
            role,
            status: data.status,
            assignedLocationId: data.assignedLocationId || undefined,
            assignedLocationName: data.assignedLocationName || undefined,
            permissions,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString()
          }

          setProfileError(null)
          setUser(currentUser)
          setAdminUser(loaded)
        } catch (error) {
          console.error("Error verifying admin authentication:", error)
          setUser(currentUser)
          setAdminUser(null)
          setProfileError('Verification Error: Failed to verify administrator credentials.')
        }
      } else {
        setUser(null)
        setAdminUser(null)
        setProfileError(null)
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
    setIsMobileMenuOpen(false)
  }, [pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-black"></div>
      </div>
    )
  }

  // If on login page, render without sidebar
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  // TREAT MISSING PROFILE AS AN EXPLICIT ERROR
  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-black">
        <div className="max-w-md w-full bg-white border border-gray-200 p-8 rounded-xl shadow-sm space-y-6">
          <div className="flex items-center space-x-3 text-black">
            <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">
              !
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Access Denied</h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5">ADMIN_PROFILE_ERROR</p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 leading-relaxed">
            {profileError}
          </div>

          <div className="pt-2">
            <button
              onClick={async () => {
                await signOut(auth)
                setUser(null)
                setAdminUser(null)
                setProfileError(null)
                router.push('/admin/login')
              }}
              className="admin-btn-primary w-full text-center flex items-center justify-center"
            >
              Sign Out & Return to Login
            </button>
          </div>
        </div>
      </div>
    )
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
