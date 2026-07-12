'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Trash2, ArrowUpRight } from 'lucide-react'
import { fetchApi } from '@/lib/screener-api'
import { ScoreBadge } from '@/components/screener/score-badge'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/screener/toast-context'
import { TableSkeleton } from '@/components/screener/skeleton'
import { ConfirmPopover } from '@/components/screener/confirm-popover'
import { StockModal } from '@/components/screener/stock-modal'
import { SymbolSearch } from '@/components/screener/symbol-search'

export default function WatchlistPage() {
  const [symbols, setSymbols] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  
  const { showToast } = useToast()

  useEffect(() => {
    fetchApi('/watchlist')
      .then((res: any) => setSymbols(res.symbols))
      .catch(error => {
        showToast(error.message, 'error')
      })
      .finally(() => setLoading(false))
  }, [showToast])

  const addSymbol = async (symbol: string) => {
    symbol = symbol.toUpperCase()
    
    try {
      await fetchApi(`/watchlist/${symbol}`, { method: 'POST' })
      const res: any = await fetchApi('/watchlist')
      setSymbols(res.symbols)
      showToast(`Added ${symbol} to watchlist`, 'success')
    } catch (error: any) {
      showToast(error.message, 'error')
      throw error // Let SymbolSearch know it failed
    }
  }

  const removeSymbol = async (symbol: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    try {
      await fetchApi(`/watchlist/${symbol}`, { method: 'DELETE' })
      setSymbols(symbols.filter(s => s.symbol !== symbol))
      showToast(`Removed ${symbol}`, 'success')
    } catch (error: any) {
      showToast(error.message, 'error')
    }
  }

  const filtered = symbols.filter(s => {
    const q = search.toLowerCase()
    return s.symbol.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q))
  })

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <header className="mb-8">
          <div className="skeleton h-8 w-48 rounded mb-2"></div>
          <div className="skeleton h-4 w-96 rounded"></div>
        </header>
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
          <div className="skeleton h-10 w-full md:w-72 rounded-lg"></div>
          <div className="skeleton h-10 w-full md:w-96 rounded-lg"></div>
        </div>
        <div className="glass-card">
          <TableSkeleton columns={5} rows={6} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <StockModal symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} />
      
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Watchlist</h1>
        <p className="text-gray-500 text-sm tracking-wide">
          Track specific symbols regardless of whether they pass the screener.
        </p>
      </header>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search watchlist..."
            className="w-full bg-white border border-gray-200 rounded-lg py-2 pl-10 pr-4 text-gray-900 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-colors uppercase placeholder:normal-case shadow-sm"
          />
        </div>

        <div className="w-full md:w-auto">
          <SymbolSearch onAdd={addSymbol} />
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {symbols.length === 0 ? (
          <div className="text-center py-24 text-gray-500">
            <div className="w-16 h-16 border-2 border-gray-200 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
              <span className="text-2xl">?</span>
            </div>
            <p className="font-medium text-gray-700">Watchlist is empty</p>
            <p className="text-sm mt-1">Add symbols above to track their scores daily.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-widest">Symbol</th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">F-Score</th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">T-Score</th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Status</th>
                  <th className="py-4 px-6"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filtered.map((s, i) => (
                    <motion.tr 
                      key={s.symbol} 
                      initial={{ opacity: 0, transform: "translateY(10px)" }}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group cursor-pointer"
                      onClick={() => setSelectedSymbol(s.symbol)}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 group-hover:text-gold-600 transition-colors">
                            {s.symbol}
                          </span>
                          <ArrowUpRight className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {s.engine && (
                          <span className="text-[10px] text-gray-500 block uppercase tracking-wider mt-1">
                            {s.engine === 'bank' ? 'Bank' : 'Non-Bank'}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {s.f_score !== undefined && s.f_score !== null ? (
                          <ScoreBadge score={s.f_score} max={s.engine === 'bank' ? 8 : 10} />
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {s.t_score !== undefined && s.t_score !== null ? (
                          <ScoreBadge score={s.t_score} max={6} />
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {s.is_call ? (
                          <span className="text-[10px] uppercase tracking-widest bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">Call</span>
                        ) : (s.f_score !== undefined && s.f_score !== null) ? (
                          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Filtered</span>
                        ) : (
                          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Unscored</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end">
                          <ConfirmPopover 
                            message={`Remove ${s.symbol} from watchlist?`}
                            onConfirm={() => removeSymbol(s.symbol)}
                          >
                            <div className="text-gray-400 hover:text-rose-500 transition-colors p-2 opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-4 h-4" />
                            </div>
                          </ConfirmPopover>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            {filtered.length === 0 && symbols.length > 0 && (
              <div className="text-center py-12 text-gray-500">No symbols found matching "{search}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
