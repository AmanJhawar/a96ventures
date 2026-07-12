'use client'

import { useEffect, useState } from 'react'
import { fetchApi } from '@/lib/screener-api'
import { Score } from '@/lib/screener-types'
import { MetalsPanel } from '@/components/screener/metals-panel'
import { ScoreBadge } from '@/components/screener/score-badge'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/screener/toast-context'
import { TableSkeleton, CardSkeleton } from '@/components/screener/skeleton'
import { StockModal } from '@/components/screener/stock-modal'

export default function ScreenerPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'nonbank' | 'bank'>('nonbank')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    fetchApi('/screener/latest')
      .then(setData)
      .catch((error) => {
        showToast(error.message, 'error')
      })
      .finally(() => setLoading(false))
  }, [showToast])

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <header className="mb-8">
          <div className="skeleton h-8 w-48 rounded mb-2"></div>
          <div className="skeleton h-4 w-32 rounded"></div>
        </header>
        <CardSkeleton />
        <div className="glass-card overflow-hidden">
          <div className="flex border-b border-gray-200">
            <div className="flex-1 py-4 text-center"><div className="skeleton h-5 w-24 mx-auto rounded" /></div>
            <div className="flex-1 py-4 text-center"><div className="skeleton h-5 w-24 mx-auto rounded" /></div>
          </div>
          <TableSkeleton columns={4} rows={5} />
        </div>
      </div>
    )
  }
  
  if (!data) return (
    <div className="text-center py-24 glass-card max-w-lg mx-auto mt-12 border-rose-200">
      <div className="w-16 h-16 border-2 border-rose-200 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6 text-rose-500">
        <span className="text-2xl font-bold">!</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Failed to load data</h1>
      <p className="text-gray-500 mb-8 text-sm">We couldn't fetch the latest screener runs.</p>
    </div>
  )

  const calls: Score[] = tab === 'nonbank' ? data.nonbank : data.bank

  const getStatusColor = (status: string) => {
    if (status === 'ok') return 'bg-emerald-500'
    if (status === 'partial') return 'bg-gold-500'
    if (status === 'skipped') return 'bg-gray-400'
    return 'bg-rose-500'
  }

  const getStatusText = (status: string) => {
    if (status === 'ok') return 'Complete'
    if (status === 'partial') return 'Partial'
    if (status === 'skipped') return 'Skipped'
    if (!status) return 'Unknown'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <StockModal symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} />
      
      <header className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Latest Calls</h1>
          <div className="flex items-center gap-3">
            <p className="text-gray-500 text-sm tracking-wide">
              Run Date: <span className="text-gray-700 font-medium">{data.run_date || 'N/A'}</span>
            </p>
            {data.run_status && (
              <div 
                className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full cursor-help"
                title={data.run_status === 'partial' ? 'Metals section failed' : `Run status: ${data.run_status}`}
              >
                <div className={`w-2 h-2 rounded-full ${getStatusColor(data.run_status)}`} />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-widest">{getStatusText(data.run_status)}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <MetalsPanel metals={data.metals} />

      <div className="glass-card overflow-hidden">
        <div className="flex border-b border-gray-200 relative bg-gray-50/50">
          <button
            onClick={() => setTab('nonbank')}
            className={`flex-1 py-4 text-sm font-semibold uppercase tracking-widest transition-colors relative z-10 ${tab === 'nonbank' ? 'text-gold-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Non-Bank ({data.nonbank?.length || 0})
            {tab === 'nonbank' && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-[3px] bg-gold-500" />
            )}
          </button>
          <button
            onClick={() => setTab('bank')}
            className={`flex-1 py-4 text-sm font-semibold uppercase tracking-widest transition-colors relative z-10 ${tab === 'bank' ? 'text-gold-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Bank ({data.bank?.length || 0})
            {tab === 'bank' && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-[3px] bg-gold-500" />
            )}
          </button>
        </div>

        <div className="p-0">
          {!calls || calls.length === 0 ? (
            <div className="text-center py-16 text-gray-500 flex flex-col items-center">
              <div className="w-16 h-16 border-2 border-gray-200 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-400">
                <span className="text-2xl font-bold">?</span>
              </div>
              <p className="font-medium text-gray-700">No gate-passers today</p>
              <p className="text-sm mt-1">This is normal in a disciplined mean-reversion screener.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-widest">Symbol</th>
                    <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">F-Score</th>
                    <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">T-Score</th>
                    <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Price @ Call</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {calls.map((c, i) => (
                      <motion.tr
                        key={c.symbol}
                        initial={{ opacity: 0, transform: "translateY(10px)" }}
                        animate={{ opacity: 1, transform: "translateY(0px)" }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors group cursor-pointer"
                        onClick={() => setSelectedSymbol(c.symbol)}
                      >
                        <td className="py-4 px-6">
                          <span className="font-bold text-gray-900 group-hover:text-gold-600 transition-colors">
                            {c.symbol}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <ScoreBadge score={c.f_score} max={tab === 'nonbank' ? 10 : 8} />
                        </td>
                        <td className="py-4 px-6 text-right">
                          <ScoreBadge score={c.t_score} max={6} />
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-gray-700 tabular-nums">
                          ₹{c.price_at_call?.toFixed(2) || c.price?.toFixed(2)}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
