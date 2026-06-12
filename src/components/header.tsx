'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import { useCart } from './cart-provider'

function NavLink({ href, children, isActive, onClick }: { href: string; children: React.ReactNode; isActive: boolean; onClick: () => void }) {
  return (
    <Link
      href={href}
      className={`relative text-sm font-medium tracking-wide text-black no-underline transition-colors duration-200 ease-[var(--ease-out)] hover:text-gray-500 active:opacity-60
        after:absolute after:bottom-[-4px] after:left-0 after:h-[1px] after:bg-black after:transition-[width] after:duration-200 after:ease-[var(--ease-out)]
        ${isActive ? 'after:w-full' : 'after:w-0 hover:after:w-full'}`}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = usePathname()
  const { cartItems, setIsCartOpen, isInitialized } = useCart()

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen)
  const closeMenu = () => setIsMenuOpen(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-center items-center h-20 relative">
          
          {/* Desktop Navigation - Left */}
          <nav className="hidden md:flex absolute left-0 gap-10 items-center">
            <NavLink href="/portfolio" isActive={pathname === '/portfolio'} onClick={closeMenu}>PORTFOLIO</NavLink>
            <NavLink href="/brands" isActive={pathname === '/brands'} onClick={closeMenu}>BRANDS</NavLink>
            <NavLink href="/catalog" isActive={pathname.startsWith('/catalog')} onClick={closeMenu}>CATALOG</NavLink>
            <NavLink href="/team" isActive={pathname === '/team'} onClick={closeMenu}>TEAM</NavLink>
          </nav>
 
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
            <Link href="/">
              <Image src="/assets/logo.png" alt="A96 Ventures" width={120} height={40} className="h-10 w-auto object-contain mt-2" priority style={{ width: 'auto' }} />
            </Link>
          </div>
 
          {/* Desktop Navigation - Right */}
          <nav className="hidden md:flex absolute right-0 gap-10 items-center">
            <NavLink href="/about" isActive={pathname === '/about'} onClick={closeMenu}>ABOUT</NavLink>
            <NavLink href="/contact" isActive={pathname === '/contact'} onClick={closeMenu}>CONTACT</NavLink>
            {pathname.startsWith('/catalog') && (
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 ml-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
                aria-label="Open enquiry"
              >
                <ShoppingBag size={20} strokeWidth={1.5} />
                {isInitialized && totalItems > 0 && (
                  <span className="absolute top-1 right-1 bg-black text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full transform translate-x-1 -translate-y-1">
                    {totalItems}
                  </span>
                )}
              </button>
            )}
          </nav>
 
          {/* Mobile Menu & Cart Container */}
          <div className="md:hidden absolute right-0 flex items-center gap-4">
            {pathname.startsWith('/catalog') && (
              <button 
                className="p-2 relative flex items-center justify-center transition-transform active:scale-95"
                onClick={() => setIsCartOpen(true)}
                aria-label="Open enquiry"
              >
                <ShoppingBag size={20} strokeWidth={1.5} />
                {isInitialized && totalItems > 0 && (
                  <span className="absolute top-1 right-1 bg-black text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                    {totalItems}
                  </span>
                )}
              </button>
            )}
            <button 
              className="p-2 bg-transparent border-none cursor-pointer flex items-center justify-center"
              onClick={toggleMenu}
              aria-label="Toggle menu"
            >
              <div className="flex flex-col w-6 h-[18px] relative justify-between">
                <span className={`block h-[2px] w-full bg-black transition-transform duration-200 ease-[var(--ease-out)] ${isMenuOpen ? 'rotate-45 translate-y-[8px]' : ''}`}></span>
                <span className={`block h-[2px] w-full bg-black transition-opacity duration-200 ease-[var(--ease-out)] ${isMenuOpen ? 'opacity-0' : ''}`}></span>
                <span className={`block h-[2px] w-full bg-black transition-transform duration-200 ease-[var(--ease-out)] ${isMenuOpen ? '-rotate-45 -translate-y-[8px]' : ''}`}></span>
              </div>
            </button>
          </div>
        </div>
 
        {/* Mobile Navigation */}
        <nav className={`md:hidden flex flex-col gap-6 absolute top-full left-0 right-0 bg-white border-b border-gray-200 px-6 py-6 transition-[opacity,visibility] duration-300 ease-[var(--ease-out)] ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
          <NavLink href="/portfolio" isActive={pathname === '/portfolio'} onClick={closeMenu}>PORTFOLIO</NavLink>
          <NavLink href="/brands" isActive={pathname === '/brands'} onClick={closeMenu}>BRANDS</NavLink>
          <NavLink href="/catalog" isActive={pathname.startsWith('/catalog')} onClick={closeMenu}>CATALOG</NavLink>
          <NavLink href="/team" isActive={pathname === '/team'} onClick={closeMenu}>TEAM</NavLink>
          <NavLink href="/about" isActive={pathname === '/about'} onClick={closeMenu}>ABOUT</NavLink>
          <NavLink href="/contact" isActive={pathname === '/contact'} onClick={closeMenu}>CONTACT</NavLink>
        </nav>
      </div>
    </header>
  )
}
