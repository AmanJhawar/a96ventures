'use client'

import { useState, useEffect, useRef } from 'react'
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

  const menuRef = useRef<HTMLElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isMenuOpen) {
      // Lock scroll
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'

      // Save previous active element
      previousActiveElementRef.current = document.activeElement as HTMLElement

      // Keydown listener for Escape and Tab
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeMenu()
        }

        if (e.key === 'Tab' && menuRef.current) {
          // Find all focusable elements inside the header when menu is open
          const focusableElements = document.querySelector('header')?.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]'
          ) as NodeListOf<HTMLElement>

          if (!focusableElements || focusableElements.length === 0) return

          const first = focusableElements[0]
          const last = focusableElements[focusableElements.length - 1]

          if (e.shiftKey) {
            if (document.activeElement === first) {
              last.focus()
              e.preventDefault()
            }
          } else {
            if (document.activeElement === last) {
              first.focus()
              e.preventDefault()
            }
          }
        }
      }

      document.addEventListener('keydown', handleKeyDown)

      return () => {
        document.body.style.overflow = originalStyle
        document.removeEventListener('keydown', handleKeyDown)
        // Restore focus
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus()
        }
      }
    }
  }, [isMenuOpen])

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
 
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center h-full">
            <Link href="/">
              <Image src="/assets/logo.png" alt="A96 Ventures" width={120} height={40} className="w-auto h-10 object-contain" priority />
            </Link>
          </div>
 
          {/* Desktop Navigation - Right */}
          <nav className="hidden md:flex absolute right-0 gap-10 items-center">
            <NavLink href="/about" isActive={pathname === '/about'} onClick={closeMenu}>ABOUT</NavLink>
            <NavLink href="/contact" isActive={pathname === '/contact'} onClick={closeMenu}>CONTACT</NavLink>
            <div className="w-10 h-10 ml-2 flex items-center justify-center">
              {(pathname.startsWith('/catalog') || (isInitialized && totalItems > 0)) && (
                <button 
                  onClick={() => setIsCartOpen(true)}
                  className="relative p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
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
            </div>
          </nav>
 
          {/* Mobile Menu & Cart Container */}
          <div className="md:hidden absolute right-0 flex items-center gap-2 h-full">
            <div className="w-10 h-10 flex items-center justify-center">
              {(pathname.startsWith('/catalog') || (isInitialized && totalItems > 0)) && (
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
            </div>
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
 
        {/* Mobile Overlay */}
        {isMenuOpen && (
          <div 
            className="md:hidden fixed inset-0 top-[80px] bg-black/40 backdrop-blur-sm z-40 transition-opacity animate-[fadeIn_200ms_var(--ease-out)]"
            onClick={closeMenu}
            aria-hidden="true"
          />
        )}

        {/* Mobile Navigation */}
        <nav 
          ref={menuRef}
          className={`md:hidden flex flex-col gap-6 absolute top-full left-0 right-0 bg-white border-b border-gray-200 px-6 py-6 z-50 max-h-[calc(100vh-5rem)] overflow-y-auto motion-safe:transition-[opacity,visibility] motion-reduce:transition-none duration-300 ease-[var(--ease-out)] ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        >
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
