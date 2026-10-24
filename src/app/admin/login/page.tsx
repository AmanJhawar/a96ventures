"use client"

import { useState, useEffect, useRef, Suspense } from 'react'
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  MultiFactorResolver,
  MultiFactorError,
  RecaptchaVerifier,
  User
} from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { syncAuthClaims } from '@/lib/services/auth.service'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Shield, KeyRound, ArrowLeft, Clock, CheckCircle2 } from 'lucide-react'

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

function LoginForm() {
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [step, setStep] = useState<'login' | 'forgot' | 'mfa'>('login')
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null)
  const [verificationId, setVerificationId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaHint, setMfaHint] = useState('')
  const [mfaSubmitting, setMfaSubmitting] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const isIdle = searchParams?.get('reason') === 'idle'

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' }
  })

  useEffect(() => {
    if (isIdle && typeof window !== 'undefined') {
      localStorage.removeItem('admin_last_activity')
    }
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear()
        } catch {
          // ignore
        }
      }
    }
  }, [isIdle])

  const verifyAndRedirect = async (user: User) => {
    // TREAT MISSING PROFILE AS AN ERROR: Never fail open or grant access without profile document
    const { doc, getDoc } = await import('firebase/firestore/lite')
    const { db } = await import('@/lib/firebase/config')
    const adminDoc = await getDoc(doc(db, 'admins', user.uid))

    if (!adminDoc.exists()) {
      const { signOut } = await import('firebase/auth')
      await signOut(auth)
      throw new Error('Admin Profile Not Found: No administrator profile document exists for this account. Access is strictly denied.')
    }

    const adminData = adminDoc.data()
    if (!adminData) {
      const { signOut } = await import('firebase/auth')
      await signOut(auth)
      throw new Error('Admin Profile Error: Administrator profile record is empty. Access is strictly denied.')
    }

    if (adminData.status === 'suspended') {
      const { signOut } = await import('firebase/auth')
      await signOut(auth)
      throw new Error('Your user account has been suspended. Please contact a super admin.')
    }

    // Check if user has custom claims, otherwise sync with server
    const tokenResult = await user.getIdTokenResult()
    if (!tokenResult.claims.role) {
      const synced = await syncAuthClaims(tokenResult.token)
      if (synced) {
        await user.getIdTokenResult(true) // Force fresh token with claims
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_last_activity', Date.now().toString())
    }

    router.push('/admin')
  }

  const onSubmit = async (data: LoginValues) => {
    setError('')
    setSuccessMsg('')
    const targetEmail = resolveAdminEmail(data.identifier)

    try {
      const userCredential = await signInWithEmailAndPassword(auth, targetEmail, data.password)
      await verifyAndRedirect(userCredential.user)
    } catch (err: unknown) {
      console.error('Sign in error:', err)
      const authErr = err as { code?: string; message?: string }

      // Handle Multi-Factor Authentication requirement
      if (authErr.code === 'auth/multi-factor-auth-required') {
        try {
          const mfaResolver = getMultiFactorResolver(auth, err as MultiFactorError)
          setResolver(mfaResolver)

          const phoneHint = mfaResolver.hints.find(h => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID) || mfaResolver.hints[0]
          setMfaHint(phoneHint?.displayName || (phoneHint as unknown as { phoneNumber?: string })?.phoneNumber || 'enrolled mobile number')

          if (!recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'login-recaptcha-container', {
              size: 'invisible'
            })
          }

          const phoneAuthProvider = new PhoneAuthProvider(auth)
          const vId = await phoneAuthProvider.verifyPhoneNumber({
            multiFactorHint: phoneHint,
            session: mfaResolver.session
          }, recaptchaVerifierRef.current)

          setVerificationId(vId)
          setStep('mfa')
          return
        } catch (mfaInitErr: unknown) {
          console.error('Failed to initiate MFA challenge:', mfaInitErr)
          const mfaMsg = mfaInitErr instanceof Error ? mfaInitErr.message : 'Failed to start multi-factor verification.'
          setError(mfaMsg)
          return
        }
      }

      setError(authErr.message?.includes('Admin Profile') ? authErr.message : 'Invalid username or password.')
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolver || !verificationId || !mfaCode.trim()) return

    setMfaSubmitting(true)
    setError('')

    try {
      const cred = PhoneAuthProvider.credential(verificationId, mfaCode.trim())
      const assertion = PhoneMultiFactorGenerator.assertion(cred)
      const userCredential = await resolver.resolveSignIn(assertion)
      await verifyAndRedirect(userCredential.user)
    } catch (err: unknown) {
      console.error('MFA completion error:', err)
      const msg = err instanceof Error ? err.message : 'Invalid verification code. Please check and try again.'
      setError(msg)
    } finally {
      setMfaSubmitting(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail.trim()) {
      setError('Please enter your email or username.')
      return
    }

    setForgotSubmitting(true)
    setError('')
    setSuccessMsg('')

    try {
      const email = resolveAdminEmail(forgotEmail)
      await sendPasswordResetEmail(auth, email)
      setSuccessMsg(`Password reset instructions have been dispatched to ${email}. Check your inbox.`)
    } catch (err: unknown) {
      console.error('Password reset error:', err)
      const msg = err instanceof Error ? err.message : 'Unable to send password reset email. Please verify the address.'
      setError(msg)
    } finally {
      setForgotSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div id="login-recaptcha-container"></div>
      <div className="max-w-md w-full bg-white p-10 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.06)] border border-gray-100">

        {/* Idle session timeout warning banner */}
        {isIdle && step === 'login' && (
          <div className="mb-6 p-4 bg-gray-100 border border-gray-300 rounded-lg text-xs text-gray-800 flex items-start gap-2.5">
            <Clock size={16} className="text-gray-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-black">Session Expired</p>
              <p className="mt-0.5 text-gray-600">Session expired after 30m of inactivity.</p>
            </div>
          </div>
        )}

        {/* STEP 1: LOGIN FORM */}
        {step === 'login' && (
          <>
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-black tracking-tight mb-2">Admin</h2>
              <p className="text-sm text-gray-500">Sign in to your account.</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-gray-50 text-black rounded-lg text-sm font-semibold text-center border border-gray-200">
                {error}
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-6">
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-gray-500 mb-2">
                  Email or Username
                </label>
                <input
                  id="identifier"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  {...register('identifier')}
                  className={`w-full px-4 py-3 rounded-lg border focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out)] ${errors.identifier ? 'border-gray-900' : 'border-gray-200'}`}
                  placeholder="user@domain.com"
                />
                {errors.identifier && <p className="text-gray-500 font-medium text-sm mt-1">{errors.identifier.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-500">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(getValues('identifier') || '')
                      setError('')
                      setSuccessMsg('')
                      setStep('forgot')
                    }}
                    className="text-xs text-gray-500 hover:text-black font-medium transition-[color] duration-150"
                  >
                    Forgot Password?
                  </button>
                </div>
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
          </>
        )}

        {/* STEP 2: MULTI-FACTOR AUTHENTICATION (MFA) */}
        {step === 'mfa' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={24} />
              </div>
              <h2 className="text-2xl font-bold text-black tracking-tight">Two-Step Verification</h2>
              <p className="text-xs text-gray-500 mt-1">
                Enter the 6-digit code sent via SMS to {mfaHint}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-gray-50 text-black rounded-lg text-xs font-semibold text-center border border-gray-200">
                {error}
              </div>
            )}

            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 text-center text-2xl tracking-[0.3em] font-mono focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-150"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={mfaSubmitting || mfaCode.length < 6}
                className="admin-btn-primary w-full disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                {mfaSubmitting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/30 border-t-white mx-auto" />
                ) : (
                  'Verify & Continue'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('login')
                  setError('')
                  setResolver(null)
                  setMfaCode('')
                }}
                className="w-full text-center text-xs text-gray-500 hover:text-black font-medium transition-[color] py-1"
              >
                Back to Sign In
              </button>
            </form>
          </div>
        )}

        {/* STEP 3: FORGOT PASSWORD */}
        {step === 'forgot' && (
          <div className="space-y-6">
            <div>
              <button
                type="button"
                onClick={() => {
                  setStep('login')
                  setError('')
                  setSuccessMsg('')
                }}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-black font-medium transition-[color] mb-4"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
              <div className="text-center">
                <div className="w-12 h-12 bg-gray-100 text-black rounded-full flex items-center justify-center mx-auto mb-3">
                  <KeyRound size={22} />
                </div>
                <h2 className="text-2xl font-bold text-black tracking-tight">Reset Password</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Enter your email to receive a recovery link.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-gray-50 text-black rounded-lg text-xs font-semibold text-center border border-gray-200">
                {error}
              </div>
            )}

            {successMsg ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center space-y-3">
                <CheckCircle2 size={24} className="text-black mx-auto" />
                <p className="text-xs text-gray-800 leading-relaxed font-medium">{successMsg}</p>
                <button
                  type="button"
                  onClick={() => {
                    setStep('login')
                    setError('')
                    setSuccessMsg('')
                  }}
                  className="admin-btn-primary w-full text-xs py-2 mt-2"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email or Username
                  </label>
                  <input
                    type="text"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="user@domain.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-black focus:ring-4 focus:ring-black/10 transition-[border-color,box-shadow] duration-150 text-sm"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotSubmitting || !forgotEmail.trim()}
                  className="admin-btn-primary w-full disabled:opacity-50 transition-[background-color,transform] duration-150 active:scale-[0.97]"
                >
                  {forgotSubmitting ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/30 border-t-white mx-auto" />
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default function AdminLogin() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
