import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import {
  ROLE_PRESETS,
  SUPER_ADMIN_PERMISSIONS,
  EMPTY_PERMISSIONS
} from '@/lib/constants/permissions'
import { AdminUser, UserPermissions, UserRole, UserStatus } from '@/lib/types'
import { getAuthenticatedCaller, hasModulePermission as hasPermission } from '@/lib/firebase/server-auth'

// Helper: Wrapper for getAuthenticatedCaller to match route expectations
async function getCaller(req: NextRequest) {
  const result = await getAuthenticatedCaller(req)
  if (!result.ok) {
    return { ok: false as const, status: result.status, error: result.error }
  }
  return {
    ok: true as const,
    ...result.caller
  }
}

/**
 * GET /api/admin/users
 * Lists all registered admin users.
 * Requires: users.view permission or super_admin.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await getCaller(req)
    if (!caller.ok) {
      return NextResponse.json({ error: caller.error }, { status: caller.status })
    }

    if (!caller.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can view and manage users' }, { status: 403 })
    }

    const snap = await adminDb.collection('admins').get()
    const users: AdminUser[] = []

    snap.forEach((doc) => {
      const data = doc.data()
      const role: UserRole = data.role || 'custom'
      // STRICT DEFAULT DENY: Missing permissions field must never fall open or load presets
      const permissions: UserPermissions =
        role === 'super_admin'
          ? SUPER_ADMIN_PERMISSIONS
          : (data.permissions || EMPTY_PERMISSIONS)

      users.push({
        id: doc.id,
        email: data.email || doc.id,
        displayName: data.displayName || data.name || data.email?.split('@')[0] || 'User',
        phoneNumber: data.phoneNumber || '',
        role,
        status: (data.status as UserStatus) || 'active',
        assignedLocationId: data.assignedLocationId || undefined,
        assignedLocationName: data.assignedLocationName || undefined,
        permissions,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        lastLoginAt: data.lastLoginAt || undefined,
        createdById: data.createdById,
        createdByEmail: data.createdByEmail
      })
    })

    users.sort((a, b) => a.displayName.localeCompare(b.displayName))

    return NextResponse.json({ users })
  } catch (err: unknown) {
    console.error('GET /api/admin/users error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to fetch users'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/admin/users
 * Creates a new user in Firebase Auth, assigns Custom Claims, and creates Firestore admin profile.
 * Requires: users.add permission or super_admin.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller(req)
    if (!caller.ok) {
      return NextResponse.json({ error: caller.error }, { status: caller.status })
    }

    if (!caller.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can create users' }, { status: 403 })
    }

    const body = await req.json()
    const {
      email,
      password,
      displayName,
      phoneNumber,
      role = 'store_manager',
      status = 'active',
      assignedLocationId,
      assignedLocationName,
      permissions
    } = body

    if (!email || !displayName) {
      return NextResponse.json({ error: 'Email and Name are mandatory' }, { status: 400 })
    }

    const cleanEmail = String(email).trim().toLowerCase()
    const cleanName = String(displayName).trim()
    const cleanPhone = phoneNumber ? String(phoneNumber).trim() : ''
    const userRole: UserRole = role

    // Prevent non-super admins from creating super admin accounts
    if (userRole === 'super_admin' && !caller.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can create Super Admin accounts' }, { status: 403 })
    }

    // Passwords must be at least 6 characters. Generate one if omitted.
    const cleanPassword = password && String(password).length >= 6
      ? String(password)
      : Math.random().toString(36).slice(-8) + 'A9!'

    // 1. Create User in Firebase Auth
    let userRecord
    try {
      userRecord = await adminAuth.createUser({
        email: cleanEmail,
        password: cleanPassword,
        displayName: cleanName,
        phoneNumber: cleanPhone && cleanPhone.startsWith('+') ? cleanPhone : undefined,
        disabled: status === 'suspended'
      })
    } catch (authErr: unknown) {
      const authMsg = authErr instanceof Error ? authErr.message : 'Firebase Auth creation failed'
      return NextResponse.json({ error: authMsg }, { status: 400 })
    }

    const resolvedPermissions: UserPermissions =
      userRole === 'super_admin'
        ? SUPER_ADMIN_PERMISSIONS
        : (permissions || EMPTY_PERMISSIONS)

    // 2. Set Custom User Claims on Firebase Auth token
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: userRole,
      status: status,
      permissions: resolvedPermissions
    })

    const now = new Date().toISOString()
    const adminDocData = {
      email: cleanEmail,
      displayName: cleanName,
      phoneNumber: cleanPhone,
      role: userRole,
      status: status,
      assignedLocationId: assignedLocationId || null,
      assignedLocationName: assignedLocationName || null,
      permissions: resolvedPermissions,
      createdAt: now,
      updatedAt: now,
      createdById: caller.callerUid,
      createdByEmail: caller.callerData.email
    }

    // 3. Create document in Firestore /admins/{uid}
    await adminDb.collection('admins').doc(userRecord.uid).set(adminDocData)

    // 4. Email a set-password link to the new user
    let emailSent = false
    try {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDmKFzBNpXXy_rNvRtdgKhv9wDGax2QEKI'
      const emailRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: cleanEmail
        })
      })
      emailSent = emailRes.ok
    } catch (emailErr) {
      console.warn('Notice: Failed to email set-password link:', emailErr)
    }

    // 5. Record Audit Log Entry with server timestamp
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'create',
      entityType: 'user',
      entityId: userRecord.uid,
      entityName: cleanName,
      description: `Created user account "${cleanName}" (${cleanEmail}) with role "${userRole}" and sent password setup link`,
      diffs: [],
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    return NextResponse.json({
      success: true,
      user: {
        id: userRecord.uid,
        ...adminDocData
      },
      emailSent,
      temporaryPassword: password ? undefined : cleanPassword
    })
  } catch (err: unknown) {
    console.error('POST /api/admin/users error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to create user'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * PUT /api/admin/users
 * Updates a user profile, modifies permissions, updates custom claims, and syncs status.
 * Requires: users.edit permission or super_admin.
 */
export async function PUT(req: NextRequest) {
  try {
    const caller = await getCaller(req)
    if (!caller.ok) {
      return NextResponse.json({ error: caller.error }, { status: caller.status })
    }

    if (!caller.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can modify users' }, { status: 403 })
    }

    const body = await req.json()
    const {
      id,
      displayName,
      phoneNumber,
      role,
      status,
      assignedLocationId,
      assignedLocationName,
      permissions,
      password
    } = body

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const targetDoc = await adminDb.collection('admins').doc(id).get()
    if (!targetDoc.exists) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 })
    }

    const currentData = targetDoc.data()!

    // Prevent non-super-admins from editing a super admin
    if (currentData.role === 'super_admin' && !caller.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can modify Super Admin accounts' }, { status: 403 })
    }

    // Prevent non-super-admins from promoting anyone to super admin
    if (role === 'super_admin' && !caller.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can promote to Super Admin' }, { status: 403 })
    }

    // Prevent self-lockout or editing own role: caller cannot change their role or suspend themselves
    if (id === caller.callerUid) {
      if (status && status !== 'active') {
        return NextResponse.json({ error: 'You cannot suspend your own account' }, { status: 400 })
      }
      if (role !== undefined && role !== currentData.role) {
        return NextResponse.json({ error: 'You cannot edit your own role' }, { status: 400 })
      }
    }

    const updatedRole: UserRole = role !== undefined ? role : currentData.role
    const updatedStatus: UserStatus = status !== undefined ? status : currentData.status
    const updatedPermissions: UserPermissions =
      updatedRole === 'super_admin'
        ? SUPER_ADMIN_PERMISSIONS
        : (permissions !== undefined ? permissions : (currentData.permissions || EMPTY_PERMISSIONS))

    // 1. Update Firebase Auth user and revoke sessions if suspended
    const isSuspended = updatedStatus === 'suspended'
    const authUpdatePayload: Record<string, unknown> = {
      disabled: isSuspended
    }
    if (displayName) authUpdatePayload.displayName = String(displayName).trim()
    if (phoneNumber !== undefined) {
      const p = String(phoneNumber).trim()
      authUpdatePayload.phoneNumber = p && p.startsWith('+') ? p : null
    }
    if (password && String(password).length >= 6) {
      authUpdatePayload.password = String(password)
    }

    try {
      await adminAuth.updateUser(id, authUpdatePayload)
    } catch (authErr) {
      console.warn('Notice: Firebase Auth record update:', authErr)
    }

    // When an account is suspended, wipe permissions to prevent any latent access
    const finalPermissions: UserPermissions = isSuspended ? EMPTY_PERMISSIONS : updatedPermissions

    // 2. Set updated Custom Claims (claim checked in Firestore security rules)
    await adminAuth.setCustomUserClaims(id, {
      role: updatedRole,
      status: updatedStatus,
      permissions: finalPermissions
    })

    // 3. Immediately revoke all refresh tokens and sessions upon suspension
    if (isSuspended) {
      try {
        await adminAuth.revokeRefreshTokens(id)
      } catch (revokeErr) {
        console.warn('Notice: Failed to revoke user refresh tokens:', revokeErr)
      }
    }

    // 3. Update Firestore Document
    const now = new Date().toISOString()
    const firestoreUpdates: Record<string, unknown> = {
      updatedAt: now
    }
    if (displayName !== undefined) firestoreUpdates.displayName = String(displayName).trim()
    if (phoneNumber !== undefined) firestoreUpdates.phoneNumber = String(phoneNumber).trim()
    if (role !== undefined) firestoreUpdates.role = updatedRole
    if (status !== undefined) firestoreUpdates.status = updatedStatus
    if (assignedLocationId !== undefined) firestoreUpdates.assignedLocationId = assignedLocationId || null
    if (assignedLocationName !== undefined) firestoreUpdates.assignedLocationName = assignedLocationName || null
    if (permissions !== undefined || role !== undefined) firestoreUpdates.permissions = updatedPermissions

    await adminDb.collection('admins').doc(id).update(firestoreUpdates)

    // 4. Record Audit Log with server timestamp
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'update',
      entityType: 'user',
      entityId: id,
      entityName: firestoreUpdates.displayName || currentData.displayName || id,
      description: `Updated user "${firestoreUpdates.displayName || currentData.displayName || id}" (Role: ${updatedRole}, Status: ${updatedStatus})`,
      diffs: [],
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    // 5. Optionally email password reset link
    let emailSent = false
    if (body.sendPasswordResetEmail && currentData.email) {
      try {
        const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDmKFzBNpXXy_rNvRtdgKhv9wDGax2QEKI'
        const emailRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: 'PASSWORD_RESET',
            email: currentData.email
          })
        })
        emailSent = emailRes.ok
      } catch (emailErr) {
        console.warn('Notice: Failed to email reset password link:', emailErr)
      }
    }

    return NextResponse.json({ success: true, emailSent })
  } catch (err: unknown) {
    console.error('PUT /api/admin/users error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to update user'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/users
 * Removes a user from Firebase Auth and Firestore.
 * Requires: users.delete permission or super_admin.
 */
export async function DELETE(req: NextRequest) {
  try {
    const caller = await getCaller(req)
    if (!caller.ok) {
      return NextResponse.json({ error: caller.error }, { status: caller.status })
    }

    if (!caller.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can delete users' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const idFromQuery = searchParams.get('id')
    let id = idFromQuery

    if (!id) {
      const body = await req.json().catch(() => ({}))
      id = body?.id
    }

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Caller cannot delete their own account
    if (id === caller.callerUid) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
    }

    const targetDoc = await adminDb.collection('admins').doc(id).get()
    if (!targetDoc.exists) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 })
    }

    const targetData = targetDoc.data()!

    // Prevent non-super-admins from deleting a super admin
    if (targetData.role === 'super_admin' && !caller.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can delete Super Admin accounts' }, { status: 403 })
    }

    // Prevent deleting the very last super admin in the system
    if (targetData.role === 'super_admin') {
      const superAdminsSnap = await adminDb.collection('admins').where('role', '==', 'super_admin').get()
      if (superAdminsSnap.size <= 1) {
        return NextResponse.json({ error: 'Cannot delete the only remaining Super Admin account' }, { status: 400 })
      }
    }

    // 1. Revoke all active sessions and delete from Firebase Auth
    try {
      await adminAuth.revokeRefreshTokens(id)
      await adminAuth.deleteUser(id)
    } catch (authErr) {
      console.warn('Notice: Firebase Auth record deletion:', authErr)
    }

    // 2. Delete from Firestore
    await adminDb.collection('admins').doc(id).delete()

    // 3. Record Audit Log with server timestamp
    await adminDb.collection('audit_logs').add({
      userId: caller.callerUid,
      userName: caller.callerName,
      userEmail: caller.callerEmail,
      action: 'delete',
      entityType: 'user',
      entityId: id,
      entityName: targetData.displayName || targetData.email || id,
      description: `Deleted user account "${targetData.displayName || targetData.email || id}"`,
      diffs: [],
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('DELETE /api/admin/users error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to delete user'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
