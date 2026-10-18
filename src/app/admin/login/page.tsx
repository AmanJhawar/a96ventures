"use client"

import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const DEFAULT_ADMIN_DOMAIN = 'a96ventures.com'

function resolveAdminEmail(input: string): string {
  const trimmed = input.trim().toLowerCase()
  if (trimmed.includes('@')) {
    return trimmed
  }
  return `${trimmed}@${DEFAULT_ADMIN_DOMAIN}`
}

const loginSchema = z.object({
  identifier: z.string().min(1, 'Please enter your username or email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
}).refine(data => {
  const resolved = resolveAdminEmail(data.identifier)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolved)
}, {
  message: 'Please enter a valid username or email address',
  path: ['identifier']
})

type LoginValues = z.infer<typeof loginSchema>

export default function AdminLogin() {
  const [error, setError] = useState('')
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' }
  })

  const onSubmit = async (data: LoginValues) => {
    setError('')
    const targetEmail = resolveAdminEmail(data.identifier)

    try {
      const userCredential = await signInWithEmailAndPassword(auth, targetEmail, data.password)
      
      // Verify they are in the admins collection
      // TREAT MISSING PROFILE AS AN ERROR: Never fail open or grant access without profile document
      const { doc, getDoc } = await import('firebase/firestore/lite')
      const { db } = await import('@/lib/firebase/config')
      const adminDoc = await getDoc(doc(db, 'admins', userCredential.user.uid))
      
      if (!adminDoc.exists()) {
        const { signOut } = await import('firebase/auth')
        await signOut(auth)
        setError('Admin Profile Not Found: No administrator profile document exists for this account. Access is strictly denied.')
        return
      }

      const adminData = adminDoc.data()
      if (!adminData) {
        const { signOut } = await import('firebase/auth')
        await signOut(auth)
        setError('Admin Profile Error: Administrator profile record is empty. Access is strictly denied.')
        return
      }

      if (adminData.status === 'suspended') {
        const { signOut } = await import('firebase/auth')
        await signOut(auth)
        setError('Your user account has been suspended. Please contact a super admin.')
        return
      }

      // Check if user has custom claims, otherwise sync with server
      const tokenResult = await userCredential.user.getIdTokenResult()
      if (!tokenResult.claims.role) {
        try {
          await fetch('/api/admin/auth/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenResult.token}`
            }
          })
          await userCredential.user.getIdTokenResult(true) // Force fresh token with claims
        } catch (syncErr) {
          console.warn('Sync claims warning:', syncErr)
        }
      }

      router.push('/admin')
    } catch (err) {
      console.error(err)
      setError('Invalid username or password.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-10 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.06)] border border-gray-100">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-black tracking-tight mb-2">Admin</h2>
          <p className="text-sm text-gray-500">Sign in to manage your command center.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-gray-50 text-black rounded-lg text-sm font-semibold text-center border border-gray-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-500 mb-2">
              Username or Email
            </label>
            <input
              id="identifier"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...register('identifier')}
              className={`w-full px-4 py-3 rounded-lg border focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out)] ${errors.identifier ? 'border-gray-900' : 'border-gray-200'}`}
              placeholder="e.g. aman or aman@a96ventures.com"
            />
            {errors.identifier && <p className="text-gray-500 font-medium text-sm mt-1">{errors.identifier.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-500 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              {...register('password')}
              className={`w-full px-4 py-3 rounded-lg border focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out)] ${errors.password ? 'border-gray-900' : 'border-gray-200'}`}
              placeholder="••••••••"
            />
            {errors.password && <p className="text-gray-500 font-medium text-sm mt-1">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="admin-btn-primary w-full disabled:opacity-70 transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
          >
            {isSubmitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/30 border-t-white mx-auto"></div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
