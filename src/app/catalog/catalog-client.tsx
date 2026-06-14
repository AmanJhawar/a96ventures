'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { CatalogItem } from '@/lib/types'
import { ProtectedImage } from '@/components/protected-image'
import { EmptyState } from '@/components/empty-state'

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
        <div className="flex flex-wrap gap-3">
          {initialCategories.map((cat, index) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] opacity-0 animate-fade-in-up-short ${
                activeFilter === cat 
                  ? 'bg-white text-black outline outline-2 outline-offset-[-2px] outline-black shadow-[0_0_0_1px_black]' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={{ animationDelay: `${300 + (index * 40)}ms` }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sort Selection Menu */}
        <div className="relative self-end md:self-auto" ref={dropdownRef}>
          <button
            onClick={() => setIsSortOpen(!isSortOpen)}
            onKeyDown={handleDropdownKeyDown}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-black bg-white hover:border-black/30 active:scale-[0.97] transition-[border-color,transform] duration-150 ease-[var(--ease-out)]"
            aria-haspopup="listbox"
            aria-expanded={isSortOpen}
            aria-label="Sort products"
          >
            <span>Sort: {sortBy === 'default' ? 'Default' : sortBy === 'name-asc' ? 'Name (A-Z)' : 'Name (Z-A)'}</span>
            <ChevronDown size={16} className={`transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`} />
          </button>

          {isSortOpen && (
            <div 
              role="listbox"
              className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 origin-top-right animate-dropdown-enter"
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
            </div>
          )}
        </div>
      </div>

      {/* Grid of Items */}
      {paginatedItems.length === 0 ? (
        <EmptyState title="No products found in this category." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedItems.map((item, index) => (
            <Link 
              href={`/catalog/${item.id}`}
              key={item.id} 
              className="flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white group opacity-0 animate-fade-in-up-short transition-[border-color,box-shadow] duration-200 ease-[var(--ease-out)] hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="aspect-[2/3] bg-white relative overflow-hidden">
                <div className="w-full h-full relative flex items-center justify-center text-gray-400 text-sm">
                  {item.imageFile ? (
                    <ProtectedImage 
                      src={item.imageFile.startsWith('data:') ? item.imageFile : `/assets/${item.imageFile}`} 
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.04]"
                      containerClassName="w-full h-full"
                    />
                  ) : (
                    <span>Image Coming Soon</span>
                  )}
                </div>
              </div>
              <div className="p-8 flex flex-col flex-1">
                <div className="flex flex-col items-start mb-4">
                  <h3 className="text-xl font-semibold text-black">{item.name}</h3>
                  <span className="text-xs font-semibold tracking-widest uppercase text-gray-400 mt-1">{item.category}</span>
                </div>
                {((item.standardSizes?.length || 0) > 0 || (item.customSizes?.length || 0) > 0 || (item.standardPurities?.length || 0) > 0 || (item.customPurities?.length || 0) > 0) && (
                  <div className="mt-auto pt-4">
                    {(() => {
                      const sizes = (item.standardSizes?.length || 0) + (item.customSizes?.length || 0);
                      const purities = (item.standardPurities?.length || 0) + (item.customPurities?.length || 0);
                      const sizeLabel = item.category?.includes('Marble') ? 'stones' : item.category?.includes('Bullion') ? 'weights' : 'sizes';
                      
                      const parts = [];
                      if (sizes > 0) parts.push(`${sizes} ${sizeLabel}`);
                      if (purities > 0) parts.push(`${purities} purities`);
                      
                      return (
                        <span className="text-sm text-gray-500">
                          {parts.join(' · ')}
                        </span>
                      )
                    })()}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
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
