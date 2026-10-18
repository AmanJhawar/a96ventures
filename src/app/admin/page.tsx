"use client"

import { Warehouse, ShoppingCart, MapPin, BarChart3, Users, Briefcase, Bookmark, MessageSquare, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { StaggerContainer, FadeInUp } from '@/components/motion-transitions'

export default function AdminDashboard() {
  const cards = [
    { name: 'Inventory', href: '/admin/inventory', icon: Warehouse, description: 'Manage products catalog, purchases, transfers, repairs, and melts.' },
    { name: 'Sales', href: '/admin/sales', icon: ShoppingCart, description: 'Record customer sales and manage returns across locations.' },
    { name: 'Locations', href: '/admin/locations', icon: MapPin, description: 'Manage showrooms, vaults, warehouses, and workshops.' },
    { name: 'Reports', href: '/admin/reports', icon: BarChart3, description: 'Track sales leaderboards, highest-selling items, and stock valuation.' },
    { name: 'Inquiries', href: '/admin/inquiries', icon: MessageSquare, description: 'View and respond to customer inquiries.' },
    { name: 'Users & Access', href: '/admin/users', icon: ShieldCheck, description: 'Manage staff operators, granular subsection permissions, and audit logs.' },
    { name: 'Team', href: '/admin/team', icon: Users, description: 'Manage team members and their roles.' },
    { name: 'Brands', href: '/admin/brands', icon: Bookmark, description: 'Manage the brands in your ecosystem.' },
    { name: 'Portfolio', href: '/admin/portfolio', icon: Briefcase, description: 'Update your investment portfolio.' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Dashboard Overview</h1>
        <p className="text-gray-500 text-sm">Welcome to the A96 Ventures command center.</p>
      </div>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" staggerDelay={0.05}>
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <FadeInUp key={card.name} yOffset={8}>
              <Link 
                href={card.href}
                className="block bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 group"
              >
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-[background-color,color] duration-[160ms] ease-[var(--ease-out)]">
                  <Icon size={24} className="text-gray-500 group-hover:text-white transition-[color] duration-[160ms] ease-[var(--ease-out)]" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-semibold text-black mb-2">{card.name}</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {card.description}
                </p>
              </Link>
            </FadeInUp>
          )
        })}
      </StaggerContainer>
    </div>
  )
}
