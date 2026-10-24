/**
 * CRM Permissions Migration Utility
 * 
 * Staff accounts created before the CRM introduction are missing the `customers`
 * and `visits` permission blocks. Consequently, they cannot see the Customers navigation
 * or link customers to sales bills.
 * 
 * Rules:
 * - Non-custom roles (super_admin, store_manager, sales_cashier, vault_custodian):
 *   Injects role-preset `customers` and `visits` permission blocks.
 * - Custom roles (custom):
 *   Injects all-false `customers` and `visits` permission blocks and lists them
 *   prominently for Super Admin review.
 * - Re-syncs Firebase Auth Custom Claims (`role`, `status`, `perms` short-codes)
 *   matching the exact code path of PUT /api/admin/users.
 * - Dry-run by default. Pass `--commit` to apply updates to Firebase Auth and Firestore.
 * 
 * Usage:
 *   node scripts/migrate-crm-permissions.mjs
 *   node --env-file=.env.local scripts/migrate-crm-permissions.mjs --commit
 */

import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// ============================================================================
// Permission Definitions & Presets (Mirrors src/lib/constants/permissions.ts)
// ============================================================================

export const EMPTY_CUSTOMERS_PERMISSIONS = {
  view: false,
  add: false,
  edit: false,
  delete: false,
  export: false,
  viewPan: false,
  editPan: false
}

export const EMPTY_VISITS_PERMISSIONS = {
  view: false,
  add: false,
  edit: false,
  delete: false
}

export const CRM_ROLE_PRESETS = {
  super_admin: {
    customers: {
      view: true,
      add: true,
      edit: true,
      delete: true,
      export: true,
      viewPan: true,
      editPan: true
    },
    visits: {
      view: true,
      add: true,
      edit: true,
      delete: true
    }
  },
  store_manager: {
    customers: {
      view: true,
      add: true,
      edit: true,
      delete: false,
      export: false,
      viewPan: true,
      editPan: true
    },
    visits: {
      view: true,
      add: true,
      edit: true,
      delete: false
    }
  },
  sales_cashier: {
    customers: {
      view: true,
      add: true,
      edit: false,
      delete: false,
      export: false,
      viewPan: false,
      editPan: true
    },
    visits: {
      view: true,
      add: true,
      edit: true,
      delete: false
    }
  },
  vault_custodian: {
    customers: {
      view: false,
      add: false,
      edit: false,
      delete: false,
      export: false,
      viewPan: false,
      editPan: false
    },
    visits: {
      view: false,
      add: false,
      edit: false,
      delete: false
    }
  },
  custom: {
    customers: { ...EMPTY_CUSTOMERS_PERMISSIONS },
    visits: { ...EMPTY_VISITS_PERMISSIONS }
  }
}

export const MODULE_SHORT_CODES = {
  products: 'prd',
  purchases: 'pur',
  movements: 'mov',
  sales: 'sal',
  returns: 'ret',
  inquiries: 'inq',
  locations: 'loc',
  brands: 'brd',
  team: 'tem',
  portfolio: 'prt',
  reports: 'rep',
  archive: 'arc',
  users: 'usr',
  customers: 'cus',
  visits: 'vis'
}

export const ACTION_SHORT_CODES = {
  view: 'v',
  add: 'a',
  edit: 'e',
  delete: 'd',
  transfer: 't',
  adjustment: 'j',
  repair: 'r',
  melt: 'm',
  export: 'x',
  zeroBalance: 'z',
  uploadArchive: 'u',
  viewPan: 'p',
  editPan: 'k'
}

/**
 * Compresses UserPermissions to an array of short codes for granted permissions only.
 * Identical to permissionsToShortCodes in src/lib/constants/permissions.ts.
 */
export function permissionsToShortCodes(permissions) {
  const codes = []
  if (!permissions || typeof permissions !== 'object') return codes

  for (const [moduleKey, actions] of Object.entries(permissions)) {
    const modCode = MODULE_SHORT_CODES[moduleKey] || moduleKey
    if (actions && typeof actions === 'object') {
      for (const [actionKey, isGranted] of Object.entries(actions)) {
        if (isGranted === true) {
          const actCode = ACTION_SHORT_CODES[actionKey] || actionKey
          codes.push(`${modCode}:${actCode}`)
        }
      }
    }
  }
  return codes
}

/**
 * Evaluates an admin user record and returns their updated permissions
 * with customers and visits blocks populated.
 */
export function computeAdminCrmPermissions(admin) {
  const role = admin.role || 'sales_cashier'
  const isCustom = role === 'custom'
  const currentPermissions = admin.permissions || {}

  const hasCustomers = Boolean(currentPermissions.customers && typeof currentPermissions.customers === 'object')
  const hasVisits = Boolean(currentPermissions.visits && typeof currentPermissions.visits === 'object')

  // Check if any CRM module is missing
  const needsMigration = !hasCustomers || !hasVisits

  const rolePreset = CRM_ROLE_PRESETS[role] || CRM_ROLE_PRESETS.sales_cashier

  const updatedCustomers = hasCustomers
    ? { ...rolePreset.customers, ...currentPermissions.customers }
    : { ...rolePreset.customers }

  const updatedVisits = hasVisits
    ? { ...rolePreset.visits, ...currentPermissions.visits }
    : { ...rolePreset.visits }

  const updatedPermissions = {
    ...currentPermissions,
    customers: updatedCustomers,
    visits: updatedVisits
  }

  return {
    needsMigration,
    isCustom,
    updatedPermissions
  }
}

// ============================================================================
// Main Script Logic
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const isCommit = args.includes('--commit')

  console.log('='.repeat(70))
  console.log(' A96 CRM Permissions Migration Utility')
  console.log('='.repeat(70))
  console.log(`Execution Mode: ${isCommit ? 'COMMIT (Writing to Auth & Firestore)' : 'DRY-RUN (Default - No writes)'}`)
  if (!isCommit) {
    console.log('Pass "--commit" to apply changes to database and auth claims.\n')
  } else {
    console.log('Applying changes directly to Firebase Auth & Firestore...\n')
  }

  // Initialize Firebase Admin
  const projectId = process.env.FIREBASE_PROJECT_ID || 'a96ventures-979e6'
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  let app
  if (getApps().length > 0) {
    app = getApps()[0]
  } else if (clientEmail && privateKey) {
    app = initializeApp({
      projectId,
      credential: cert({ projectId, clientEmail, privateKey })
    })
  } else {
    app = initializeApp({ projectId, credential: applicationDefault() })
  }

  const db = getFirestore(app)
  const auth = getAuth(app)

  console.log('Fetching all admin accounts from Firestore...')
  const adminsSnap = await db.collection('admins').get()
  console.log(`Loaded ${adminsSnap.docs.length} admin account(s).\n`)

  const updates = []
  const customRoleUsersToReview = []

  for (const doc of adminsSnap.docs) {
    const admin = doc.data()
    const id = doc.id
    const { needsMigration, isCustom, updatedPermissions } = computeAdminCrmPermissions(admin)

    if (isCustom) {
      customRoleUsersToReview.push({
        id,
        email: admin.email || '(No email)',
        displayName: admin.displayName || '(No display name)',
        role: admin.role,
        status: admin.status || 'active',
        needsMigration
      })
    }

    if (needsMigration) {
      const isSuspended = admin.status === 'suspended'
      const finalPermissions = isSuspended ? {} : updatedPermissions
      const oldCodes = permissionsToShortCodes(admin.permissions || {})
      const newCodes = permissionsToShortCodes(finalPermissions)

      updates.push({
        id,
        email: admin.email || id,
        displayName: admin.displayName || id,
        role: admin.role || 'sales_cashier',
        status: admin.status || 'active',
        isCustom,
        updatedPermissions,
        claimsPayload: {
          role: admin.role || 'sales_cashier',
          status: admin.status || 'active',
          perms: newCodes
        },
        oldCodesCount: oldCodes.length,
        newCodesCount: newCodes.length
      })
    }
  }

  console.log(`Analysis Result: ${updates.length} of ${adminsSnap.docs.length} admin account(s) require CRM permissions migration.\n`)

  if (updates.length > 0) {
    console.log('Accounts to be updated:')
    for (const u of updates) {
      console.log(`- [${u.id}] ${u.displayName} (${u.email})`)
      console.log(`    Role: ${u.role} | Status: ${u.status} | Short-codes: ${u.oldCodesCount} -> ${u.newCodesCount}`)
      console.log(`    Customers: ${JSON.stringify(u.updatedPermissions.customers)}`)
      console.log(`    Visits:    ${JSON.stringify(u.updatedPermissions.visits)}`)
    }
    console.log('')
  }

  // Highlight custom-role users for Super Admin review
  if (customRoleUsersToReview.length > 0) {
    console.log('!'.repeat(70))
    console.log(' ATTENTION: CUSTOM-ROLE USERS REQUIRING SUPER ADMIN REVIEW')
    console.log('!'.repeat(70))
    console.log('The following users have a "custom" role. Their CRM blocks were populated')
    console.log('with all permissions set to false by default. A Super Admin must review')
    console.log('their profile in /admin/users to grant specific customer or visit access:\n')

    for (const cu of customRoleUsersToReview) {
      console.log(`  * User ID:      ${cu.id}`)
      console.log(`    Display Name: ${cu.displayName}`)
      console.log(`    Email:        ${cu.email}`)
      console.log(`    Status:       ${cu.status}`)
      console.log(`    Migrated:     ${cu.needsMigration ? 'Yes (blocks injected)' : 'Already had blocks'}`)
      console.log('    --------------------------------------------------------------')
    }
    console.log('')
  } else {
    console.log('No custom-role user accounts found.\n')
  }

  if (!isCommit) {
    console.log('[DRY RUN COMPLETE] No changes were written to Firebase Auth or Firestore.')
    console.log('To apply these changes, run the script with --commit:')
    console.log('  node --env-file=.env.local scripts/migrate-crm-permissions.mjs --commit')
    return
  }

  // Commit changes
  console.log('Applying updates to Firebase Auth Custom Claims and Firestore...')
  const now = new Date().toISOString()
  let successCount = 0
  let errorCount = 0

  for (const u of updates) {
    try {
      // 1. Sync custom user claims matching PUT /api/admin/users
      await auth.setCustomUserClaims(u.id, u.claimsPayload)

      // 2. Update Firestore document
      await db.collection('admins').doc(u.id).update({
        permissions: u.updatedPermissions,
        updatedAt: now
      })

      // 3. Audit log
      await db.collection('audit_logs').add({
        userId: 'system_migration',
        userName: 'CRM Permissions Migration Script',
        userEmail: 'system@a96ventures.com',
        action: 'update',
        entityType: 'user',
        entityId: u.id,
        entityName: u.displayName,
        description: `Migrated CRM permissions (customers and visits) for ${u.displayName}`,
        timestamp: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      })

      successCount++
      console.log(`✔ Updated user [${u.id}] ${u.displayName}`)
    } catch (err) {
      errorCount++
      console.error(`✖ Failed to update user [${u.id}] ${u.displayName}:`, err.message)
    }
  }

  console.log(`\n[SUCCESS] Successfully migrated ${successCount} user(s). Errors: ${errorCount}.`)
}

// Execute if run directly from CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error during migrate-crm-permissions execution:', err)
    process.exit(1)
  })
}
