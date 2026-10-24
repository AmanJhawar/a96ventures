"use client"

import React, { createContext, useContext, useState, useCallback } from 'react'
import { Transaction, AuditLogEntry, ProductCategory } from '@/lib/types'
import { verifyArchiveIntegrity, ArchiveVerificationResult } from '@/lib/utils/archive-checksum'
import { verifyArchiveWithServer } from '@/lib/services/inventory.service'
import { toast } from 'sonner'

export interface ArchivedSession {
  filename: string
  exportedAt: string
  cutoffDate?: string
  openingDate?: string
  transactions: Transaction[]
  auditLogs: AuditLogEntry[]
  productsSnapshot?: Array<Record<string, unknown>>
  checksum?: string
  verification: ArchiveVerificationResult
}

interface ArchiveContextValue {
  archivedSession: ArchivedSession | null
  loadArchiveFromFile: (file: File) => Promise<boolean>
  loadArchiveFromData: (filename: string, rawData: Record<string, unknown> | unknown[]) => Promise<boolean>
  exitArchive: () => void
}

const ArchiveContext = createContext<ArchiveContextValue>({
  archivedSession: null,
  loadArchiveFromFile: async () => false,
  loadArchiveFromData: async () => false,
  exitArchive: () => {}
})

export function ArchiveProvider({ children }: { children: React.ReactNode }) {
  const [archivedSession, setArchivedSession] = useState<ArchivedSession | null>(null)

  const processArchiveObject = useCallback(async (filename: string, parsed: Record<string, unknown> | unknown[]): Promise<boolean> => {
    try {
      let loadedTxs: Transaction[] = []
      let loadedAuditLogs: AuditLogEntry[] = []
      let productsSnapshot: Array<Record<string, unknown>> = []
      let exportDate = new Date().toISOString()
      let cutoffDate: string | undefined = undefined
      let openingDate: string | undefined = undefined
      let checksum: string | undefined = undefined

      if (Array.isArray(parsed)) {
        loadedTxs = parsed as Transaction[]
      } else if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        if (Array.isArray(obj.transactions)) loadedTxs = obj.transactions as Transaction[]
        if (Array.isArray(obj.auditLogs)) loadedAuditLogs = obj.auditLogs as AuditLogEntry[]
        if (Array.isArray(obj.productsSnapshot)) productsSnapshot = obj.productsSnapshot as Array<Record<string, unknown>>
        if (typeof obj.exportedAt === 'string') exportDate = obj.exportedAt
        if (typeof obj.cutoffDate === 'string') cutoffDate = obj.cutoffDate
        if (typeof obj.openingDate === 'string') openingDate = obj.openingDate
        if (typeof obj.checksum === 'string') checksum = obj.checksum
      } else {
        throw new Error('Unrecognized archive format. Expected an exported transaction & audit archive.')
      }

      loadedTxs = loadedTxs.map((t) => ({
        ...t,
        category: ((t.category as string) === 'Silver Idols' ? 'Idols' : t.category) as ProductCategory
      }))

      // Verify cryptographic integrity
      const parsedRecord = (Array.isArray(parsed) ? { transactions: parsed } : parsed) as Record<string, unknown>
      const verification = await verifyArchiveIntegrity(parsedRecord)

      // Validate against server secret and system_archives
      if (verification.status === 'verified' || parsedRecord.checksum || parsedRecord.signature || parsedRecord.archiveId) {
        try {
          const serverResult = await verifyArchiveWithServer({
            checksum: typeof parsedRecord.checksum === 'string' ? parsedRecord.checksum : verification.computedChecksum,
            signature: typeof parsedRecord.signature === 'string' ? parsedRecord.signature : undefined,
            archiveId: typeof parsedRecord.archiveId === 'string' ? parsedRecord.archiveId : undefined
          })

          if (serverResult.status === 'tampered') {
            verification.status = 'tampered'
            verification.message = serverResult.message || ''
          } else if (serverResult.status === 'unverified') {
            verification.status = 'unverified'
            verification.message = serverResult.message || ''
          } else if (serverResult.status === 'verified') {
            verification.status = 'verified'
            verification.message = serverResult.message || ''
          }
        } catch (serverVerifErr) {
          console.warn('Server archive verification check unavailable:', serverVerifErr)
        }
      }

      if (verification.status === 'tampered') {
        toast.error('TAMPER WARNING: Archive checksum or signature invalid!', {
          description: verification.message || 'This archive file has been modified or edited after export and cannot be trusted.',
          duration: 9000
        })
      } else if (verification.status === 'verified') {
        toast.success(`Cryptographically Verified Archive "${filename}"`, {
          description: verification.message || `Integrity and server authority verified (${loadedTxs.length} txs, ${loadedAuditLogs.length} audit logs).`
        })
      } else {
        toast.warning(`Unverified Archive "${filename}"`, {
          description: verification.message || `No valid server cryptographic signature or system archive record found. ${loadedTxs.length} txs, ${loadedAuditLogs.length} audit logs.`
        })
      }

      setArchivedSession({
        filename,
        exportedAt: exportDate,
        cutoffDate,
        openingDate,
        transactions: loadedTxs,
        auditLogs: loadedAuditLogs,
        productsSnapshot,
        checksum,
        verification
      })

      return true
    } catch (err: unknown) {
      console.error('Failed to parse archive data:', err)
      const msg = err instanceof Error ? err.message : 'Invalid archive file'
      toast.error('Failed to parse archive', { description: msg })
      return false
    }
  }, [])

  const loadArchiveFromFile = useCallback(async (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string
          const parsed = JSON.parse(text)
          const success = await processArchiveObject(file.name, parsed)
          resolve(success)
        } catch (err: unknown) {
          console.error('Failed to read archive file:', err)
          toast.error('Failed to read archive file. Please ensure it is a valid JSON file.')
          resolve(false)
        }
      }
      reader.readAsText(file)
    })
  }, [processArchiveObject])

  const loadArchiveFromData = useCallback(async (filename: string, rawData: Record<string, unknown> | unknown[]): Promise<boolean> => {
    return processArchiveObject(filename, rawData)
  }, [processArchiveObject])

  const exitArchive = useCallback(() => {
    setArchivedSession(null)
    toast.info('Exited offline archive view')
  }, [])

  return (
    <ArchiveContext.Provider
      value={{
        archivedSession,
        loadArchiveFromFile,
        loadArchiveFromData,
        exitArchive
      }}
    >
      {children}
    </ArchiveContext.Provider>
  )
}

export function useArchive() {
  return useContext(ArchiveContext)
}
