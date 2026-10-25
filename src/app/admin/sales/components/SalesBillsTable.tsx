"use client"

import React from 'react'
import Link from 'next/link'
import {
  Plus,
  RotateCcw,
  Pencil,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react'
import { Transaction, UserPermissions } from '@/lib/types'
import { SaleBill, formatDateDisplay } from './types'
import { formatWeight } from '@/lib/utils/weight'
import { EmptyState } from '@/components/empty-state'

interface SalesBillsTableProps {
  saleBills: SaleBill[]
  filteredSalesCount: number
  totalSalesCount: number
  expandedBillKeys: Set<string>
  onToggleBillExpand: (key: string) => void
  hasPermission: (module: keyof UserPermissions, action: string) => boolean
  isSuperAdmin: boolean
  onOpenEditSale: (tx: Transaction) => void
  onReverseOrder: (bill: SaleBill) => void
  onReverseTx: (tx: Transaction) => void
  onOpenSaleForm: () => void
  canAddSale: boolean
  salesHasMore: boolean
  loadingMoreSales: boolean
  onLoadMoreSales: () => void
}

export function SalesBillsTable({
  saleBills,
  filteredSalesCount,
  totalSalesCount,
  expandedBillKeys,
  onToggleBillExpand,
  hasPermission,
  isSuperAdmin,
  onOpenEditSale,
  onReverseOrder,
  onReverseTx,
  onOpenSaleForm,
  canAddSale,
  salesHasMore,
  loadingMoreSales,
  onLoadMoreSales
}: SalesBillsTableProps) {
  if (saleBills.length === 0) {
    return (
      <EmptyState
        title="No sales recorded"
        description="When you record a customer sale, stock is automatically decremented from the chosen physical location."
        action={
          canAddSale ? (
            <button
              onClick={onOpenSaleForm}
              className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <Plus size={16} />
              Record First Sale
            </button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-50/95 backdrop-blur z-10 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Bill / Invoice</th>
              <th className="px-5 py-3.5">Date</th>
              <th className="px-5 py-3.5">Customer</th>
              <th className="px-5 py-3.5">Location</th>
              <th className="px-5 py-3.5 text-right">Items</th>
              <th className="px-5 py-3.5 text-right">Total (₹)</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {saleBills.map((bill) => {
              const isExpanded = expandedBillKeys.has(bill.billKey)
              return (
                <React.Fragment key={bill.billKey}>
                  <tr
                    onClick={() => onToggleBillExpand(bill.billKey)}
                    className="hover:bg-gray-50/80 cursor-pointer transition-[background-color] duration-150 group"
                  >
                    <td className="px-5 py-4 font-semibold text-xs text-black whitespace-nowrap tracking-tight">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 flex items-center justify-center rounded text-gray-400 group-hover:text-black group-hover:bg-gray-200/60 transition-[background-color,color] duration-150">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <span className="font-semibold">{bill.invoiceNo}</span>
                        {bill.hasReversed && !bill.hasActive && (
                          <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Reversed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-600 whitespace-nowrap">
                      {formatDateDisplay(bill.date)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-black max-w-[220px]">
                      {bill.customerId ? (
                        <Link
                          href={`/admin/customers/${bill.customerId}`}
                          className="inline-flex items-center gap-1.5 text-black hover:underline group-hover:text-blue-600 transition-[color] duration-150 max-w-full"
                          onClick={(e) => e.stopPropagation()}
                          title={bill.customerName || 'View Customer'}
                        >
                          <span className="truncate">{bill.customerName || 'View Customer'}</span>
                          <ExternalLink size={12} className="text-gray-400 shrink-0" />
                        </Link>
                      ) : (
                        <span className="truncate block" title={bill.customerName || 'Walk-in Customer'}>
                          {bill.customerName || <span className="text-gray-400 font-normal italic">Walk-in Customer</span>}
                        </span>
                      )}
                      {bill.paymentModes && bill.paymentModes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bill.paymentModes.map((mode) => (
                            <span
                              key={mode}
                              className="inline-flex px-1.5 py-0.5 rounded text-[10px] uppercase bg-gray-100 text-gray-700 border border-gray-200 font-medium"
                            >
                              {mode === 'old_metal' ? 'Metal' : mode}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-700 max-w-[180px] truncate" title={bill.locationName}>
                      {bill.locationName}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-xs font-medium text-gray-700 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-800">
                        {bill.items.length} {bill.items.length === 1 ? 'item' : 'items'} • {bill.totalQuantity} {bill.totalQuantity === 1 ? 'unit' : 'units'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums font-bold text-black whitespace-nowrap">
                      ₹{bill.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {bill.items.length === 1 && !bill.orderId && (isSuperAdmin || hasPermission('sales', 'edit')) && !bill.items[0].isReversed && !bill.items[0].reversalOf && (
                          <button
                            onClick={() => onOpenEditSale(bill.items[0])}
                            title="Edit sale"
                            className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {hasPermission('sales', 'delete') && bill.hasActive && (
                          <button
                            onClick={() => {
                              if (bill.orderId) {
                                onReverseOrder(bill)
                              } else {
                                const activeItem = bill.items.find((i) => !i.isReversed && !i.reversalOf)
                                if (activeItem) onReverseTx(activeItem)
                              }
                            }}
                            title={bill.orderId ? 'Reverse bill' : 'Post reversing entry (restores stock)'}
                            className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Line Items Table */}
                  {isExpanded && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={7} className="px-6 py-3 border-t border-b border-gray-200/80">
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-2xs">
                          <div className="px-4 py-2 bg-gray-50/70 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                            <span>Bill Line Items ({bill.items.length})</span>
                            <span className="font-normal text-gray-400">Invoice: {bill.invoiceNo}</span>
                          </div>
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 text-gray-400 font-medium">
                                <th className="py-2.5 px-4 font-normal">Product</th>
                                <th className="py-2.5 px-4 font-normal">Metal</th>
                                <th className="py-2.5 px-4 font-normal">Category</th>
                                <th className="py-2.5 px-4 text-right font-normal">Qty / Weight</th>
                                <th className="py-2.5 px-4 text-right font-normal">Unit Price</th>
                                <th className="py-2.5 px-4 text-right font-normal">Total</th>
                                <th className="py-2.5 px-4 text-right font-normal">
                                  {bill.orderId ? 'Status' : 'Actions'}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {bill.items.map((item) => {
                                const lineTotal = (item.price || 0) * (item.quantity || 1)
                                return (
                                  <tr key={item.id} className="hover:bg-gray-50/40">
                                    <td className="py-2.5 px-4 font-semibold text-black max-w-[260px]">
                                      <div className="truncate" title={item.productName}>
                                        {item.productName}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-4">
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border border-gray-200 text-gray-700 bg-gray-50">
                                        {item.metal || 'Silver'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-4 text-gray-600">
                                      {item.category}
                                    </td>
                                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-black">
                                      {item.quantity}
                                      {item.pieceWeight && (
                                        <span className="text-[11px] tabular-nums text-gray-500 block">
                                          ({formatWeight(item.pieceWeight)})
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-4 text-right tabular-nums text-gray-600 whitespace-nowrap">
                                      {item.price ? `₹${item.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                                    </td>
                                    <td className="py-2.5 px-4 text-right tabular-nums font-bold text-black whitespace-nowrap">
                                      ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2.5 px-4 text-right">
                                      {item.orderId ? (
                                        item.isReversed || item.reversalOf ? (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                            Reversed
                                          </span>
                                        ) : (
                                          <span className="text-gray-400 text-xs">—</span>
                                        )
                                      ) : (
                                        <div className="flex items-center justify-end gap-1">
                                          {(isSuperAdmin || hasPermission('sales', 'edit')) && !item.isReversed && !item.reversalOf && (
                                            <button
                                              onClick={() => onOpenEditSale(item)}
                                              title="Edit item"
                                              className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                                            >
                                              <Pencil size={13} />
                                            </button>
                                          )}
                                          {hasPermission('sales', 'delete') && !item.isReversed && !item.reversalOf && (
                                            <button
                                              onClick={() => onReverseTx(item)}
                                              title="Reverse this item"
                                              className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                                            >
                                              <RotateCcw size={13} />
                                            </button>
                                          )}
                                          {(item.isReversed || item.reversalOf) && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                              Reversed
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Load More Controls */}
      <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
        <span className="font-mono">
          Showing <strong className="text-black font-semibold">{filteredSalesCount}</strong> of{' '}
          <strong className="text-black font-semibold">{totalSalesCount}</strong> recorded sales
        </span>
        {salesHasMore ? (
          <button
            onClick={onLoadMoreSales}
            disabled={loadingMoreSales}
            className="h-9 px-4 inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-800 hover:text-black hover:bg-gray-50 rounded-lg text-xs font-semibold shadow-xs transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50"
          >
            {loadingMoreSales ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Loading more...
              </>
            ) : (
              'Load More Sales'
            )}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400 font-mono">
            {filteredSalesCount > 0 ? 'All sales loaded' : ''}
          </span>
        )}
      </div>
    </div>
  )
}
