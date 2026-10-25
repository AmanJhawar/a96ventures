"use client"

import React from 'react'
import { Calendar } from 'lucide-react'
import { ProductCategory, MetalType } from '@/lib/types'
import CustomDatePicker from '@/components/custom-date-picker'

const CATEGORIES: ProductCategory[] = ['Bullions', 'Idols']

interface SalesFilterBarProps {
  dateRangePreset: 'all' | 'today' | 'week' | 'month' | 'custom'
  onPresetChange: (preset: 'all' | 'today' | 'week' | 'month' | 'custom') => void
  customStartDate: string
  onCustomStartDateChange: (val: string) => void
  customEndDate: string
  onCustomEndDateChange: (val: string) => void
  selectedCategory: ProductCategory | 'All'
  onCategoryChange: (cat: ProductCategory | 'All') => void
  selectedMetal: MetalType | 'All'
  onMetalChange: (metal: MetalType | 'All') => void
}

export function SalesFilterBar({
  dateRangePreset,
  onPresetChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  selectedCategory,
  onCategoryChange,
  selectedMetal,
  onMetalChange
}: SalesFilterBarProps) {
  return (
    <>
      {/* Date Range Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 mb-6 bg-white border border-gray-200 rounded-xl shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 px-2 select-none">
            <Calendar size={14} className="text-gray-400" />
            Date Range:
          </span>
          <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
            {([
              { id: 'all', label: 'All Dates' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'Last 7 Days' },
              { id: 'month', label: 'Last 30 Days' },
              { id: 'custom', label: 'Custom' }
            ] as const).map((preset) => (
              <button
                key={preset.id}
                onClick={() => onPresetChange(preset.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
                  dateRangePreset === preset.id
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {dateRangePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="w-36">
              <CustomDatePicker
                size="sm"
                value={customStartDate}
                onChange={onCustomStartDateChange}
                placeholder="Start Date"
              />
            </div>
            <span className="text-xs text-gray-400 font-medium">to</span>
            <div className="w-36">
              <CustomDatePicker
                size="sm"
                value={customEndDate}
                onChange={onCustomEndDateChange}
                placeholder="End Date"
              />
            </div>
          </div>
        )}
      </div>

      {/* Category & Metal Segmented Filters */}
      <div className="flex flex-wrap items-center gap-2.5 mb-6">
        {/* Category Filter */}
        <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 select-none">
            Category
          </span>
          <button
            onClick={() => onCategoryChange('All')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
              selectedCategory === 'All'
                ? 'bg-white text-black font-semibold shadow-xs'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
                selectedCategory === cat
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Metal Filter */}
        <div className="inline-flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 select-none">
            Metal
          </span>
          {(['All', 'Gold', 'Silver'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMetalChange(m)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
                selectedMetal === m
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              {m === 'All' ? 'All' : m}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
