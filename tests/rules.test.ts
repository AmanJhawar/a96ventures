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

  describe('Customer CRM & Private Data Security Rules', () => {
    it('allows user with cus:v (customers.view) to read customer profiles', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'customers', 'cust_1'), {
          firstName: 'Aman',
          lastName: 'Jhawar'
        })
      })

      const userContext = testEnv.authenticatedContext('cashier_1', {
        role: 'sales_cashier',
        status: 'active',
        perms: ['cus:v', 'cus:a', 'cus:k']
      })
      const db = userContext.firestore()

      await assertSucceeds(getDoc(doc(db, 'customers', 'cust_1')))
    })

    it('denies user without customers.view from reading customer profiles', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'customers', 'cust_1'), {
          firstName: 'Aman',
          lastName: 'Jhawar'
        })
      })

      const userContext = testEnv.authenticatedContext('vault_1', {
        role: 'vault_custodian',
        status: 'active',
        perms: ['prd:v', 'pur:v'] // no cus:v
      })
      const db = userContext.firestore()

      await assertFails(getDoc(doc(db, 'customers', 'cust_1')))
    })

    it('strictly denies client writes to customers collection (Admin SDK only)', async () => {
      const superAdminContext = testEnv.authenticatedContext('admin_1', {
        role: 'super_admin',
        status: 'active'
      })
      const db = superAdminContext.firestore()

      await assertFails(
        setDoc(doc(db, 'customers', 'cust_spoof'), {
          firstName: 'Hacker',
          lastName: 'Test'
        })
      )
    })

    it('cashier cannot read customers/{id}/private/pan (strictly denied to all client access)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'customers', 'cust_1', 'private', 'pan'), {
          ciphertext: 'encrypted_data',
          iv: 'random_iv',
          authTag: 'tag'
        })
      })

      const cashierContext = testEnv.authenticatedContext('cashier_1', {
        role: 'sales_cashier',
        status: 'active',
        perms: ['cus:v', 'cus:a', 'cus:k']
      })
      const db = cashierContext.firestore()

      await assertFails(getDoc(doc(db, 'customers', 'cust_1', 'private', 'pan')))
    })

    it('even super_admin cannot read customers/{id}/private/pan from client (Admin SDK only)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'customers', 'cust_1', 'private', 'pan'), {
          ciphertext: 'encrypted_data'
        })
      })

      const adminContext = testEnv.authenticatedContext('admin_1', {
        role: 'super_admin',
        status: 'active'
      })
      const db = adminContext.firestore()

      await assertFails(getDoc(doc(db, 'customers', 'cust_1', 'private', 'pan')))
    })

    it('nobody can read or write customer_pans from the client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'customer_pans', 'hmac_hash_1'), {
          customerId: 'cust_1'
        })
      })

      const adminContext = testEnv.authenticatedContext('admin_1', {
        role: 'super_admin',
        status: 'active'
      })
      const db = adminContext.firestore()

      await assertFails(getDoc(doc(db, 'customer_pans', 'hmac_hash_1')))
      await assertFails(setDoc(doc(db, 'customer_pans', 'hmac_hash_2'), { customerId: 'cust_2' }))
    })

    it('nobody can read or write customer_mobiles from the client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'customer_mobiles', '+919876543210'), {
          customerId: 'cust_1'
        })
      })

      const cashierContext = testEnv.authenticatedContext('cashier_1', {
        role: 'sales_cashier',
        status: 'active',
        perms: ['cus:v']
      })
      const db = cashierContext.firestore()

      await assertFails(getDoc(doc(db, 'customer_mobiles', '+919876543210')))
      await assertFails(setDoc(doc(db, 'customer_mobiles', '+919876543211'), { customerId: 'cust_2' }))
    })

    it('allows read of orders with sales.view (sal:v) or returns.view (ret:v), denies writes', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'orders', 'order_1'), {
          orderNo: 'A96-2026-000001',
          totals: { amountPaise: 500000 }
        })
      })

      const salesContext = testEnv.authenticatedContext('cashier_1', {
        role: 'sales_cashier',
        status: 'active',
        perms: ['sal:v']
      })
      const db = salesContext.firestore()

      await assertSucceeds(getDoc(doc(db, 'orders', 'order_1')))
      await assertFails(setDoc(doc(db, 'orders', 'order_spoof'), { totals: { amountPaise: 100 } }))
    })

    it('allows read of visits with visits.view (vis:v), denies client writes', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'visits', 'visit_1'), {
          kind: 'walk_in',
          customerId: 'cust_1'
        })
      })

      const visitViewerContext = testEnv.authenticatedContext('staff_1', {
        role: 'store_manager',
        status: 'active',
        perms: ['vis:v']
      })
      const db = visitViewerContext.firestore()

      await assertSucceeds(getDoc(doc(db, 'visits', 'visit_1')))
      await assertFails(setDoc(doc(db, 'visits', 'visit_spoof'), { kind: 'walk_in' }))
    })

    it('strictly denies client access to counters collection', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'counters', '2026'), {
          nextOrderNo: 10
        })
      })

      const superAdminContext = testEnv.authenticatedContext('admin_1', {
        role: 'super_admin',
        status: 'active'
      })
      const db = superAdminContext.firestore()

      await assertFails(getDoc(doc(db, 'counters', '2026')))
      await assertFails(setDoc(doc(db, 'counters', '2026'), { nextOrderNo: 11 }))
    })
  })
})
