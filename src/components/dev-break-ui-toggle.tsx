'use client'

import React from 'react'
import { Bug, Sparkles, ShieldCheck } from 'lucide-react'

export type BreakUiMode = 'live' | 'worst' | 'empty' | 'one' | 'extreme'

interface DevBreakUiToggleProps {
  currentMode: BreakUiMode
  onModeChange: (mode: BreakUiMode) => void
}

const MODES: { id: BreakUiMode; label: string; description: string }[] = [
  { id: 'live', label: 'Live Data', description: 'Real database records' },
  { id: 'worst', label: 'Worst Case', description: 'Long text, edge unicode, negative profit' },
  { id: 'empty', label: 'Empty (0)', description: 'Zero items and zero statistics' },
  { id: 'one', label: 'One Item (1)', description: 'Singular plurals and single-row layout' },
  { id: 'extreme', label: 'Extreme (₹987 Cr)', description: 'Massive scale and large units' }
]

export function DevBreakUiToggle({ currentMode, onModeChange }: DevBreakUiToggleProps) {
  // Never render in production builds
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  return (
    <aside
      aria-label="Break UI developer toggle"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 p-1.5 bg-neutral-950/90 backdrop-blur-md border border-neutral-800/80 rounded-full shadow-2xl text-xs text-neutral-300 font-sans pointer-events-auto"
    >
      <div className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0 select-none border-r border-neutral-800">
        <Bug size={13} className="text-amber-400 shrink-0" />
        <span>/break-ui</span>
        {currentMode === 'live' ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-normal normal-case">
            <ShieldCheck size={11} /> live safe
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-normal normal-case">
            <Sparkles size={11} /> mock
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {MODES.map((mode) => {
          const isActive = currentMode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onModeChange(mode.id)}
              title={mode.description}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] whitespace-nowrap ${
                isActive
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
              }`}
            >
              {mode.label}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
