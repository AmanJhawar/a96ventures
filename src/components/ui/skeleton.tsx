'use client'

import React from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200/70 rounded-md ${className}`}
      aria-hidden="true"
    />
  )
}

export function SkeletonRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-gray-100 animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-4 px-4">
          <div
            className="h-4 bg-gray-200/80 rounded"
            style={{ width: `${Math.max(40, 85 - (i * 12) % 45)}%` }}
          />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonTable({
  rows = 5,
  columns = 5,
  headerHeight = 'h-10'
}: {
  rows?: number
  columns?: number
  headerHeight?: string
}) {
  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
      <div className={`${headerHeight} bg-gray-50 border-b border-gray-200 flex items-center px-4 gap-4 animate-pulse`}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-3.5 bg-gray-200 rounded w-20" />
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="p-4 flex items-center gap-4 animate-pulse">
            {Array.from({ length: columns }).map((_, c) => (
              <div
                key={c}
                className="h-4 bg-gray-200/70 rounded flex-1"
                style={{ maxWidth: c === 0 ? '160px' : c === columns - 1 ? '80px' : undefined }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
