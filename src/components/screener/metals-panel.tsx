import { RunRecord, MetalScore, MetalSignal } from '@/lib/screener-types'
import { ScoreBadge } from './score-badge'
import { motion, Variants } from 'framer-motion'

export function MetalsPanel({
  metals,
  onMetalClick
}: {
  metals: {
    section: RunRecord['metals_section']
    scores: MetalScore[]
    signals: MetalSignal[]
  } | undefined
  onMetalClick: (metal: string, score: MetalScore, signal?: MetalSignal) => void
}) {
  if (!metals || !metals.section) return null

  const gold = metals.scores.find(s => s.metal === 'gold')
  const silver = metals.scores.find(s => s.metal === 'silver')
  const gsr = metals.section.gsr
  const stance = metals.section.gsr_stance

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.04,
        type: "spring",
        bounce: 0,
        duration: 0.4
      }
    })
  }

  return (
    <div className="glass-card p-6 mb-8">
      <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Metals & Macro</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Gold */}
        <motion.div 
          custom={0}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          className="bg-white rounded-lg p-4 border border-gray-200 cursor-pointer hover:border-gray-400 transition-colors group"
          onClick={() => gold && onMetalClick('gold', gold, metals.signals.find(s => s.metal === 'gold'))}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-700 font-semibold uppercase tracking-wider">Gold</span>
            {gold && <ScoreBadge score={gold.t_score} max={6} />}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {metals.signals.find(s => s.metal === 'gold') ? (
              <span className="text-black font-medium bg-gray-100 border border-black px-2 py-1 rounded text-xs uppercase tracking-widest">Buy Signal</span>
            ) : (
              <span>No active signal</span>
            )}
          </div>
        </motion.div>

        {/* Silver */}
        <motion.div 
          custom={1}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          className="bg-white rounded-lg p-4 border border-gray-200 cursor-pointer hover:border-gray-400 transition-colors group"
          onClick={() => silver && onMetalClick('silver', silver, metals.signals.find(s => s.metal === 'silver'))}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-700 font-semibold uppercase tracking-wider">Silver</span>
            {silver && <ScoreBadge score={silver.t_score} max={6} />}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {metals.signals.find(s => s.metal === 'silver') ? (
              <span className="text-black font-medium bg-gray-100 border border-black px-2 py-1 rounded text-xs uppercase tracking-widest">Buy Signal</span>
            ) : (
              <span>No active signal</span>
            )}
          </div>
        </motion.div>

        {/* GSR */}
        <motion.div 
          custom={2}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          className="bg-white rounded-lg p-4 border border-gray-200 flex flex-col justify-between"
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-700 font-semibold uppercase tracking-wider">Gold/Silver Ratio</span>
          </div>
          <div className="flex items-end gap-3 mt-2">
            <span className="text-3xl font-bold tabular-nums text-gray-900 leading-none">{gsr?.toFixed(2)}</span>
            <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded border ${
              stance === 'silver_favored' ? 'bg-gray-100 text-black border-black' :
              stance === 'gold_favored' ? 'bg-black text-white border-black' :
              'bg-white text-gray-500 border-gray-300'
            }`}>
              {stance === 'silver_favored' ? 'Silver Favoured' : stance === 'gold_favored' ? 'Gold Favoured' : 'Neutral'}
            </span>
          </div>
        </motion.div>
        
      </div>
    </div>
  )
}
