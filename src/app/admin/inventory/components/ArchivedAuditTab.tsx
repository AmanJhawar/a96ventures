'use client'

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ArchivedAuditTabProps {
  archivedAuditSearch: string
  setArchivedAuditSearch: (val: string) => void
  archivedAuditEntityFilter: string
  setArchivedAuditEntityFilter: (filter: 'all' | 'product' | 'sale' | 'movement' | 'purchase' | 'user' | 'archive') => void
  filteredArchivedAuditLogs: any[]
  paginatedArchivedAuditLogs: any[]
  totalArchivedAuditPages: number
  archivedAuditPage: number
  setArchivedAuditPage: React.Dispatch<React.SetStateAction<number>>
  archivedAuditPageSize: number
}

export function ArchivedAuditTab({
  archivedAuditSearch,
  setArchivedAuditSearch,
  archivedAuditEntityFilter,
  setArchivedAuditEntityFilter,
  filteredArchivedAuditLogs,
  paginatedArchivedAuditLogs,
  totalArchivedAuditPages,
  archivedAuditPage,
  setArchivedAuditPage,
  archivedAuditPageSize
}: ArchivedAuditTabProps) {
  return (
    <div className="space-y-6">
      {/* Archived Audit Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search archived narrative, user, or entity..."
            value={archivedAuditSearch}
            onChange={(e) => setArchivedAuditSearch(e.target.value)}
            className="w-full pl-3.5 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
          <span className="text-xs font-medium text-gray-500 mr-1">Entity:</span>
          {(['all', 'product', 'sale', 'movement', 'purchase', 'user', 'archive'] as const).map((ent) => (
            <button
              key={ent}
              type="button"
              onClick={() => setArchivedAuditEntityFilter(ent)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${archivedAuditEntityFilter === ent
                ? 'bg-black text-white border border-black shadow-xs'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
              }`}
            >
              {ent}
            </button>
          ))}
        </div>
      </div>

      {/* Archived Audit Logs Table */}
      {filteredArchivedAuditLogs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
          <h3 className="text-base font-semibold text-black mb-1">No archived audit entries found</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            No audit trail events match the current search or entity filters in this archive.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur z-10 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Operator</th>
                  <th className="px-6 py-3.5">Action</th>
                  <th className="px-6 py-3.5">Entity</th>
                  <th className="px-6 py-3.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {paginatedArchivedAuditLogs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-6 py-4 text-gray-500 font-mono whitespace-nowrap">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-black block">{entry.userName}</span>
                      <span className="text-[11px] text-gray-400">{entry.userEmail}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="capitalize font-medium text-black">{entry.entityType}</span>
                      {entry.entityName && <span className="text-gray-500 block text-[11px] truncate max-w-xs">{entry.entityName}</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-700 max-w-md">
                      <div>{entry.description}</div>
                      {Array.isArray(entry.diffs) && entry.diffs.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {entry.diffs.map((d: any, idx: number) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                              {d.label || d.field}: {String(d.oldValue ?? 'None')} → {String(d.newValue ?? 'None')}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalArchivedAuditPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 text-xs text-gray-500">
              <span>
                Showing {(archivedAuditPage - 1) * archivedAuditPageSize + 1} to{' '}
                {Math.min(archivedAuditPage * archivedAuditPageSize, filteredArchivedAuditLogs.length)} of{' '}
                {filteredArchivedAuditLogs.length} archived entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setArchivedAuditPage((p) => Math.max(1, p - 1))}
                  disabled={archivedAuditPage <= 1}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-medium text-black">
                  Page {archivedAuditPage} of {totalArchivedAuditPages}
                </span>
                <button
                  type="button"
                  onClick={() => setArchivedAuditPage((p) => Math.min(totalArchivedAuditPages, p + 1))}
                  disabled={archivedAuditPage >= totalArchivedAuditPages}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97]"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
