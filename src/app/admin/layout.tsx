"use client"

import { useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import Link from 'next/link'
import { LogOut, LayoutDashboard, Users, Briefcase, Bookmark, MessageSquare, Menu, X, ShoppingCart, Warehouse, MapPin, BarChart3, ShieldCheck, Lock, Shield } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { AdminUser, UserPermissions, UserRole, UserStatus } from '@/lib/types'
import { PermissionsProvider, usePermissions } from '@/lib/context/PermissionsContext'
import { ArchiveProvider } from '@/lib/context/ArchiveContext'
import { SUPER_ADMIN_PERMISSIONS, EMPTY_PERMISSIONS, shortCodesToPermissions } from '@/lib/constants/permissions'
import { TwoFactorModal } from '@/components/two-factor-modal'

interface NavItemConfig {
  name: string
  href: string
  icon: typeof LayoutDashboard
  module?: keyof UserPermissions
  action?: string
}

interface NavGroupConfig {
  title: string
  items: NavItemConfig[]
}

const navGroups: NavGroupConfig[] = [
  {
    title: 'Operations',
    items: [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { name: 'Reports', href: '/admin/reports', icon: BarChart3, module: 'reports', action: 'view' },
      { name: 'Inquiries', href: '/admin/inquiries', icon: MessageSquare, module: 'inquiries', action: 'view' },
      { name: 'Users', href: '/admin/users', icon: ShieldCheck, module: 'users', action: 'view' },
    ]
  },
  {
    title: 'Store',
    items: [
      { name: 'Inventory', href: '/admin/inventory', icon: Warehouse, module: 'products', action: 'view' },
      { name: 'Sales', href: '/admin/sales', icon: ShoppingCart, module: 'sales', action: 'view' },
      { name: 'Locations', href: '/admin/locations', icon: MapPin, module: 'locations', action: 'view' },
    ]
  },
  {
    title: 'Website',
    items: [
      { name: 'Brands', href: '/admin/brands', icon: Bookmark, module: 'brands', action: 'view' },
      { name: 'Team', href: '/admin/team', icon: Users, module: 'team', action: 'view' },
      { name: 'Portfolio', href: '/admin/portfolio', icon: Briefcase, module: 'portfolio', action: 'view' },
    ]
  }
]

// 30 minutes of inactivity for staff handling cash/stock
const IDLE_TIMEOUT_MS = 30 * 60 * 1000
const ADMIN_LAST_ACTIVITY_KEY = 'admin_last_activity'


function AdminPageGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isSuperAdmin, hasPermission, adminUser } = usePermissions()

  // Super admins have unrestricted access
  if (isSuperAdmin) {
    return <>{children}</>
  }

  // Determine required view permission based on pathname
  let hasAccess = true
  let requiredSection = ''

  if (pathname === '/admin/users' || pathname.startsWith('/admin/users/')) {
    hasAccess = false // Only super admins
    requiredSection = 'Users & Access management (Super Admin exclusive)'
  } else if (pathname === '/admin/reports' || pathname.startsWith('/admin/reports/')) {
    hasAccess = hasPermission('reports', 'view')
    requiredSection = 'Reports & Analytics'
  } else if (pathname === '/admin/inventory' || pathname.startsWith('/admin/inventory/')) {
    hasAccess =
      hasPermission('products', 'view') ||
      hasPermission('purchases', 'view') ||
      hasPermission('movements', 'view')
    requiredSection = 'Inventory, Catalog & Movements'
  } else if (pathname === '/admin/sales' || pathname.startsWith('/admin/sales/')) {
    hasAccess = hasPermission('sales', 'view') || hasPermission('returns', 'view')
    requiredSection = 'Sales & Returns'
  } else if (pathname === '/admin/locations' || pathname.startsWith('/admin/locations/')) {
    hasAccess = hasPermission('locations', 'view')
    requiredSection = 'Locations Management'
  } else if (pathname === '/admin/inquiries' || pathname.startsWith('/admin/inquiries/')) {
    hasAccess = hasPermission('inquiries', 'view')
    requiredSection = 'Customer Inquiries'
  } else if (pathname === '/admin/team' || pathname.startsWith('/admin/team/')) {
    hasAccess = hasPermission('team', 'view')
    requiredSection = 'Team Management'
  } else if (pathname === '/admin/brands' || pathname.startsWith('/admin/brands/')) {
    hasAccess = hasPermission('brands', 'view')
    requiredSection = 'Brand Partners'
  } else if (pathname === '/admin/portfolio' || pathname.startsWith('/admin/portfolio/')) {
    hasAccess = hasPermission('portfolio', 'view')
    requiredSection = 'Portfolio Management'
  }

  if (!hasAccess) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-black">
          <Lock size={22} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-black mb-2">Access Denied</h2>
        <p className="text-sm text-gray-500 max-w-md mb-6">
          Your account ({adminUser?.role?.replace('_', ' ') || 'Staff'}) does not have permission to view {requiredSection}.
        </p>
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97]"
        >
          Back to Dashboard
        </Link>
      </div>
    )
  }

  return <>{children}</>
}

function SidebarContent({
  setIsMobileMenuOpen,
  adminUser,
  onOpenTwoFactor
}: {
  setIsMobileMenuOpen: (v: boolean) => void
  adminUser: AdminUser | null
  onOpenTwoFactor?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { hasPermission, isSuperAdmin } = usePermissions()

  // Gate menu items strictly on their view permissions
  const accessibleGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (isSuperAdmin) return true
          if (item.href === '/admin/users') return false
          if (item.href === '/admin/inventory') {
            return (
              hasPermission('products', 'view') ||
              hasPermission('purchases', 'view') ||
              hasPermission('movements', 'view')
            )
          }
          if (!item.module) return true
          return hasPermission(item.module, item.action || 'view')
        })
      }))
      .filter((group) => group.items.length > 0)
  }, [isSuperAdmin, hasPermission])

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

      <nav className="flex-1 px-3 space-y-4 overflow-y-auto">
        {accessibleGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
              {group.title}
            </div>
            {group.items.map((item) => {
              const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/admin')
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                    isActive
                      ? 'bg-black text-white shadow-xs'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-black'
                  }`}
                >
                  <Icon size={16} strokeWidth={isActive ? 2 : 1.75} className="shrink-0" />
                  {item.name}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 mt-auto border-t border-gray-100 space-y-2">
        {adminUser && (
          <div className="px-3 py-2 bg-gray-50 rounded-lg">
            <div className="text-xs font-semibold text-black truncate">{adminUser.displayName}</div>
            <div className="text-[11px] text-gray-500 capitalize">{adminUser.role.replace('_', ' ')}</div>
          </div>
        )}
        {onOpenTwoFactor && (
          <button
            onClick={onOpenTwoFactor}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
          >
            <Shield size={16} />
            Two-Factor Auth
          </button>
        )}
        <button
          onClick={async () => {
            if (typeof window !== 'undefined') {
              localStorage.removeItem(ADMIN_LAST_ACTIVITY_KEY)
            }
            await signOut(auth)
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
  const [isTwoFactorOpen, setIsTwoFactorOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const shouldReduceMotion = useReducedMotion()

  // Subscribe to auth state once on mount without re-subscribing on every route change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Enforce 15-minute idle expiration even after browser refresh, sleeping laptop, or background tab
        if (typeof window !== 'undefined') {
          const storedLast = localStorage.getItem(ADMIN_LAST_ACTIVITY_KEY)
          let isExpired = false

          if (storedLast) {
            const lastTime = Number(storedLast)
            if (!isNaN(lastTime) && Date.now() - lastTime > IDLE_TIMEOUT_MS) {
              isExpired = true
            }
          } else if (currentUser.metadata?.lastSignInTime) {
            // Fallback for initial migration or cleared cache: compare against Firebase lastSignInTime
            const lastSignIn = new Date(currentUser.metadata.lastSignInTime).getTime()
            if (!isNaN(lastSignIn) && Date.now() - lastSignIn > IDLE_TIMEOUT_MS) {
              isExpired = true
            }
          }

          if (isExpired) {
            try {
              localStorage.removeItem(ADMIN_LAST_ACTIVITY_KEY)
              await signOut(auth)
            } catch (err) {
              console.error('Error signing out on expired idle session:', err)
            }
            setUser(null)
            setAdminUser(null)
            setLoading(false)
            router.push('/admin/login?reason=idle')
            return
          }

          // If session is valid, ensure activity timestamp exists
          if (!storedLast) {
            localStorage.setItem(ADMIN_LAST_ACTIVITY_KEY, Date.now().toString())
          }
        }

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
            setProfileError('Account Suspended: Your user account has been suspended by an administrator.')
            setLoading(false)
            return
          }

          // STRICT DEFAULT DENY:
          // A missing role must NEVER default to super_admin.
          if (!data.role) {
            setUser(currentUser)
            setAdminUser(null)
            setProfileError('Access Denied: Administrator profile has no assigned role. Access is strictly denied.')
            setLoading(false)
            return
          }

          const role: UserRole = data.role as UserRole
          const isSuperAdmin = role === 'super_admin'
          const status: UserStatus = (data.status as UserStatus) || 'active'

          // If the profile document lacks a status field, persist the worked-out status
          if (!data.status) {
            try {
              const { updateDoc } = await import('firebase/firestore/lite')
              await updateDoc(doc(db, 'admins', currentUser.uid), {
                status: 'active'
              })
            } catch (statusWriteErr) {
              console.warn('Notice: Failed to auto-populate missing status field:', statusWriteErr)
            }
          }

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
              : (data.permissions || (Array.isArray(claims.perms) ? shortCodesToPermissions(claims.perms as string[]) : undefined) || (claims.permissions as UserPermissions) || EMPTY_PERMISSIONS)

          const loaded: AdminUser = {
            id: currentUser.uid,
            email: data.email || currentUser.email || '',
            displayName: data.displayName || data.name || currentUser.displayName || 'User',
            phoneNumber: data.phoneNumber || '',
            role,
            status,
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
        if (typeof window !== 'undefined' && window.location.pathname !== '/admin/login') {
          router.push('/admin/login')
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  // Idle session timeout (30 minutes of inactivity for staff handling cash/stock)
  useEffect(() => {
    if (!user) return

    let timeoutId: NodeJS.Timeout
    let lastWriteTime = Date.now()

    const handleTimeout = async () => {
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(ADMIN_LAST_ACTIVITY_KEY)
        }
        await signOut(auth)
      } catch (err) {
        console.error('Error signing out after idle timeout:', err)
      }
      setUser(null)
      setAdminUser(null)
      router.push('/admin/login?reason=idle')
    }

    const checkIdle = (): boolean => {
      if (typeof window === 'undefined') return false
      const lastActivityStr = localStorage.getItem(ADMIN_LAST_ACTIVITY_KEY)
      if (!lastActivityStr) {
        localStorage.setItem(ADMIN_LAST_ACTIVITY_KEY, Date.now().toString())
        return false
      }
      const lastActivity = Number(lastActivityStr)
      if (!isNaN(lastActivity) && Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
        handleTimeout()
        return true
      }
      return false
    }

    const scheduleTimer = () => {
      clearTimeout(timeoutId)
      if (typeof window === 'undefined') return
      const lastActivityStr = localStorage.getItem(ADMIN_LAST_ACTIVITY_KEY)
      const lastActivity = lastActivityStr ? Number(lastActivityStr) : Date.now()
      const elapsed = Date.now() - (isNaN(lastActivity) ? Date.now() : lastActivity)
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed)

      if (remaining <= 0) {
        handleTimeout()
      } else {
        timeoutId = setTimeout(() => {
          if (!checkIdle()) {
            handleTimeout()
          }
        }, remaining)
      }
    }

    const recordActivity = () => {
      const now = Date.now()
      // Throttle localStorage writes to at most once every 5 seconds to reduce storage I/O
      if (now - lastWriteTime > 5000) {
        lastWriteTime = now
        if (typeof window !== 'undefined') {
          localStorage.setItem(ADMIN_LAST_ACTIVITY_KEY, now.toString())
        }
      }
      scheduleTimer()
    }

    // Initial check
    if (checkIdle()) return

    scheduleTimer()

    // Periodic heartbeat check every 10 seconds (handles background timer throttling & wake)
    const heartbeatInterval = setInterval(() => {
      checkIdle()
    }, 10000)

    // Visibility / focus event: fires immediately when user wakes screen or switches back to tab
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        if (!checkIdle()) {
          scheduleTimer()
        }
      }
    }

    // Storage event: syncs activity across multiple admin tabs
    const onStorageChange = (e: StorageEvent) => {
      if (e.key === ADMIN_LAST_ACTIVITY_KEY) {
        scheduleTimer()
      }
    }

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    activityEvents.forEach((event) => {
      window.addEventListener(event, recordActivity, { passive: true })
    })
    document.addEventListener('visibilitychange', onVisibilityOrFocus)
    window.addEventListener('focus', onVisibilityOrFocus)
    window.addEventListener('storage', onStorageChange)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(heartbeatInterval)
      activityEvents.forEach((event) => {
        window.removeEventListener(event, recordActivity)
      })
      document.removeEventListener('visibilitychange', onVisibilityOrFocus)
      window.removeEventListener('focus', onVisibilityOrFocus)
      window.removeEventListener('storage', onStorageChange)
    }
  }, [user, router])

  // Close mobile menu on route change
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setIsMobileMenuOpen(false)
  }

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
                if (typeof window !== 'undefined') {
                  localStorage.removeItem(ADMIN_LAST_ACTIVITY_KEY)
                }
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
      <ArchiveProvider>
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
            <SidebarContent
              setIsMobileMenuOpen={setIsMobileMenuOpen}
              adminUser={adminUser}
              onOpenTwoFactor={() => setIsTwoFactorOpen(true)}
            />
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
                  <SidebarContent
                    setIsMobileMenuOpen={setIsMobileMenuOpen}
                    adminUser={adminUser}
                    onOpenTwoFactor={() => setIsTwoFactorOpen(true)}
                  />
                </motion.aside>
              </div>
            )}
          </AnimatePresence>

          {/* Main Content */}
          <main className="flex-1 p-6 md:p-12 overflow-y-auto min-h-screen">
            <div className={pathname.startsWith('/admin/inventory') || pathname.startsWith('/admin/sales') || pathname.startsWith('/admin/reports') || pathname.startsWith('/admin/users') ? 'w-full max-w-7xl mx-auto' : 'max-w-6xl mx-auto'}>
              <AdminPageGate>
                {children}
              </AdminPageGate>
            </div>
          </main>

          {/* Two-Step Verification (MFA) Modal */}
          <TwoFactorModal
            isOpen={isTwoFactorOpen}
            onClose={() => setIsTwoFactorOpen(false)}
            user={user}
          />
        </div>
      </ArchiveProvider>
    </PermissionsProvider>
  )
}
