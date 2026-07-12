'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Loader2 } from 'lucide-react'
import { fetchApi } from '@/lib/screener-api'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/screener/toast-context'

interface SymbolSearchProps {
  onAdd: (symbol: string) => Promise<void>
}

export function SymbolSearch({ onAdd }: SymbolSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{symbol: string, name?: string}[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  
  const { showToast } = useToast()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!query || query.trim().length < 2) return

    setIsSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetchApi<{ results: {symbol: string, name?: string}[] }>(`/symbols/search?q=${encodeURIComponent(query)}`)
        setResults(res.results || [])
        setIsOpen(true)
      } catch {
        // Silently fail search errors, don't spam toasts
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [query])

  const handleSelect = async (symbol: string) => {
    setIsOpen(false)
    setIsAdding(true)
    try {
      await onAdd(symbol)
      setQuery('')
      setResults([])
    } finally {
      setIsAdding(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    handleSelect(query.trim().toUpperCase())
  }

  return (
    <div ref={containerRef} className="relative w-full md:w-80 z-20">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <input 
          type="text" 
          value={query}
          onChange={e => {
            const val = e.target.value
            setQuery(val)
            if (!val || val.trim().length < 2) {
              setResults([])
              setIsSearching(false)
            } else {
              setIsOpen(true)
            }
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true)
          }}
          placeholder="SEARCH TICKER OR NAME"
          className="admin-input !pr-10 !bg-white/90 backdrop-blur-sm uppercase placeholder:normal-case shadow-sm"
          disabled={isAdding}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
          {isAdding || isSearching ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : (
            <button 
              type="submit"
              disabled={!query.trim()}
              className="text-gray-400 hover:text-black disabled:opacity-50 disabled:hover:text-gray-400 transition-colors btn-press"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
      </form>

      <AnimatePresence>
        {isOpen && query.trim().length >= 2 && (
          <motion.div 
            initial={{ opacity: 0, transform: "scale(0.95) translateY(10px)" }}
            animate={{ opacity: 1, transform: "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: "scale(0.95) translateY(10px)" }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white/80 backdrop-blur-2xl border border-gray-200 shadow-xl rounded-xl overflow-hidden"
          >
            {results.length > 0 ? (
              <ul className="py-2 max-h-[300px] overflow-y-auto">
                {results.map((res, i) => (
                  <motion.li 
                    initial={{ opacity: 0, transform: "translateY(5px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    transition={{ delay: i * 0.03 }}
                    key={res.symbol}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(res.symbol)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100/80 transition-colors flex flex-col items-start active:bg-gray-200"
                    >
                      <span className="font-bold text-gray-900">{res.symbol}</span>
                      <span className="text-xs text-gray-500 line-clamp-1">{res.name}</span>
                    </button>
                  </motion.li>
                ))}
              </ul>
            ) : (
              !isSearching && (
                <div className="p-4 text-sm text-gray-500 text-center">
                  No matches for &quot;{query}&quot;
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
