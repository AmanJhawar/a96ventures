'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { CatalogItem } from '@/lib/types'
import { EmptyState } from '@/components/empty-state'
import { ProductCard } from '@/components/product-card'
import { motion, AnimatePresence } from 'framer-motion'
import { StaggerContainer, FadeInUp, EASE_OUT } from '@/components/motion-transitions'

interface CatalogClientProps {
  initialItems: CatalogItem[]
  initialCategories: string[]
}

export function CatalogClient({ initialItems, initialCategories }: CatalogClientProps) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortBy, setSortBy] = useState('default')
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(6)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  
  const dropdownRef = useRef<HTMLDivElement>(null)

  const closeDropdown = () => {
    setIsSortOpen(false)
    setFocusedIndex(-1)
  }

  // Close sorting dropdown on click outside or escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown()
      }
    }
    
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDropdown()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleDropdownKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const options = ['default', 'name-asc', 'name-desc']
    if (!isSortOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setIsSortOpen(true)
        setFocusedIndex(options.indexOf(sortBy))
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => (prev < options.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          setSortBy(options[focusedIndex])
          closeDropdown()
        }
        break
    }
  }

  // Filter items by category
  const filteredItems = activeFilter === 'All' 
    ? initialItems 
    : initialItems.filter(item => item.category === activeFilter)

  // Sort items
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
    if (sortBy === 'name-desc') return b.name.localeCompare(a.name)
    // default: Merchandising orderIndex (lowest first)
    const orderA = a.orderIndex ?? 999999;
    const orderB = b.orderIndex ?? 999999;
    if (orderA !== orderB) return orderA - orderB;
    return 0 // fallback: Firestore order
  })

  // Paginate items
  const paginatedItems = sortedItems.slice(0, visibleCount)

  const handleCategoryChange = (category: string) => {
    setActiveFilter(category)
    setVisibleCount(6) // Reset pagination on category change
  }

  return (
    <div className="max-w-7xl mx-auto px-6">
      {/* Filters & Sorting Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 pb-2">
        {/* Category Filter Pills */}
        <StaggerContainer className="flex flex-wrap gap-3" staggerDelay={0.04} initialDelay={0.2}>
          {initialCategories.map((cat) => (
            <FadeInUp key={cat} duration={0.3} yOffset={8} className="flex">
              <button
                onClick={() => handleCategoryChange(cat)}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] border ${
                  activeFilter === cat 
                    ? 'bg-white text-black border-black shadow-[0_0_0_1px_black]' 
                    : 'bg-white text-gray-600 border-gray-200 hover:border-black/30'
                }`}
              >
                {cat}
              </button>
            </FadeInUp>
          ))}
        </StaggerContainer>

        {/* Sort Selection Menu */}
        <div className="relative self-end md:self-auto" ref={dropdownRef}>
          <button
            onClick={() => setIsSortOpen(!isSortOpen)}
            onKeyDown={handleDropdownKeyDown}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-black hover:bg-gray-50 active:scale-[0.97] transition-[color,background-color,transform] duration-150 ease-[var(--ease-out)]"
            aria-haspopup="listbox"
            aria-expanded={isSortOpen}
            aria-label="Sort products"
          >
            <span>Sort: {sortBy === 'default' ? 'Default' : sortBy === 'name-asc' ? 'Name (A-Z)' : 'Name (Z-A)'}</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {isSortOpen && (
              <motion.div 
                role="listbox"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15, ease: EASE_OUT }}
                className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 origin-top-right"
              >
                <button
                  role="option"
                  aria-selected={sortBy === 'default'}
                  onClick={() => { setSortBy('default'); closeDropdown() }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors duration-150 hover:bg-gray-100 ${sortBy === 'default' ? 'font-semibold text-black' : 'text-gray-700'} ${focusedIndex === 0 ? 'bg-gray-100 outline outline-2 outline-black -outline-offset-2' : ''}`}
                >
                  Default
                </button>
                <button
                  role="option"
                  aria-selected={sortBy === 'name-asc'}
                  onClick={() => { setSortBy('name-asc'); closeDropdown() }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors duration-150 hover:bg-gray-100 ${sortBy === 'name-asc' ? 'font-semibold text-black' : 'text-gray-700'} ${focusedIndex === 1 ? 'bg-gray-100 outline outline-2 outline-black -outline-offset-2' : ''}`}
                >
                  Name (A-Z)
                </button>
                <button
                  role="option"
                  aria-selected={sortBy === 'name-desc'}
                  onClick={() => { setSortBy('name-desc'); closeDropdown() }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors duration-150 hover:bg-gray-100 ${sortBy === 'name-desc' ? 'font-semibold text-black' : 'text-gray-700'} ${focusedIndex === 2 ? 'bg-gray-100 outline outline-2 outline-black -outline-offset-2' : ''}`}
                >
                  Name (Z-A)
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Grid of Items */}
      {paginatedItems.length === 0 ? (
        <EmptyState title="No products found in this category." />
      ) : (
        <StaggerContainer 
          key={`${activeFilter}-${sortBy}`} 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {paginatedItems.map((item, index) => (
            <ProductCard key={item.id} item={item} index={index} showVariants={true} />
          ))}
        </StaggerContainer>
      )}

      {/* Pagination Load More */}
      {sortedItems.length > visibleCount && (
        <div className="flex justify-center mt-16">
          <button
            onClick={() => setVisibleCount(prev => prev + 6)}
            className="btn-primary"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
