"use client"

import React from 'react'
import { IndianRupee, PackageCheck, RotateCcw, TrendingUp } from 'lucide-react'
import { TransactionStats } from '@/lib/types'

interface SalesMetricsStripProps {
  stats: TransactionStats
}

export function SalesMetricsStrip({ stats }: SalesMetricsStripProps) {
  const profitVal = stats.profit ?? stats.netRevenue

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Gross Sales</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
            <IndianRupee size={14} />
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-black font-mono tabular-nums tracking-tight">
            ₹{stats.salesRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium">{stats.salesCount} sales</div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Units Sold</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
            <PackageCheck size={14} />
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-black font-mono tabular-nums tracking-tight">
            {stats.salesUnits.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium">units dispatched</div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Returns</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
            <RotateCcw size={14} />
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-black font-mono tabular-nums tracking-tight">
            ₹{stats.returnsAmount.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium">{stats.returnsCount} returns</div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Profit</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
            <TrendingUp size={14} />
          </div>
        </div>
        <div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${
              profitVal < 0 ? 'text-rose-600' : 'text-black'
            }`}
          >
            {profitVal < 0
              ? `-₹${Math.abs(profitVal).toLocaleString('en-IN')}`
              : `₹${profitVal.toLocaleString('en-IN')}`}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium">Revenue minus cost</div>
        </div>
      </div>
    </div>
  )
}
