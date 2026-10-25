"use client"

import React from 'react'
import { IndianRupee, PackageCheck, RotateCcw, TrendingUp } from 'lucide-react'
import { TransactionStats } from '@/lib/types'

interface SalesMetricsStripProps {
  stats: TransactionStats
}

export function SalesMetricsStrip({ stats }: SalesMetricsStripProps) {
  const profitVal = stats.profit ?? stats.netRevenue
  const grossSalesFormatted = stats.salesRevenue.toLocaleString('en-IN', {
    maximumFractionDigits: 2
  })
  const returnsFormatted = stats.returnsAmount.toLocaleString('en-IN', {
    maximumFractionDigits: 2
  })
  const profitFormatted = Math.abs(profitVal).toLocaleString('en-IN', {
    maximumFractionDigits: 2
  })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Gross Sales */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Gross Sales</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
            <IndianRupee size={14} />
          </div>
        </div>
        <div className="min-w-0">
          <div
            title={`₹${grossSalesFormatted}`}
            className="text-xl sm:text-2xl font-bold text-black tabular-nums tracking-tight truncate"
          >
            ₹{grossSalesFormatted}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium truncate">
            {stats.salesCount} {stats.salesCount === 1 ? 'sale' : 'sales'}
          </div>
        </div>
      </div>

      {/* Units Sold */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Units Sold</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
            <PackageCheck size={14} />
          </div>
        </div>
        <div className="min-w-0">
          <div
            title={stats.salesUnits.toLocaleString('en-IN')}
            className="text-xl sm:text-2xl font-bold text-black tabular-nums tracking-tight truncate"
          >
            {stats.salesUnits.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium truncate">units dispatched</div>
        </div>
      </div>

      {/* Returns */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Returns</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
            <RotateCcw size={14} />
          </div>
        </div>
        <div className="min-w-0">
          <div
            title={`₹${returnsFormatted}`}
            className="text-xl sm:text-2xl font-bold text-black tabular-nums tracking-tight truncate"
          >
            ₹{returnsFormatted}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium truncate">
            {stats.returnsCount} {stats.returnsCount === 1 ? 'return' : 'returns'}
          </div>
        </div>
      </div>

      {/* Profit */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-gray-500">Profit</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
            <TrendingUp size={14} />
          </div>
        </div>
        <div className="min-w-0">
          <div
            title={profitVal < 0 ? `-₹${profitFormatted}` : `₹${profitFormatted}`}
            className={`text-xl sm:text-2xl font-bold tabular-nums tracking-tight truncate ${
              profitVal < 0 ? 'text-rose-600' : 'text-black'
            }`}
          >
            {profitVal < 0 ? `-₹${profitFormatted}` : `₹${profitFormatted}`}
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium truncate">Revenue minus cost</div>
        </div>
      </div>
    </div>
  )
}
