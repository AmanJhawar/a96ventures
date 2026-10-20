"use client"

import { useState, useEffect } from 'react'
import { MapPin, Plus, Trash2, Edit2, AlertCircle, X, Check, Lock } from 'lucide-react'
import { Location, Product } from '@/lib/types'
import { getLocations, addLocation, updateLocation, deleteLocation, getProducts } from '@/lib/services/inventory.service'
import { ConfirmModal } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import { LocationStockModal } from '@/components/location-stock-modal'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { SkeletonTable } from '@/components/ui/skeleton'

export default function AdminLocations() {
  const { hasPermission, isSuperAdmin } = usePermissions()
  const shouldReduceMotion = useReducedMotion()
  const [locations, setLocations] = useState<Location[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedStockLocation, setSelectedStockLocation] = useState<Location | null>(null)
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)


  useEffect(() => {
    let ignore = false
    Promise.all([getLocations(), getProducts()])
      .then(([locs, prods]) => {
        if (!ignore) {
          setLocations(locs)
          setProducts(prods)
          const counts: Record<string, number> = {}
          locs.forEach(l => { counts[l.id] = 0 })
          prods.forEach(p => {
            if (p.stockByLocation) {
              Object.entries(p.stockByLocation).forEach(([locId, qty]) => {
                counts[locId] = (counts[locId] || 0) + Number(qty || 0)
              })
            }
          })
          setStockCounts(counts)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          console.error('Failed to load locations', err)
          const msg = err instanceof Error ? err.message : 'Could not load locations. Please check your connection.'
          setError(msg)
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const handleOpenAdd = () => {
    setEditingId(null)
    setName('')
    setDescription('')
    setError(null)
    setIsFormOpen(true)
  }

  const handleEdit = (loc: Location) => {
    setEditingId(loc.id)
    setName(loc.name)
    setDescription(loc.description || '')
    setError(null)
    setIsFormOpen(true)
  }

  const handleCancel = () => {
    setIsFormOpen(false)
    setEditingId(null)
    setName('')
    setDescription('')
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Location name is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (editingId) {
        await updateLocation(editingId, { name, description })
        setLocations((prev) => prev.map((l) => (l.id === editingId ? { ...l, name, description } : l)))
      } else {
        const newId = await addLocation({ name, description })
        setLocations((prev) => [...prev, { id: newId, name, description }])
        setStockCounts((prev) => ({ ...prev, [newId]: 0 }))
      }
      handleCancel()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save location'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const executeDelete = async () => {
    if (!deleteId) return
    setDeleteError(null)
    try {
      await deleteLocation(deleteId)
      setLocations((prev) => prev.filter((l) => l.id !== deleteId))
      setDeleteId(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete location'
      setDeleteError(msg)
    }
  }

  if (!isSuperAdmin && !hasPermission('locations', 'view')) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-black">
          <Lock size={22} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-black mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 max-w-md">
          You do not have permission to view inventory locations.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Locations</h1>
          <p className="text-gray-500 text-sm">
            Showrooms, vaults, and warehouses.
          </p>
        </div>
        {!isFormOpen && hasPermission('locations', 'add') && (
          <button
            onClick={handleOpenAdd}
            className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            <Plus size={14} />
            Add Location
          </button>
        )}
      </div>

      {deleteError && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-xl flex items-start gap-3 text-gray-900 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-gray-600" />
          <div className="flex-1">
            <span className="font-semibold">Action blocked: </span>
            {deleteError}
          </div>
          <button onClick={() => setDeleteError(null)} className="text-gray-400 hover:text-black">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Add / Edit Form Drawer/Card */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0, transform: shouldReduceMotion ? "none" : "scale(0.97) translateY(8px)" }}
            animate={{ opacity: 1, transform: shouldReduceMotion ? "none" : "scale(1) translateY(0px)" }}
            exit={{ opacity: 0, transform: shouldReduceMotion ? "none" : "scale(0.97) translateY(8px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-black">
                {editingId ? 'Edit Location' : 'New Location'}
              </h2>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
              >
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={14} className="text-gray-600" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main Vault"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Retail counter, vault safe"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Locations Table */}
      {loading ? (
        <SkeletonTable rows={4} columns={4} />
      ) : locations.length === 0 ? (
        <EmptyState
          title="No locations found"
          description="Add a showroom or vault to start tracking stock."
          action={
            hasPermission('locations', 'add') ? (
              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                <Plus size={16} />
                Add Location
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Location</th>
                <th className="px-6 py-3.5">Description</th>
                <th className="px-6 py-3.5 text-right">Stock Units</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {locations.map((loc) => {
                const stockCount = stockCounts[loc.id] || 0
                return (
                  <tr
                    key={loc.id}
                    onClick={() => setSelectedStockLocation(loc)}
                    className="hover:bg-gray-50/80 transition-[background-color] duration-100 cursor-pointer group"
                  >
                    <td className="px-6 py-4 font-medium text-black">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-gray-200/80 flex items-center justify-center text-gray-700 shrink-0 transition-[background-color]">
                          <MapPin size={15} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="group-hover:text-black font-semibold">{loc.name}</span>
                            <span className="text-[11px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              View stock &rarr;
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {loc.description || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedStockLocation(loc)
                        }}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold transition-[transform,background-color] active:scale-[0.97] ${
                          stockCount > 0
                            ? 'bg-black text-white hover:bg-black/85'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        title="Click to view stock breakdown"
                      >
                        {stockCount} units
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {hasPermission('locations', 'edit') && (
                          <button
                            onClick={() => handleEdit(loc)}
                            title="Edit"
                            className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {hasPermission('locations', 'delete') && (
                          <button
                            onClick={() => setDeleteId(loc.id)}
                            title="Delete"
                            className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Location Stock Breakdown Modal */}
      <LocationStockModal
        isOpen={!!selectedStockLocation}
        onClose={() => setSelectedStockLocation(null)}
        location={selectedStockLocation}
        products={products}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Location"
        description="Are you sure? Locations with active stock cannot be deleted."
        confirmText="Delete"
        onConfirm={executeDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  )
}
