'use client'

import { useEffect, useState } from 'react'
import { fetchApi } from '@/lib/screener-api'
import { ScoreBadge } from '@/components/screener/score-badge'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/screener/toast-context'
import { TableSkeleton } from '@/components/screener/skeleton'
import { StockModal } from '@/components/screener/stock-modal'

export default function LogPage() {
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingRun, setLoadingRun] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    fetchApi('/logs')
      .then((res: any) => {
        const d = (res.runs || []).map((r: any) => r.run_date)
        setDates(d)
        if (d.length > 0) {
          setSelectedDate(d[0])
        }
      })
      .catch(error => {
        showToast(error.message, 'error')
      })
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => {
    if (!selectedDate) return
    setLoadingRun(true)
    fetchApi(`/logs/${selectedDate}`)
      .then(setData)
      .catch(error => {
        showToast(error.message, 'error')
      })
      .finally(() => setLoadingRun(false))
  }, [selectedDate, showToast])

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <header className="mb-8">
          <div className="skeleton h-8 w-48 rounded mb-2"></div>
          <div className="skeleton h-4 w-96 rounded"></div>
        </header>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-64 glass-card p-4 min-h-[400px]">
            <div className="skeleton h-8 w-32 rounded mb-6 mx-auto"></div>
            {Array.from({length: 6}).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full rounded mb-2"></div>
            ))}
          </div>
          <div className="flex-1 glass-card p-6 min-h-[400px]">
            <TableSkeleton columns={5} rows={6} />
          </div>
        </div>
      </div>
    )
  }

  const handlePrev = () => {
    if (!selectedDate) return
    const idx = dates.indexOf(selectedDate)
    if (idx < dates.length - 1) setSelectedDate(dates[idx + 1])
  }

  const handleNext = () => {
    if (!selectedDate) return
    const idx = dates.indexOf(selectedDate)
    if (idx > 0) setSelectedDate(dates[idx - 1])
  }

  const renderContent = () => {
    if (loadingRun) {
      return <TableSkeleton columns={5} rows={6} />
    }

    if (!data) return <div className="text-gray-500 text-center py-12">Failed to load run details</div>

    const run = data.run
    if (!run) return <div className="text-gray-500 text-center py-12">Run details missing</div>

    if (run.status === 'skipped') {
      return (
        <div className="text-center py-24 text-gray-500">
          <div className="w-16 h-16 border-2 border-gray-200 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
            <span className="text-2xl font-bold">⏸</span>
          </div>
          <p className="font-medium text-gray-700">Run Skipped</p>
          <p className="text-sm mt-1">This was likely a market holiday.</p>
        </div>
      )
    }

    const filtered = (data.scores || []).filter((s: any) => 
      s.symbol.toLowerCase().includes(search.toLowerCase())
    )

    return (
      <div className="space-y-6">
        <header className="mb-8 border-b border-gray-200 pb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-500 text-sm tracking-wide font-mono bg-gray-100 border border-gray-200 inline-block px-2 py-1 rounded">
                Engine Version: {run.logic_version || 'unknown'}
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded text-sm font-bold uppercase tracking-widest ${
              run.status === 'ok' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
              'bg-gold-100 text-gold-700 border border-gold-200'
            }`}>
              {run.status}
            </div>
          </div>
          <div className="flex gap-8 text-sm">
            <div>
              <span className="text-gray-500 block mb-1">Scored</span>
              <span className="text-gray-900 font-bold text-lg">{run.scored_count}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Gate Passers (Calls)</span>
              <span className="text-gray-900 font-bold text-lg">{run.passed_count}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Metals Leg</span>
              <span className="text-gray-900 font-bold text-lg">{run.metals_section?.status || 'skipped'}</span>
            </div>
          </div>
        </header>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search symbol..."
              className="w-full bg-white border border-gray-200 rounded-lg py-2 pl-10 pr-4 text-sm text-gray-900 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-colors uppercase placeholder:normal-case shadow-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto bg-gray-50 rounded-lg border border-gray-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100/50">
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Symbol</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Engine</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">F-Score</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">T-Score</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr 
                  key={s.symbol} 
                  className="border-b border-gray-200 last:border-0 hover:bg-white transition-colors cursor-pointer group"
                  onClick={() => setSelectedSymbol(s.symbol)}
                >
                  <td className="py-3 px-4">
                    <span className="font-bold text-gray-900 group-hover:text-gold-600 transition-colors">
                      {s.symbol}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] uppercase tracking-wider bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                      {s.engine === 'bank' ? 'Bank' : 'Non-Bank'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <ScoreBadge score={s.f_score} max={s.engine === 'bank' ? 8 : 10} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <ScoreBadge score={s.t_score} max={6} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    {s.is_call ? (
                      <span className="text-[10px] uppercase tracking-widest bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">Call</span>
                    ) : (
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Filtered</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">No symbols found matching "{search}"</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <StockModal symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} />
      
      <header className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Run Logs</h1>
          <p className="text-gray-500 text-sm tracking-wide">
            Historical screener execution records.
          </p>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full md:w-64 shrink-0 space-y-2">
          {dates.length === 0 ? (
            <div className="text-gray-500 text-sm p-4 text-center glass-card">No logs found</div>
          ) : (
            <div className="glass-card p-2 max-h-[600px] overflow-y-auto scrollbar-hide">
              {dates.map((date) => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between mb-1 transition-colors btn-press ${
                    date === selectedDate
                      ? 'bg-gold-50 text-gold-700 font-bold border border-gold-200'
                      : 'hover:bg-gray-50 text-gray-600 font-medium border border-transparent'
                  }`}
                >
                  <span>{date}</span>
                  {selectedDate === date && <ChevronRight className="w-4 h-4 opacity-50" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main */}
        <div className="flex-1 glass-card p-6 min-h-[500px]">
          {selectedDate && (
            <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
              <button 
                onClick={handlePrev}
                disabled={dates.indexOf(selectedDate) >= dates.length - 1}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors btn-press"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">{selectedDate}</h2>
              <button 
                onClick={handleNext}
                disabled={dates.indexOf(selectedDate) <= 0}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full disabled:opacity-30 transition-colors btn-press"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
