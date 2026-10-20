'use client'

import React from 'react'
import { ConfirmModal } from '@/components/confirm-modal'

interface ZeroBalanceModalProps {
  isOpen: boolean
  onClose: () => void
  zeroBalanceSubmitting: boolean
  zeroBalanceConfirmText: string
  setZeroBalanceConfirmText: (val: string) => void
  zeroBalancePassword: string
  setZeroBalancePassword: (val: string) => void
  zeroBalanceCutoffDate: string
  setZeroBalanceCutoffDate: (val: string) => void
  zeroBalanceOpeningDate: string
  handleZeroBalance: () => void
  getTodayIST: () => string
  formatDisplayDateIST: (dateStr: string) => string
}

export function ZeroBalanceModal({
  isOpen,
  onClose,
  zeroBalanceSubmitting,
  zeroBalanceConfirmText,
  setZeroBalanceConfirmText,
  zeroBalancePassword,
  setZeroBalancePassword,
  zeroBalanceCutoffDate,
  setZeroBalanceCutoffDate,
  zeroBalanceOpeningDate,
  handleZeroBalance,
  getTodayIST,
  formatDisplayDateIST
}: ZeroBalanceModalProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Zero balance all history & audit log"
      description="Archives and clears transactions and audit logs up to the specified cutoff date. Consolidated opening balances will be dated the following day. All future entries on or before the cutoff date will be permanently blocked."
      confirmText={zeroBalanceSubmitting ? 'Archiving & Erasing...' : 'Purge & Zero Balance'}
      disabled={
        zeroBalanceSubmitting ||
        zeroBalanceConfirmText.trim() !== 'CONFIRM ZERO BALANCE' ||
        !zeroBalancePassword.trim()
      }
      onConfirm={handleZeroBalance}
      onClose={onClose}
    >
      <div className="space-y-4 pt-2">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Closing fiscal cutoff date (inclusive)
            </label>
            <input
              type="date"
              value={zeroBalanceCutoffDate}
              max={getTodayIST()}
              disabled={zeroBalanceSubmitting}
              onChange={(e) => setZeroBalanceCutoffDate(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:border-black transition-[border-color] duration-150 disabled:opacity-50"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Standard fiscal year closes on 31 March (e.g. 2026-03-31).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 text-xs">
            <div>
              <span className="text-gray-500 block">Cutoff (Wiped):</span>
              <span className="font-semibold text-rose-600">
                ≤ {formatDisplayDateIST(zeroBalanceCutoffDate)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Opening Entry Date:</span>
              <span className="font-semibold text-emerald-700">
                {formatDisplayDateIST(zeroBalanceOpeningDate)}
              </span>
            </div>
          </div>
        </div>

        {/* Type to Confirm and Password Re-Auth */}
        <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl space-y-3">
          <div>
            <label className="block text-xs font-medium text-rose-900 mb-1">
              Type-to-confirm: Type <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-rose-300 select-all font-bold">CONFIRM ZERO BALANCE</span>
            </label>
            <input
              type="text"
              value={zeroBalanceConfirmText}
              disabled={zeroBalanceSubmitting}
              onChange={(e) => setZeroBalanceConfirmText(e.target.value)}
              placeholder="CONFIRM ZERO BALANCE"
              className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-rose-600 transition-[border-color] duration-150 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-rose-900 mb-1">
              Account password (fresh sign-in verification)
            </label>
            <input
              type="password"
              value={zeroBalancePassword}
              disabled={zeroBalanceSubmitting}
              onChange={(e) => setZeroBalancePassword(e.target.value)}
              placeholder="Enter your current password"
              className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-rose-600 transition-[border-color] duration-150 disabled:opacity-50"
            />
            <p className="text-[11px] text-rose-700/80 mt-1">
              Server mandates recent authentication within the last 5 minutes to authorize irreversible purges.
            </p>
          </div>
        </div>

        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
          <strong>Server lock & protection:</strong> A distributed lock pauses new entries during the run. The archive is saved server-side with count and SHA-256 checksum recorded before records are deleted. Opening balances cannot be reversed. Future entries on or before {formatDisplayDateIST(zeroBalanceCutoffDate)} will be blocked.
        </div>
      </div>
    </ConfirmModal>
  )
}
