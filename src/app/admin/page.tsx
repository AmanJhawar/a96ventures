"use client"

import { Warehouse, ShoppingCart, MapPin, BarChart3, Users, Briefcase, Bookmark, MessageSquare, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { StaggerContainer, FadeInUp } from '@/components/motion-transitions'
import { usePermissions } from '@/lib/context/PermissionsContext'

export default function AdminDashboard() {
  const { hasPermission, isSuperAdmin } = usePermissions()

  const cardGroups = [
    {
      title: 'Operations',
      cards: [
        { name: 'Reports', href: '/admin/reports', icon: BarChart3, description: 'Sales performance and stock valuation.' },
        { name: 'Inquiries', href: '/admin/inquiries', icon: MessageSquare, description: 'Customer messages and leads.' },
        { name: 'Users', href: '/admin/users', icon: ShieldCheck, description: 'Staff accounts and permissions.' },
      ]
    },
    {
      title: 'Store',
      cards: [
        { name: 'Inventory', href: '/admin/inventory', icon: Warehouse, description: 'Catalog, stock levels, and movements.' },
        { name: 'Sales', href: '/admin/sales', icon: ShoppingCart, description: 'Customer sales and return orders.' },
        { name: 'Locations', href: '/admin/locations', icon: MapPin, description: 'Showrooms, vaults, and storage points.' },
      ]
    },
    {
      title: 'Website',
      cards: [
        { name: 'Brands', href: '/admin/brands', icon: Bookmark, description: 'Brand partners and logos.' },
        { name: 'Team', href: '/admin/team', icon: Users, description: 'Public site team roster.' },
        { name: 'Portfolio', href: '/admin/portfolio', icon: Briefcase, description: 'Ventures and case studies.' },
      ]
    }
  ]

  const isCardAccessible = (card: { href: string }) => {
    if (isSuperAdmin) return true
    if (card.href === '/admin/users') return false
    if (card.href === '/admin/inventory') {
      return (
        hasPermission('products', 'view') ||
        hasPermission('purchases', 'view') ||
        hasPermission('movements', 'view')
      )
    }
    if (card.href === '/admin/sales') return hasPermission('sales', 'view') || hasPermission('returns', 'view')
    if (card.href === '/admin/locations') return hasPermission('locations', 'view')
    if (card.href === '/admin/reports') return hasPermission('reports', 'view')
    if (card.href === '/admin/inquiries') return hasPermission('inquiries', 'view')
    if (card.href === '/admin/team') return hasPermission('team', 'view')
    if (card.href === '/admin/brands') return hasPermission('brands', 'view')
    if (card.href === '/admin/portfolio') return hasPermission('portfolio', 'view')
    return true
  }

  const accessibleGroups = cardGroups
    .map((g) => ({
      ...g,
      cards: g.cards.filter(isCardAccessible)
    }))
    .filter((g) => g.cards.length > 0)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Dashboard</h1>
        <p className="text-gray-500 text-sm">A96 Ventures command center</p>
      </div>

      <div className="space-y-10">
        {accessibleGroups.map((group) => (
          <div key={group.title} className="space-y-4">
            <div className="border-b border-gray-200 pb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">
                {group.title}
              </h2>
            </div>
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" staggerDelay={0.05}>
              {group.cards.map((card) => {
                const Icon = card.icon
                return (
                  <FadeInUp key={card.name} yOffset={8}>
                    <Link 
                      href={card.href}
                      className="block bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 group active:scale-[0.98]"
                    >
                      <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-[background-color,color] duration-[160ms] ease-[var(--ease-out)]">
                        <Icon size={24} className="text-gray-500 group-hover:text-white transition-[color] duration-[160ms] ease-[var(--ease-out)]" strokeWidth={1.5} />
                      </div>
                      <h3 className="text-lg font-semibold text-black mb-1.5">{card.name}</h3>
                      <p className="text-gray-500 text-xs leading-relaxed">
                        {card.description}
                      </p>
                    </Link>
                  </FadeInUp>
                )
              })}
            </StaggerContainer>
          </div>
        ))}
      </div>
    </div>
  )
}
