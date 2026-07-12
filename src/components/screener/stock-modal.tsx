'use client'

import { useEffect, useState } from 'react'
import { fetchApi } from '@/lib/screener-api'
import { ScoreBadge } from '@/components/screener/score-badge'
import { X, TrendingUp, AlertTriangle, Info, Calendar } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/screener/toast-context'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

function calculateSMA(data: any[], windowSize: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= windowSize) {
      sum -= data[i - windowSize].close;
    }
    if (i >= windowSize - 1) {
      result.push(sum / windowSize);
    } else {
      result.push(null);
    }
  }
  return result;
}

export function StockModal({ symbol, onClose }: { symbol: string | null, onClose: () => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    if (!symbol) {
      setData(null)
      return
    }

    setLoading(true)
    fetchApi(`/stock/${symbol}`)
      .then(setData)
      .catch((error) => {
        showToast(error.message, 'error')
        onClose()
      })
      .finally(() => setLoading(false))
  }, [symbol, showToast, onClose])

  // Prevent scrolling on body when modal is open
  useEffect(() => {
    if (symbol) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [symbol])

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const prices = data?.prices || []
  const sma50Values = calculateSMA(prices, 50)
  const sma200Values = calculateSMA(prices, 200)

  const chartData = prices.map((p: any, idx: number) => ({
    date: p.date,
    price: p.close,
    sma50: sma50Values[idx],
    sma200: sma200Values[idx],
  }))

  const InfoBlock = ({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) => (
    <div className={`p-4 rounded-lg border ${highlight ? 'bg-gray-100 border-black' : 'bg-gray-50 border-gray-200'}`}>
      <span className="text-gray-500 text-sm block mb-1 font-medium">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${highlight ? 'text-black' : 'text-gray-900'}`}>{value}</span>
    </div>
  )

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="skeleton h-10 w-48 rounded"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({length: 4}).map((_, i) => <div key={i} className="skeleton h-24 rounded-lg"></div>)}
          </div>
          <div className="skeleton h-64 rounded-xl"></div>
        </div>
      )
    }

    if (!data) return null

    const s = data.score
    
    return (
      <div className="space-y-8">
        <header className="flex items-center gap-4 border-b border-gray-200 pb-6">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">{data.symbol}</h1>
          <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-widest bg-gray-100 text-gray-600 rounded">
            {data.score?.engine === 'bank' ? 'Bank' : 'Non-Bank'}
          </span>
        </header>

        {s && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Latest Signal
              </h3>
              <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-gray-500 text-sm font-medium">F-Score</span>
                    <div className="mt-1"><ScoreBadge score={s.f_score} max={data.score?.engine === 'bank' ? 8 : 10} className="text-lg px-3 py-1.5" /></div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-sm font-medium">T-Score</span>
                    <div className="mt-1"><ScoreBadge score={s.t_score} max={6} className="text-lg px-3 py-1.5" /></div>
                  </div>
                </div>
                
                {s.is_call ? (
                  <div className="bg-gray-100 border border-black rounded-lg p-4 flex items-center justify-between">
                    <span className="font-bold text-black uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" /> Active Call
                    </span>
                    <span className="text-black font-bold">₹{s.price_at_call?.toFixed(2) || s.price?.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="bg-gray-200/50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                    <span className="font-bold text-gray-500 uppercase tracking-widest">Filtered</span>
                    <span className="text-gray-700 font-bold tabular-nums">₹{s.price?.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Info className="w-4 h-4" /> Fundamentals
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <InfoBlock label="Market Cap" value={`₹${(data.score?.market_cap || 0).toLocaleString()}`} />
                <InfoBlock label="P/B Ratio" value={(data.score?.pb_ratio || 0).toFixed(2)} />
                {data.score?.engine === 'nonbank' && (
                  <>
                    <InfoBlock label="EV/EBIT" value={(data.score?.ev_ebit || 0).toFixed(2)} />
                    <InfoBlock label="Hist. Median" value={(data.score?.historical_median || 0).toFixed(2)} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {chartData.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Price History (200 Days)
            </h3>
            <div className="h-72 w-full bg-gray-50 border border-gray-200 rounded-xl p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" stroke="#a8a29e" fontSize={12} tickFormatter={(val: any) => val.substring(5)} minTickGap={30} />
                  <YAxis stroke="#a8a29e" fontSize={12} domain={['auto', 'auto']} tickFormatter={(val: any) => `₹${val}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderColor: '#e7e5e4', borderRadius: '8px', color: '#1c1917' }}
                    itemStyle={{ color: '#1c1917' }}
                    labelStyle={{ color: '#78716c', marginBottom: '4px' }}
                  />
                  {s?.price_at_call && (
                    <ReferenceLine y={s.price_at_call} stroke="#000000" strokeDasharray="3 3" />
                  )}
                  <Line type="monotone" dataKey="price" stroke="#000000" strokeWidth={2} dot={false} name="Close" />
                  <Line type="monotone" dataKey="sma50" stroke="#737373" strokeWidth={1} dot={false} name="50 SMA" />
                  <Line type="monotone" dataKey="sma200" stroke="#a3a3a3" strokeWidth={1} dot={false} name="200 SMA" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {data.call_history?.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Recent Signals
            </h3>
            <div className="overflow-x-auto bg-gray-50 rounded-xl border border-gray-200">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100/50">
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Date</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">F-Score</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">T-Score</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.call_history.map((ch: any) => (
                    <tr key={ch.run_date} className="border-b border-gray-200 last:border-0 hover:bg-gray-100 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">{ch.run_date}</td>
                      <td className="py-3 px-4 text-right"><ScoreBadge score={ch.f_score} max={data.score?.engine === 'bank' ? 8 : 10} /></td>
                      <td className="py-3 px-4 text-right"><ScoreBadge score={ch.t_score} max={6} /></td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium text-gray-900">₹{ch.price_at_call?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  // The CheckCircle wasn't imported from lucide-react in the old version, but it is used. Let's make sure it's there.
  return (
    <AnimatePresence>
      {symbol && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-50 cursor-pointer"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2, ease: "easeIn" } }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed inset-4 md:inset-10 lg:inset-y-10 lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:w-full lg:max-w-4xl bg-white shadow-2xl rounded-2xl z-50 overflow-hidden flex flex-col"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 text-gray-400 hover:text-gray-900 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-10 btn-press"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="overflow-y-auto p-4 sm:p-8 flex-1 scrollbar-hide">
              {renderContent()}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function CheckCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
