'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

function NavLink({ href, children, isActive, isSolid, onClick }: { href: string; children: React.ReactNode; isActive: boolean; isSolid: boolean; onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <Link
      href={href}
      className="relative text-sm font-medium tracking-wide no-underline transition-[color,transform] duration-200 ease-[var(--ease-out)] active:scale-[0.97] inline-block"
      style={{
        color: !isSolid 
          ? (isActive || isHovered ? '#ffffff' : 'rgba(255,255,255,0.7)') 
          : (isActive || isHovered ? '#000000' : '#6b7280')
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {children}
      <span 
        className="absolute bottom-[-4px] left-0 h-[1px] w-full origin-left transition-transform duration-200 ease-[var(--ease-out)]"
        style={{ 
          backgroundColor: !isSolid ? '#ffffff' : '#000000',
          transform: isActive || isHovered ? 'scaleX(1)' : 'scaleX(0)'
        }} 
      />
    </Link>
  )
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const pathname = usePathname()
  const isHome = pathname === '/'
  const isSolid = !isHome || isScrolled

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen)
  const closeMenu = () => setIsMenuOpen(false)

  const menuRef = useRef<HTMLElement>(null)
  const mobileControlsRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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
          setIsMenuOpen(false)
        }

        if (e.key === 'Tab' && menuRef.current) {
          // Find focusable elements in the mobile controls (hamburger, cart) and the menu
          const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]'
          const menuFocusables = Array.from(menuRef.current.querySelectorAll(selector))
          const controlsFocusables = mobileControlsRef.current ? Array.from(mobileControlsRef.current.querySelectorAll(selector)) : []
          
          const focusableElements = [...controlsFocusables, ...menuFocusables] as HTMLElement[]

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
    <header className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,backdrop-filter,color] duration-200 ease-[var(--ease-out)] ${
      isSolid
        ? 'bg-white/95 backdrop-blur-md'
        : 'bg-transparent border-transparent'
    }`}>
      <div 
        className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ease-[var(--ease-out)] bg-gradient-to-b from-black/60 to-transparent ${
          isSolid ? 'opacity-0' : 'opacity-100'
        }`} 
        aria-hidden="true" 
      />
      <div className="max-w-8xl mx-auto px-6 relative">
        <div className="flex justify-center items-center h-20 relative">
          
          {/* Desktop Navigation - Left */}
          <nav className="hidden md:flex absolute left-0 gap-10 items-center">
            <NavLink href="/portfolio" isActive={pathname === '/portfolio'} isSolid={isSolid} onClick={closeMenu}>PORTFOLIO</NavLink>
            <NavLink href="/brands" isActive={pathname === '/brands'} isSolid={isSolid} onClick={closeMenu}>BRANDS</NavLink>
            <NavLink href="/team" isActive={pathname === '/team'} isSolid={isSolid} onClick={closeMenu}>TEAM</NavLink>
          </nav>
 
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center h-full">
            <Link href="/">
              <Image 
                src="/assets/logo.png" 
                alt="A96 Ventures" 
                width={120} 
                height={40} 
                className="w-auto h-6 object-contain transition-[filter] duration-200 ease-[var(--ease-out)]"
                style={{ filter: !isSolid ? 'brightness(0) invert(1)' : 'none' }}
                priority 
              />
            </Link>
          </div>
 
          {/* Desktop Navigation - Right */}
          <nav className="hidden md:flex absolute right-0 gap-10 items-center">
            <NavLink href="/about" isActive={pathname === '/about'} isSolid={isSolid} onClick={closeMenu}>ABOUT</NavLink>
            <NavLink href="/contact" isActive={pathname === '/contact'} isSolid={isSolid} onClick={closeMenu}>CONTACT</NavLink>
          </nav>
 
          {/* Mobile Menu Container */}
          <div ref={mobileControlsRef} className="md:hidden absolute right-0 flex items-center gap-2 h-full">
            <button 
              className="p-2 bg-transparent border-none cursor-pointer flex items-center justify-center"
              onClick={toggleMenu}
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-nav"
            >
              <div className="flex flex-col w-6 h-[18px] relative justify-between">
                <span className={`block h-[2px] w-full transition-[transform,background-color] duration-200 ease-[var(--ease-out)] ${!isSolid ? 'bg-white' : 'bg-black'} ${isMenuOpen ? 'rotate-45 translate-y-[8px]' : ''}`}></span>
                <span className={`block h-[2px] w-full transition-[opacity,background-color] duration-200 ease-[var(--ease-out)] ${!isSolid ? 'bg-white' : 'bg-black'} ${isMenuOpen ? 'opacity-0' : ''}`}></span>
                <span className={`block h-[2px] w-full transition-[transform,background-color] duration-200 ease-[var(--ease-out)] ${!isSolid ? 'bg-white' : 'bg-black'} ${isMenuOpen ? '-rotate-45 -translate-y-[8px]' : ''}`}></span>
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
          id="mobile-nav"
          ref={menuRef}
          className={`md:hidden flex flex-col gap-6 absolute top-full left-0 right-0 bg-white border-b border-gray-200 px-6 py-6 z-50 max-h-[calc(100vh-5rem)] overflow-y-auto motion-safe:transition-[opacity,visibility] motion-reduce:transition-none duration-200 ease-[var(--ease-out)] ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        >
          <NavLink href="/portfolio" isActive={pathname === '/portfolio'} isSolid={true} onClick={closeMenu}>PORTFOLIO</NavLink>
          <NavLink href="/brands" isActive={pathname === '/brands'} isSolid={true} onClick={closeMenu}>BRANDS</NavLink>
          <NavLink href="/team" isActive={pathname === '/team'} isSolid={true} onClick={closeMenu}>TEAM</NavLink>
          <NavLink href="/about" isActive={pathname === '/about'} isSolid={true} onClick={closeMenu}>ABOUT</NavLink>
          <NavLink href="/contact" isActive={pathname === '/contact'} isSolid={true} onClick={closeMenu}>CONTACT</NavLink>
        </nav>
      </div>
    </header>
  )
}

