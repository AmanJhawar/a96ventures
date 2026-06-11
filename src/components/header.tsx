'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

function NavLink({ href, children, isActive, onClick }: { href: string; children: React.ReactNode; isActive: boolean; onClick: () => void }) {
  return (
    <Link
      href={href}
      className={`relative text-sm font-medium tracking-wide text-black no-underline transition-all duration-200 ease-[var(--ease)] @media(hover:hover):hover:text-gray-500 active:blur-[0.5px]
        after:absolute after:bottom-[-4px] after:left-0 after:h-[1px] after:bg-black after:transition-[width] after:duration-200 after:ease-[var(--ease-out)]
        ${isActive ? 'after:w-full' : 'after:w-0 @media(hover:hover):hover:after:w-full'}`}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = usePathname()

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
            <NavLink href="/team" isActive={pathname === '/team'} onClick={closeMenu}>TEAM</NavLink>
          </nav>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
            <Link href="/">
              <Image src="/assets/logo.png" alt="A96 Ventures" width={120} height={40} className="h-10 w-auto object-contain mt-2" priority />
            </Link>
          </div>

          {/* Desktop Navigation - Right */}
          <nav className="hidden md:flex absolute right-0 gap-10 items-center">
            <NavLink href="/insights" isActive={pathname === '/insights'} onClick={closeMenu}>INSIGHTS</NavLink>
            <NavLink href="/about" isActive={pathname === '/about'} onClick={closeMenu}>ABOUT</NavLink>
            <NavLink href="/contact" isActive={pathname === '/contact'} onClick={closeMenu}>CONTACT</NavLink>
          </nav>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden absolute right-0 p-2 bg-transparent border-none cursor-pointer"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            <div className="flex flex-col w-6 h-[18px] relative justify-between">
              <span className={`block h-[2px] w-full bg-black transition-all duration-200 ease-[var(--ease-out)] ${isMenuOpen ? 'rotate-45 translate-y-[8px]' : ''}`}></span>
              <span className={`block h-[2px] w-full bg-black transition-opacity duration-200 ease-[var(--ease)] ${isMenuOpen ? 'opacity-0' : ''}`}></span>
              <span className={`block h-[2px] w-full bg-black transition-all duration-200 ease-[var(--ease-out)] ${isMenuOpen ? '-rotate-45 -translate-y-[8px]' : ''}`}></span>
            </div>
          </button>
        </div>

        {/* Mobile Navigation */}
        <nav className={`md:hidden flex flex-col gap-6 absolute top-full left-0 right-0 bg-white border-b border-gray-200 px-6 py-6 transition-all duration-300 ease-[var(--ease-out)] ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
          <NavLink href="/portfolio" isActive={pathname === '/portfolio'} onClick={closeMenu}>PORTFOLIO</NavLink>
          <NavLink href="/brands" isActive={pathname === '/brands'} onClick={closeMenu}>BRANDS</NavLink>
          <NavLink href="/team" isActive={pathname === '/team'} onClick={closeMenu}>TEAM</NavLink>
          <NavLink href="/insights" isActive={pathname === '/insights'} onClick={closeMenu}>INSIGHTS</NavLink>
          <NavLink href="/about" isActive={pathname === '/about'} onClick={closeMenu}>ABOUT</NavLink>
          <NavLink href="/contact" isActive={pathname === '/contact'} onClick={closeMenu}>CONTACT</NavLink>
        </nav>
      </div>
    </header>
  )
}
