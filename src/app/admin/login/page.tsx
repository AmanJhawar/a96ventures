"use client"

import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
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
    defaultValues: { email: '', password: '' }
  })

  const onSubmit = async (data: LoginValues) => {
    setError('')

    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password)
      
      // Verify they are in the admins collection
      const { doc, getDoc } = await import('firebase/firestore/lite')
      const { db } = await import('@/lib/firebase/config')
      const adminDoc = await getDoc(doc(db, 'admins', userCredential.user.uid))
      
      if (!adminDoc.exists()) {
        const { signOut } = await import('firebase/auth')
        await signOut(auth)
        setError('Unauthorized account. You do not have admin privileges.')
      } else {
        router.push('/admin')
      }
    } catch (err) {
      console.error(err)
      setError('Invalid email or password.')
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
            <label className="block text-sm font-medium text-gray-500 mb-2">Email Address</label>
            <input
              type="email"
              {...register('email')}
              className={`w-full px-4 py-3 rounded-lg border focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-200 ${errors.email ? 'border-gray-900' : 'border-gray-200'}`}
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-gray-500 font-medium text-sm mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-2">Password</label>
            <input
              type="password"
              {...register('password')}
              className={`w-full px-4 py-3 rounded-lg border focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-200 ${errors.password ? 'border-gray-900' : 'border-gray-200'}`}
              placeholder="••••••••"
            />
            {errors.password && <p className="text-gray-500 font-medium text-sm mt-1">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="admin-btn-primary w-full disabled:opacity-70"
          >
            {isSubmitting ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/30 border-t-white"></div> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
