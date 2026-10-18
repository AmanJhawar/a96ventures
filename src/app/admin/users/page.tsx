"use client"

import { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  AlertCircle,
  X,
  Check,
  ShieldCheck,
  ShieldAlert,
  History,
  Users,
  Search,
  Filter,
  ArrowRight,
  UserCheck,
  Clock,
  MapPin,
  Lock,
  Unlock,
  AlertTriangle
} from 'lucide-react'
import { AdminUser, UserRole, UserStatus, UserPermissions, AuditLogEntry, Location } from '@/lib/types'
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  updateUserStatus
} from '@/lib/services/users.service'
import { getAuditLogs } from '@/lib/services/audit.service'
import { getLocations } from '@/lib/services/inventory.service'
import {
  ROLE_PRESETS,
  ROLE_LABELS,
  SUPER_ADMIN_PERMISSIONS,
  STORE_MANAGER_PERMISSIONS,
  SALES_CASHIER_PERMISSIONS,
  VAULT_CUSTODIAN_PERMISSIONS,
  EMPTY_PERMISSIONS
} from '@/lib/constants/permissions'
import { usePermissions } from '@/lib/context/PermissionsContext'
import { ConfirmModal } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import CustomSelect, { SelectOption } from '@/components/custom-select'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { EASE_OUT } from '@/components/motion-transitions'

type UsersTab = 'directory' | 'audit'

export default function AdminUsersPage() {
  const { adminUser: currentLoggedUser, isSuperAdmin } = usePermissions()

  // Primary Data State
  const [users, setUsers] = useState<AdminUser[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<UsersTab>('directory')

  // Filter States - Directory
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<'All' | UserRole>('All')

  // Filter States - Audit
  const [auditSearch, setAuditSearch] = useState('')
  const [auditEntityFilter, setAuditEntityFilter] = useState<string>('all')
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all')

  // Form Drawer State
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [formDisplayName, setFormDisplayName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('store_manager')
  const [formStatus, setFormStatus] = useState<UserStatus>('active')
  const [formLocationId, setFormLocationId] = useState('')
  const [formPermissions, setFormPermissions] = useState<UserPermissions>(ROLE_PRESETS.store_manager)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null)

  // Load All Data
  const loadData = async () => {
    try {
      setLoading(true)
      const [uList, aList, locList] = await Promise.all([
        getAdminUsers(),
        getAuditLogs({ limitCount: 200 }),
        getLocations()
      ])
      setUsers(uList)
      setAuditLogs(aList)
      setLocations(locList)
    } catch (err) {
      console.error('Failed to load users data:', err)
      toast.error('Unable to load operators data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Location Map
  const locationMap = useMemo(() => {
    const map = new Map<string, string>()
    locations.forEach((l) => map.set(l.id, l.name))
    return map
  }, [locations])

  const locationOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'All Stores & Vaults (Unrestricted)' },
      ...locations.map((l) => ({ value: l.id, label: l.name }))
    ]
  }, [locations])

  // Filtered Users
  const filteredUsers = useMemo(() => {
    if (selectedRoleFilter === 'All') return users
    return users.filter((u) => u.role === selectedRoleFilter)
  }, [users, selectedRoleFilter])

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((entry) => {
      const matchSearch =
        auditSearch === '' ||
        entry.description.toLowerCase().includes(auditSearch.toLowerCase()) ||
        entry.userName.toLowerCase().includes(auditSearch.toLowerCase()) ||
        (entry.entityName && entry.entityName.toLowerCase().includes(auditSearch.toLowerCase()))

      const matchEntity = auditEntityFilter === 'all' || entry.entityType === auditEntityFilter
      const matchAction = auditActionFilter === 'all' || entry.action === auditActionFilter

      return matchSearch && matchEntity && matchAction
    })
  }, [auditLogs, auditSearch, auditEntityFilter, auditActionFilter])

  // Handle Opening Form for Add
  const handleOpenAdd = () => {
    setEditingUserId(null)
    setFormDisplayName('')
    setFormEmail('')
    setFormPhone('')
    setFormPassword('')
    setFormRole('store_manager')
    setFormStatus('active')
    setFormLocationId('')
    setFormPermissions(ROLE_PRESETS.store_manager)
    setFormError(null)
    setIsFormOpen(true)
  }

  // Handle Opening Form for Edit
  const handleOpenEdit = (user: AdminUser) => {
    setEditingUserId(user.id)
    setFormDisplayName(user.displayName)
    setFormEmail(user.email)
    setFormPhone(user.phoneNumber || '')
    setFormPassword('')
    setFormRole(user.role)
    setFormStatus(user.status)
    setFormLocationId(user.assignedLocationId || '')
    setFormPermissions(user.permissions || (user.role === 'super_admin' ? SUPER_ADMIN_PERMISSIONS : EMPTY_PERMISSIONS))
    setFormError(null)
    setIsFormOpen(true)
  }

  // Preset Selection Handler
  const handleSelectRolePreset = (role: UserRole) => {
    setFormRole(role)
    if (role === 'super_admin') {
      setFormPermissions(SUPER_ADMIN_PERMISSIONS)
    } else if (role === 'store_manager') {
      setFormPermissions(STORE_MANAGER_PERMISSIONS)
    } else if (role === 'sales_cashier') {
      setFormPermissions(SALES_CASHIER_PERMISSIONS)
    } else if (role === 'vault_custodian') {
      setFormPermissions(VAULT_CUSTODIAN_PERMISSIONS)
    }
  }

  // Generic Granular Permission Toggle
  const togglePermission = (module: keyof UserPermissions, actionKey: string) => {
    setFormRole('custom') // Mark as custom if manually toggled
    setFormPermissions((prev) => {
      const currentModule = { ...((prev[module] as Record<string, boolean>) || {}) }
      const currentVal = Boolean(currentModule[actionKey])
      const newVal = !currentVal

      // Dependency Rule: If turning off 'view', turn off all sub-actions in this module
      if (actionKey === 'view' && !newVal) {
        Object.keys(currentModule).forEach((k) => {
          currentModule[k] = false
        })
      } else {
        currentModule[actionKey] = newVal
        // If enabling an action, make sure view is enabled
        if (newVal) {
          currentModule['view'] = true
        }
      }

      return {
        ...prev,
        [module]: currentModule
      }
    })
  }

  // Form Submit Handler
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formEmail.trim() || !formDisplayName.trim()) {
      setFormError('Name and email are mandatory')
      return
    }

    setFormSubmitting(true)
    setFormError(null)

    try {
      const locName = formLocationId ? locationMap.get(formLocationId) : undefined
      const actorInfo = {
        id: currentLoggedUser?.id || 'admin',
        email: currentLoggedUser?.email || 'admin@a96ventures.com'
      }

      if (editingUserId) {
        await updateAdminUser(
          editingUserId,
          {
            displayName: formDisplayName,
            phoneNumber: formPhone,
            role: formRole,
            status: formStatus,
            assignedLocationId: formLocationId || undefined,
            assignedLocationName: locName,
            permissions: formPermissions,
            ...(formPassword.trim() ? { password: formPassword.trim() } : {})
          },
          actorInfo
        )
        toast.success('Operator updated successfully')
      } else {
        const createResult = await createAdminUser({
          email: formEmail,
          password: formPassword.trim() || undefined,
          displayName: formDisplayName,
          phoneNumber: formPhone,
          role: formRole,
          status: formStatus,
          assignedLocationId: formLocationId || undefined,
          assignedLocationName: locName,
          permissions: formPermissions,
          createdById: actorInfo.id,
          createdByEmail: actorInfo.email
        })

        if (createResult.temporaryPassword) {
          toast.success(`Operator created! Initial password: ${createResult.temporaryPassword}`, {
            duration: 10000
          })
        } else {
          toast.success('New operator created successfully')
        }
      }

      setIsFormOpen(false)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save operator'
      setFormError(msg)
      toast.error(msg)
    } finally {
      setFormSubmitting(false)
    }
  }

  // Execute Delete
  const executeDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteAdminUser(deleteTarget.id, {
        id: currentLoggedUser?.id || 'admin',
        email: currentLoggedUser?.email || 'admin@a96ventures.com'
      })
      toast.success('Operator deleted')
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete operator')
    }
  }

  // Execute Status Toggle
  const executeToggleStatus = async () => {
    if (!statusTarget) return
    const newStatus: UserStatus = statusTarget.status === 'active' ? 'suspended' : 'active'
    try {
      await updateUserStatus(statusTarget.id, newStatus, {
        id: currentLoggedUser?.id || 'admin',
        email: currentLoggedUser?.email || 'admin@a96ventures.com'
      })
      toast.success(newStatus === 'active' ? 'Account activated' : 'Account suspended')
      setStatusTarget(null)
      await loadData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to change status')
    }
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-1">Users & Access Control</h1>
          <p className="text-gray-500 text-sm">
            Manage store operators, granular subsection permissions, and audit activity streams.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97] shrink-0"
        >
          <Plus size={14} />
          Add Operator
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 mb-6 overflow-x-auto">
        <button
          onClick={() => {
            setActiveTab('directory')
            setIsFormOpen(false)
          }}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'directory'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
            }`}
        >
          <Users size={16} />
          Staff & Operators ({users.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('audit')
            setIsFormOpen(false)
          }}
          className={`pb-3 px-4 text-sm font-semibold transition-[color,border-color] duration-150 border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${activeTab === 'audit'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
            }`}
        >
          <History size={16} />
          Audit Trail & Activity Log ({auditLogs.length})
        </button>
      </div>

      {/* Tab 1: Directory */}
      {activeTab === 'directory' && (
        <div className="space-y-6">
          {/* Role Filter Squircles */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Role:</span>
            {(['All', 'super_admin', 'store_manager', 'sales_cashier', 'vault_custodian', 'custom'] as const).map(
              (r) => {
                const label = r === 'All' ? 'All Operators' : ROLE_LABELS[r]?.label || r
                const isActive = selectedRoleFilter === r
                return (
                  <button
                    key={r}
                    onClick={() => setSelectedRoleFilter(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${isActive
                        ? 'bg-black text-white border border-black shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                      }`}
                  >
                    {label}
                  </button>
                )
              }
            )}
          </div>

          {/* User Form Drawer/Card */}
          <AnimatePresence>
            {isFormOpen && (
              <motion.div
                initial={{ opacity: 0, transform: 'scale(0.97) translateY(8px)' }}
                animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
                exit={{ opacity: 0, transform: 'scale(0.97) translateY(8px)' }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm mb-8"
              >
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-semibold text-black">
                      {editingUserId ? `Edit Operator: ${formDisplayName}` : 'Add New Operator Account'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Configure profile credentials, default location restrictions, and granular action permissions.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsFormOpen(false)}
                    className="text-gray-400 hover:text-black transition-[color,transform] active:scale-[0.97]"
                  >
                    <X size={18} />
                  </button>
                </div>

                {formError && (
                  <div className="mb-4 p-3 bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg flex items-center gap-2">
                    <AlertCircle size={14} className="text-gray-600" />
                    {formError}
                  </div>
                )}

                <form onSubmit={handleSaveUser} className="space-y-6">
                  {/* Basic Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Rahul Sharma"
                        value={formDisplayName}
                        onChange={(e) => setFormDisplayName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        placeholder="e.g. rahul@a96ventures.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        disabled={!!editingUserId}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black disabled:bg-gray-50 disabled:text-gray-500 transition-[border-color] duration-150"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        {editingUserId ? 'Reset Password (Optional)' : 'Initial Password (Optional)'}
                      </label>
                      <input
                        type="text"
                        placeholder={editingUserId ? 'Leave blank to keep existing' : 'Auto-generated if blank'}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Phone Number (Optional)
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. +91 98765 43210"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
                      />
                    </div>

                    <div className="md:col-span-2 lg:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Assigned Location Scope
                      </label>
                      <CustomSelect
                        value={formLocationId}
                        onValueChange={setFormLocationId}
                        options={locationOptions}
                        placeholder="Select location..."
                      />
                    </div>
                  </div>

                  {/* Role Presets Selector */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-2">
                      Role Preset (Auto-configures permission flags below)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {(['super_admin', 'store_manager', 'sales_cashier', 'vault_custodian', 'custom'] as UserRole[]).map(
                        (roleKey) => {
                          const info = ROLE_LABELS[roleKey]
                          const isSelected = formRole === roleKey
                          return (
                            <button
                              key={roleKey}
                              type="button"
                              onClick={() => handleSelectRolePreset(roleKey)}
                              className={`p-3 text-left rounded-lg border text-xs transition-[border-color,background-color,transform] duration-150 active:scale-[0.97] ${isSelected
                                  ? 'border-black bg-gray-50 ring-1 ring-black'
                                  : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                                }`}
                            >
                              <div className="font-semibold text-black">{info.label}</div>
                              <div className="text-[11px] text-gray-400 mt-1 line-clamp-2">{info.description}</div>
                            </button>
                          )
                        }
                      )}
                    </div>
                  </div>

                  {/* Granular Permission Matrix */}
                  <div className="space-y-4 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-black">
                        Granular Action Permissions
                      </h3>
                      <span className="text-[11px] text-gray-400">
                        {formRole === 'custom' ? 'Customized individually' : `Preset: ${ROLE_LABELS[formRole]?.label}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Products */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-black">Product Catalog</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Inventory</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {(['view', 'add', 'edit', 'delete'] as const).map((act) => (
                            <button
                              key={act}
                              type="button"
                              onClick={() => togglePermission('products', act)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${formPermissions.products[act]
                                  ? 'bg-black text-white border-black'
                                  : 'bg-white text-gray-500 border-gray-200 hover:text-black'
                                }`}
                            >
                              {act}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Purchases */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-black">Purchases</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Inflow</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {(['view', 'add', 'delete'] as const).map((act) => (
                            <button
                              key={act}
                              type="button"
                              onClick={() => togglePermission('purchases', act)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${formPermissions.purchases[act]
                                  ? 'bg-black text-white border-black'
                                  : 'bg-white text-gray-500 border-gray-200 hover:text-black'
                                }`}
                            >
                              {act === 'delete' ? 'reverse' : act}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Stock Movements */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-black">Stock Movements</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Operations</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {(['view', 'transfer', 'adjustment', 'repair', 'melt', 'delete'] as const).map((act) => (
                            <button
                              key={act}
                              type="button"
                              onClick={() => togglePermission('movements', act)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${formPermissions.movements[act]
                                  ? 'bg-black text-white border-black'
                                  : 'bg-white text-gray-500 border-gray-200 hover:text-black'
                                }`}
                            >
                              {act === 'delete' ? 'reverse' : act}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sales & Billing */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-black">Sales & Invoices</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Revenue</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {(['view', 'add', 'delete'] as const).map((act) => (
                            <button
                              key={act}
                              type="button"
                              onClick={() => togglePermission('sales', act)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${formPermissions.sales[act]
                                  ? 'bg-black text-white border-black'
                                  : 'bg-white text-gray-500 border-gray-200 hover:text-black'
                                }`}
                            >
                              {act === 'delete' ? 'void' : act}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Returns */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-black">Customer Returns</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Refunds</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {(['view', 'add', 'delete'] as const).map((act) => (
                            <button
                              key={act}
                              type="button"
                              onClick={() => togglePermission('returns', act)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${formPermissions.returns[act]
                                  ? 'bg-black text-white border-black'
                                  : 'bg-white text-gray-500 border-gray-200 hover:text-black'
                                }`}
                            >
                              {act === 'delete' ? 'reverse' : act}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Reports & Compliance */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-black">Reports & Analytics</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Financials</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(['view', 'export'] as const).map((act) => (
                            <button
                              key={act}
                              type="button"
                              onClick={() => togglePermission('reports', act)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${formPermissions.reports[act]
                                  ? 'bg-black text-white border-black'
                                  : 'bg-white text-gray-500 border-gray-200 hover:text-black'
                                }`}
                            >
                              {act}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Master Zero Balance & Users */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-black">Archive & Access Control</span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Admin</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => togglePermission('archive', 'zeroBalance')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${formPermissions.archive.zeroBalance
                                ? 'bg-black text-white border-black'
                                : 'bg-white text-gray-500 border-gray-200 hover:text-black'
                              }`}
                          >
                            Zero Balance
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePermission('users', 'edit')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${formPermissions.users.edit
                                ? 'bg-black text-white border-black'
                                : 'bg-white text-gray-500 border-gray-200 hover:text-black'
                              }`}
                          >
                            Manage Users
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={formSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                    >
                      <Check size={16} />
                      {formSubmitting ? 'Saving...' : editingUserId ? 'Update Operator' : 'Create Operator'}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Users Table */}
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              title="No operators found"
              description="Add your first operator account to delegate store operations with granular permissions."
              action={
                <button
                  onClick={handleOpenAdd}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  <Plus size={16} />
                  Add Operator
                </button>
              }
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Operator</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Location Scope</th>
                      <th className="px-6 py-3.5">Permissions Summary</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.map((user) => {
                      const isCurrentUser = user.id === currentLoggedUser?.id
                      const roleMeta = ROLE_LABELS[user.role] || { label: user.role }

                      return (
                        <tr key={user.id} className="hover:bg-gray-50/70 transition-[background-color] duration-100">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs uppercase">
                                {user.displayName.charAt(0)}
                              </div>
                              <div>
                                <div className="font-semibold text-black flex items-center gap-1.5">
                                  {user.displayName}
                                  {isCurrentUser && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 font-mono">{user.email}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className="inline-flex px-2.5 py-0.5 rounded-lg text-xs font-medium border border-gray-200 bg-gray-50 text-gray-800">
                              {roleMeta.label}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-xs text-gray-600">
                            {user.assignedLocationId && locationMap.has(user.assignedLocationId) ? (
                              <span className="inline-flex items-center gap-1 font-medium text-black">
                                <MapPin size={12} className="text-gray-400" />
                                {locationMap.get(user.assignedLocationId)}
                              </span>
                            ) : (
                              <span className="text-gray-400">All Stores (Global)</span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
                            {user.role === 'super_admin' ? (
                              <span className="font-medium text-black">Unrestricted Master Access</span>
                            ) : (
                              <span>
                                {user.permissions?.products?.add ? 'Products · ' : ''}
                                {user.permissions?.sales?.add ? 'Sales · ' : ''}
                                {user.permissions?.movements?.transfer ? 'Transfers · ' : ''}
                                {user.permissions?.purchases?.add ? 'Purchases · ' : ''}
                                {user.permissions?.reports?.export ? 'Exports' : ''}
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${user.status === 'active'
                                  ? 'bg-black text-white'
                                  : 'bg-white text-gray-500 border border-gray-200'
                                }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-white' : 'bg-gray-400'
                                  }`}
                              />
                              {user.status === 'active' ? 'Active' : 'Suspended'}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(user)}
                                title="Edit permissions and profile"
                                className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                              >
                                <Edit2 size={15} />
                              </button>

                              {!isCurrentUser && (
                                <>
                                  <button
                                    onClick={() => setStatusTarget(user)}
                                    title={user.status === 'active' ? 'Suspend account' : 'Reactivate account'}
                                    className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                                  >
                                    {user.status === 'active' ? <Lock size={15} /> : <Unlock size={15} />}
                                  </button>

                                  <button
                                    onClick={() => setDeleteTarget(user)}
                                    title="Delete account"
                                    className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-[color,background-color,transform] duration-150 active:scale-[0.97]"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Audit Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search audit narrative, operator, or entity..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-[border-color] duration-150"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">Entity:</span>
              {(['all', 'product', 'sale', 'movement', 'purchase', 'user', 'archive'] as const).map((ent) => (
                <button
                  key={ent}
                  onClick={() => setAuditEntityFilter(ent)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${auditEntityFilter === ent
                      ? 'bg-black text-white border border-black shadow-xs'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                >
                  {ent}
                </button>
              ))}
            </div>
          </div>

          {/* Audit Logs List */}
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
            </div>
          ) : filteredAuditLogs.length === 0 ? (
            <EmptyState
              title="No audit entries found"
              description="All mutations across inventory, movements, sales, and user roles are automatically logged here."
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
              {filteredAuditLogs.map((log) => {
                const dateObj = new Date(log.timestamp)
                const dateStr = dateObj.toLocaleDateString()
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

                return (
                  <div key={log.id} className="p-4 sm:p-5 hover:bg-gray-50/70 transition-[background-color] duration-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-black">{log.userName}</span>
                        <span className="text-xs text-gray-400 font-mono">({log.userEmail})</span>
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-700">
                          {log.action}
                        </span>
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium border border-gray-200 bg-white text-gray-600 capitalize">
                          {log.entityType}
                        </span>
                      </div>

                      <div className="text-xs text-gray-400 font-mono shrink-0">
                        {dateStr} · {timeStr}
                      </div>
                    </div>

                    <p className="text-sm text-gray-800 font-medium">{log.description}</p>

                    {log.locationName && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <MapPin size={12} />
                        <span>{log.locationName}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete User Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Operator Account"
        description={`Are you sure you want to delete ${deleteTarget?.displayName} (${deleteTarget?.email})? They will immediately lose access to the admin dashboard.`}
        confirmText="Delete Account"
        onConfirm={executeDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Status Toggle Modal */}
      <ConfirmModal
        isOpen={!!statusTarget}
        title={statusTarget?.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
        description={
          statusTarget?.status === 'active'
            ? `Suspending ${statusTarget?.displayName} will immediately block them from logging in or mutating any records.`
            : `Reactivating ${statusTarget?.displayName} will restore their dashboard privileges.`
        }
        confirmText={statusTarget?.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
        onConfirm={executeToggleStatus}
        onClose={() => setStatusTarget(null)}
      />
    </div>
  )
}
