"use client"

import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-black tracking-tight mb-2">Admin</h2>
          <p className="text-sm text-gray-500">Sign in to manage your command center.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-gray-50 text-black rounded-lg text-sm font-semibold text-center border border-gray-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-200"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-200"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-800 transition-colors duration-200 disabled:opacity-70 flex justify-center items-center h-[52px]"
          >
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/30 border-t-white"></div> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
