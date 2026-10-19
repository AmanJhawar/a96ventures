import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import * as fs from 'fs'
import * as path from 'path'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'

const PROJECT_ID = 'demo-a96ventures-rules'
const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8')

// If running in CI or with emulator running, test against emulator
const isEmulatorActive = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

describe.runIf(isEmulatorActive)('Firestore Security Rules (with Emulator)', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: rulesContent,
        host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
        port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080)
      }
    })
  })

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup()
    }
  })

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore()
    }
  })

  describe('Audit Logs Security Rules', () => {
    it('denies all client writes to /audit_logs even if authenticated as super_admin', async () => {
      const superAdminContext = testEnv.authenticatedContext('super_admin_1', {
        role: 'super_admin'
      })
      const db = superAdminContext.firestore()

      await assertFails(
        setDoc(doc(db, 'audit_logs', 'fake_log_1'), {
          action: 'spoofed_audit_entry',
          timestamp: new Date().toISOString()
        })
      )
    })

    it('denies client writes to /audit_logs from normal staff members', async () => {
      const staffContext = testEnv.authenticatedContext('staff_1', {
        role: 'staff',
        perms: ['aud:v', 'aud:e']
      })
      const db = staffContext.firestore()

      await assertFails(
        setDoc(doc(db, 'audit_logs', 'spoofed_log'), {
          action: 'unauthorized_audit_entry'
        })
      )
    })

    it('denies client writes to /audit_logs from unauthenticated users', async () => {
      const unauthContext = testEnv.unauthenticatedContext()
      const db = unauthContext.firestore()

      await assertFails(
        setDoc(doc(db, 'audit_logs', 'unauth_log'), {
          action: 'unauth_entry'
        })
      )
    })

    it('allows super_admin to read /audit_logs', async () => {
      // Setup data using admin context
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'audit_logs', 'log_1'), {
          action: 'product_create',
          description: 'Created product'
        })
      })

      const superAdminContext = testEnv.authenticatedContext('super_admin_1', {
        role: 'super_admin'
      })
      const db = superAdminContext.firestore()

      await assertSucceeds(getDoc(doc(db, 'audit_logs', 'log_1')))
    })

    it('allows user with aud:v short code permission to read /audit_logs', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'audit_logs', 'log_1'), {
          action: 'product_create'
        })
      })

      const auditorContext = testEnv.authenticatedContext('auditor_1', {
        role: 'auditor',
        perms: ['aud:v']
      })
      const db = auditorContext.firestore()

      await assertSucceeds(getDoc(doc(db, 'audit_logs', 'log_1')))
    })

    it('denies user without audit permission from reading /audit_logs', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'audit_logs', 'log_1'), {
          action: 'product_create'
        })
      })

      const staffContext = testEnv.authenticatedContext('staff_1', {
        role: 'staff',
        perms: ['prd:v', 'sal:v'] // no aud:v
      })
      const db = staffContext.firestore()

      await assertFails(getDoc(doc(db, 'audit_logs', 'log_1')))
    })
  })

  describe('Admins Collection Security Rules', () => {
    it('strictly denies all direct client writes to /admins', async () => {
      const userContext = testEnv.authenticatedContext('user_1', {
        role: 'super_admin'
      })
      const db = userContext.firestore()

      await assertFails(
        setDoc(doc(db, 'admins', 'user_1'), {
          role: 'super_admin',
          status: 'active'
        })
      )
    })
  })

  describe('Products & Locations Security Rules', () => {
    it('denies unauthenticated read of products', async () => {
      const unauthContext = testEnv.unauthenticatedContext()
      const db = unauthContext.firestore()

      await assertFails(getDoc(doc(db, 'products', 'prod_1')))
    })

    it('allows authenticated read of products', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'products', 'prod_1'), {
          name: 'Gold Coin 10g',
          stock: 5
        })
      })

      const authContext = testEnv.authenticatedContext('user_1')
      const db = authContext.firestore()

      await assertSucceeds(getDoc(doc(db, 'products', 'prod_1')))
    })

    it('denies unauthenticated read of locations', async () => {
      const unauthContext = testEnv.unauthenticatedContext()
      const db = unauthContext.firestore()

      await assertFails(getDoc(doc(db, 'locations', 'loc_1')))
    })

    it('allows authenticated read of locations', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'locations', 'loc_1'), {
          name: 'Headquarters'
        })
      })

      const authContext = testEnv.authenticatedContext('user_1')
      const db = authContext.firestore()

      await assertSucceeds(getDoc(doc(db, 'locations', 'loc_1')))
    })
  })
})
