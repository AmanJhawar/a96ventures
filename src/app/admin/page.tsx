"use client"

import { Package, Users, Briefcase, Bookmark, MessageSquare } from 'lucide-react'
import Link from 'next/link'

export default function AdminDashboard() {
  const cards = [
    { name: 'Catalog', href: '/admin/catalog', icon: Package, description: 'Manage your catalog products and variants.' },
    { name: 'Inquiries', href: '/admin/inquiries', icon: MessageSquare, description: 'View and respond to customer inquiries.' },
    { name: 'Team', href: '/admin/team', icon: Users, description: 'Manage team members and their roles.' },
    { name: 'Brands', href: '/admin/brands', icon: Bookmark, description: 'Manage the brands in your ecosystem.' },
    { name: 'Portfolio', href: '/admin/portfolio', icon: Briefcase, description: 'Update your investment portfolio.' },
  ]

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-black mb-2 tracking-tight">Dashboard Overview</h1>
        <p className="text-gray-500 text-lg">Welcome to the A96 Ventures command center.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link 
              key={card.name} 
              href={card.href}
              className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-[transform,box-shadow] duration-200 hover:-translate-y-1 group"
            >
              <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors duration-200">
                <Icon size={24} className="text-gray-700 group-hover:text-white transition-colors duration-200" strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-semibold text-black mb-2">{card.name}</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                {card.description}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
