'use client'

import { useEffect } from 'react'
import { X, ListChecks } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScoreBadge } from '@/components/screener/score-badge'
import { ScoreBreakdown } from '@/components/screener/score-breakdown'
import { MetalScore, MetalSignal } from '@/lib/screener-types'

export function MetalModal({ 
  metal, 
  score, 
  signal,
  onClose 
}: { 
  metal: string | null
  score?: MetalScore
  signal?: MetalSignal
  onClose: () => void 
}) {
  // Prevent scrolling on body when modal is open
  useEffect(() => {
    if (metal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [metal])

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <AnimatePresence>
      {metal && score && (
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
            
            <div className="overflow-y-auto p-4 sm:p-8 flex-1 scrollbar-hide space-y-8">
              <header className="flex items-center gap-4 border-b border-gray-200 pb-6">
                <h1 className="text-4xl font-bold tracking-tight text-gray-900 uppercase">{metal}</h1>
                <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-widest bg-gray-100 text-gray-600 rounded">
                  Metal
                </span>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    Latest Signal
                  </h3>
                  <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <span className="text-gray-500 text-sm font-medium">T-Score</span>
                        <div className="mt-1"><ScoreBadge score={score.t_score} max={6} className="text-lg px-3 py-1.5" /></div>
                      </div>
                    </div>
                    
                    {signal ? (
                      <div className="bg-gray-100 border border-black rounded-lg p-4 flex items-center justify-between">
                        <span className="font-bold text-black uppercase tracking-widest flex items-center gap-2">
                          Buy Signal
                        </span>
                        <span className="text-black font-bold">₹{score.price_inr?.toFixed(2) || signal.price_at_signal?.toFixed(2)}</span>
                      </div>
                    ) : (
                      <div className="bg-gray-200/50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                        <span className="font-bold text-gray-500 uppercase tracking-widest">No Signal</span>
                        <span className="text-gray-700 font-bold tabular-nums">₹{score.price_inr?.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {score.breakdown && (
                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <ListChecks className="w-4 h-4" /> Score Breakdown
                  </h3>
                  <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
                    <ScoreBreakdown breakdown={score.breakdown} title="Technical Score" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
